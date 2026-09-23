import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isStaff } from "@/app/staff-auth";
export const dynamic = "force-dynamic";
const db = () => { if (!env.DB) throw new Error("Floor database unavailable"); return env.DB; };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const int = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const positive = (value: unknown) => { const n = int(value); return n !== null && n > 0 ? n : null; };
const allowedKind = (value: unknown) => ["room", "aisle", "wall"].includes(String(value)) ? String(value) : null;
type Bounds = { width: number; height: number };
async function dimensions(database: D1Database): Promise<Bounds> {
  return await database.prepare("SELECT width,height FROM floor_settings WHERE id=1").first<Bounds>() || { width: 80, height: 50 };
}
function validRect(x: number | null, y: number | null, width: number | null, height: number | null, floor: Bounds) {
  return x !== null && y !== null && width !== null && height !== null && x >= 0 && y >= 0 && width >= 1 && height >= 1 && x + width <= floor.width && y + height <= floor.height;
}
export async function GET() {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const database = db();
    const [settings, features, stations] = await Promise.all([
      dimensions(database),
      database.prepare("SELECT id,name,kind,x,y,width,height FROM floor_features ORDER BY id").all(),
      database.prepare("SELECT s.id,s.name,s.action,s.floor_x AS x,s.floor_y AS y,s.floor_w AS width,s.floor_h AS height, (SELECT COUNT(*) FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.status IN ('received','processing') AND l.completed_at IS NULL AND COALESCE(l.current_station_id,o.station_id)=s.id) AS activeItems FROM stations s ORDER BY s.name").all(),
    ]);
    return NextResponse.json({ settings, features: features.results, stations: stations.results });
  } catch (error) { console.error(error); return fail("Could not load floor plan.", 503); }
}
export async function POST(request: Request) {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const database = db();
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "settings") {
      const width = int(body.width), height = int(body.height);
      if (width === null || height === null || width < 20 || width > 300 || height < 20 || height > 200) return fail("Floor size must be 20–300 feet wide and 20–200 feet deep.");
      const beyond = await database.prepare("SELECT 1 FROM stations WHERE floor_x>=0 AND (floor_x+floor_w>? OR floor_y+floor_h>?) UNION SELECT 1 FROM floor_features WHERE x+width>? OR y+height>? LIMIT 1").bind(width,height,width,height).first();
      if (beyond) return fail("Move elements inside the new floor size before shrinking it.");
      await database.prepare("INSERT INTO floor_settings(id,width,height) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET width=excluded.width,height=excluded.height").bind(width,height).run();
    } else if (body.action === "station_position") {
      const stationId = positive(body.stationId), x = int(body.x), y = int(body.y), width = int(body.width), height = int(body.height);
      const floor = await dimensions(database);
      if (!stationId || width === null || height === null || width < 2 || height < 2 || width > 60 || height > 60 || !((x === -1 && y === -1) || validRect(x,y,width,height,floor))) return fail("Choose a position and footprint inside the floor.");
      const result = await database.prepare("UPDATE stations SET floor_x=?,floor_y=?,floor_w=?,floor_h=? WHERE id=?").bind(x,y,width,height,stationId).run();
      if (!result.meta.changes) return fail("Station not found.",404);
    } else if (body.action === "feature_create" || body.action === "feature_update") {
      const featureId = body.action === "feature_update" ? positive(body.featureId) : null;
      const name = String(body.name ?? "").trim(), kind = allowedKind(body.kind);
      const x = int(body.x), y = int(body.y), width = int(body.width), height = int(body.height);
      if ((body.action === "feature_update" && !featureId) || !name || name.length > 80 || !kind || !validRect(x,y,width,height,await dimensions(database))) return fail("Enter an area name, type, and dimensions inside the floor.");
      if (body.action === "feature_create") await database.prepare("INSERT INTO floor_features(name,kind,x,y,width,height) VALUES(?,?,?,?,?,?)").bind(name,kind,x,y,width,height).run();
      else {
        const result = await database.prepare("UPDATE floor_features SET name=?,kind=?,x=?,y=?,width=?,height=? WHERE id=?").bind(name,kind,x,y,width,height,featureId).run();
        if (!result.meta.changes) return fail("Area not found.",404);
      }
    } else if (body.action === "feature_delete") {
      const featureId = positive(body.featureId);
      if (!featureId) return fail("Choose an area.");
      await database.prepare("DELETE FROM floor_features WHERE id=?").bind(featureId).run();
    } else return fail("Unknown floor action.");
    return NextResponse.json({ ok: true });
  } catch (error) { console.error(error); return fail("Could not save floor plan. Try again.",503); }
}
