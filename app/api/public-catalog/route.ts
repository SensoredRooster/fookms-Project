import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const [items, station] = await Promise.all([
      env.DB.prepare("SELECT id, name, sku, unit FROM items ORDER BY name").all(),
      env.DB.prepare("SELECT id FROM stations WHERE online_intake=1 LIMIT 1").first(),
    ]);
    return NextResponse.json({ items: items.results, accepting: !!station }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ordering is temporarily unavailable." }, { status: 503 });
  }
}
