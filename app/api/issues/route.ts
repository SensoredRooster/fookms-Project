import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwnerUser, isStaffUser } from "@/app/staff-auth";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const screens = new Set(["home", "floor", "orders", "inventory", "stations", "catalog", "customers", "issues"]);
const severities = new Set(["low", "normal", "high"]);

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!isStaffUser(user) || !user) return fail("Staff access required.", 403);
    if (!env.DB) throw new Error("Issue database unavailable");
    const owner = isOwnerUser(user);
    const statement = owner
      ? env.DB.prepare("SELECT id, reporter_email AS reporterEmail, title, details, steps, screen, severity, status, created_at AS createdAt, updated_at AS updatedAt FROM issue_reports ORDER BY id DESC LIMIT 200")
      : env.DB.prepare("SELECT id, reporter_email AS reporterEmail, title, details, steps, screen, severity, status, created_at AS createdAt, updated_at AS updatedAt FROM issue_reports WHERE reporter_id=? ORDER BY id DESC LIMIT 200").bind(user.userId);
    const result = await statement.all();
    return NextResponse.json({ issues: result.results, owner }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return fail("Could not load issue notes.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!isStaffUser(user) || !user) return fail("Staff access required.", 403);
    if (!env.DB) throw new Error("Issue database unavailable");
    const raw = await request.text();
    if (raw.length > 12000) return fail("Note is too long.");
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid note.");
    if (body.action === "status") {
      if (!isOwnerUser(user)) return fail("Only the owner can update issue status.", 403);
      const id = Number(body.id), status = clean(body.status);
      if (!Number.isSafeInteger(id) || id < 1 || !["open", "resolved"].includes(status)) return fail("Invalid issue update.");
      const result = await env.DB.prepare("UPDATE issue_reports SET status=?, updated_at=? WHERE id=?").bind(status, new Date().toISOString(), id).run();
      if (!result.meta.changes) return fail("Issue not found.", 404);
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "create") return fail("Unknown issue action.");
    const title = clean(body.title), details = clean(body.details), steps = clean(body.steps);
    const screen = clean(body.screen), severity = clean(body.severity);
    if (!title || title.length > 120 || !details || details.length > 4000 || steps.length > 2000 || !screens.has(screen) || !severities.has(severity)) return fail("Add a title, details, and a valid screen and priority.");
    const now = new Date().toISOString();
    const result = await env.DB.prepare("INSERT INTO issue_reports(reporter_id,reporter_email,title,details,steps,screen,severity,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',?,?)")
      .bind(user.userId, user.email.trim(), title, details, steps, screen, severity, now, now).run();
    return NextResponse.json({ ok: true, id: result.meta.last_row_id });
  } catch (error) {
    if (error instanceof SyntaxError) return fail("Invalid issue note.");
    console.error(error);
    return fail("Could not save issue note.", 503);
  }
}
