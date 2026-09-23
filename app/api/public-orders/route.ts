import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { createOrder, OrderInputError } from "@/app/order-create";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const text = await request.text();
    if (text.length > 30000) return fail("Order is too large.");
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid order.");
    // A hidden field discards simple automated submissions.
    if (body.website) return NextResponse.json({ ok: true, number: "REQUEST-RECEIVED" });
    const station = await env.DB.prepare("SELECT id FROM stations WHERE online_intake=1 LIMIT 1").first<{ id: number }>();
    if (!station) return fail("Online ordering is not available yet.", 503);
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("public-order:" + ip));
    const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const now = Math.floor(Date.now() / 1000);
    const limit = await env.DB.prepare("INSERT INTO order_submission_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END WHERE expires_at<=? OR count<5").bind(key, now+900, now, now, now+900, now).run();
    if (!limit.meta.changes) return fail("Too many order requests. Please try again in 15 minutes.", 429);
    const number = await createOrder(env.DB, body, "online", station.id);
    return NextResponse.json({ ok: true, number }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OrderInputError) return fail(error.message);
    console.error(error);
    return fail("Could not submit the order. Please try again.", 503);
  }
}
