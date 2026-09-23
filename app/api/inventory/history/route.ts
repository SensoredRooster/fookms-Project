import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isStaff } from "@/app/staff-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await isStaff()) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  const url = new URL(request.url);
  const itemId = Number(url.searchParams.get("itemId"));
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(itemId) || itemId < 1 || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid history request" }, { status: 400 });
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const result = await env.DB.prepare("SELECT id, item_id AS itemId, from_station_id AS fromStationId, to_station_id AS toStationId, quantity, note, created_at AS createdAt, order_id AS orderId FROM movements WHERE item_id = ? ORDER BY id DESC LIMIT 51 OFFSET ?").bind(itemId, offset).all();
    return NextResponse.json({ movements: result.results.slice(0, 50), hasMore: result.results.length > 50 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not load item history." }, { status: 503 });
  }
}
