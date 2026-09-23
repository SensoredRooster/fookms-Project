import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isStaff } from "@/app/staff-auth";

export const dynamic = "force-dynamic";
const db = () => {
  if (!env.DB) throw new Error("Inventory database is unavailable");
  return env.DB;
};
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const amount = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value: unknown) => String(value ?? "").trim();

export async function GET() {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const database = db();
    const [stations, items, stock, movements] = await Promise.all([
      database.prepare("SELECT id, name, location, action, online_intake AS onlineIntake FROM stations ORDER BY name").all(),
      database.prepare("SELECT id, name, sku, unit, threshold FROM items ORDER BY name").all(),
      database.prepare("SELECT station_id AS stationId, item_id AS itemId, quantity FROM stock").all(),
      database.prepare("SELECT m.id, m.item_id AS itemId, m.from_station_id AS fromStationId, m.to_station_id AS toStationId, m.quantity, m.note, m.created_at AS createdAt, m.order_id AS orderId FROM movements m ORDER BY m.id DESC LIMIT 100").all(),
    ]);
    return NextResponse.json({ stations: stations.results, items: items.results, stock: stock.results, movements: movements.results });
  } catch (error) {
    console.error(error);
    return fail("Inventory is temporarily unavailable. Please try again.", 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const body = await request.json() as Record<string, unknown>;
    const database = db();
    if (body.action === "station") {
      const name = clean(body.name), location = clean(body.location), action = clean(body.stationAction), onlineIntake = body.onlineIntake === true || body.onlineIntake === "true";
      if (!name || name.length > 80 || location.length > 120 || action.length > 160) return fail("Enter a station name and a short description of its work.");
      const changes = [database.prepare("INSERT INTO stations (name, location, action) VALUES (?, ?, ?)").bind(name, location, action)];
      if (onlineIntake) changes.push(database.prepare("UPDATE stations SET online_intake=0 WHERE online_intake=1"), database.prepare("UPDATE stations SET online_intake=1 WHERE name=?").bind(name));
      await database.batch(changes);
    } else if (body.action === "station_edit") {
      const stationId = id(body.stationId), name = clean(body.name), location = clean(body.location), action = clean(body.stationAction), onlineIntake = body.onlineIntake === true || body.onlineIntake === "true";
      if (!stationId || !name || name.length > 80 || location.length > 120 || action.length > 160) return fail("Enter valid station details.");
      const changes = onlineIntake ? [database.prepare("UPDATE stations SET online_intake=0 WHERE online_intake=1")] : [];
      changes.push(database.prepare("UPDATE stations SET name=?, location=?, action=?, online_intake=? WHERE id=?").bind(name, location, action, onlineIntake ? 1 : 0, stationId));
      const result = await database.batch(changes);
      const updated = result[result.length - 1];
      if (!updated.meta.changes) return fail("Station not found.", 404);
    } else if (body.action === "item") {
      const name = clean(body.name), sku = clean(body.sku), unit = clean(body.unit) || "each";
      const threshold = Number(body.threshold);
      if (!name || !sku || name.length > 100 || sku.length > 60 || unit.length > 30 || !Number.isSafeInteger(threshold) || threshold < 0) return fail("Enter a name, SKU, and valid low stock level.");
      await database.prepare("INSERT INTO items (name, sku, unit, threshold) VALUES (?, ?, ?, ?)").bind(name, sku, unit, threshold).run();
    } else if (body.action === "receive" || body.action === "use" || body.action === "transfer") {
      const itemId = id(body.itemId), from = id(body.fromStationId), to = id(body.toStationId), quantity = amount(body.quantity), note = clean(body.note);
      if (!itemId || !quantity || note.length > 200) return fail("Choose an item and a positive whole number quantity.");
      if ((body.action === "receive" && !to) || (body.action === "use" && !from) || (body.action === "transfer" && (!from || !to || from === to))) return fail("Choose valid source and destination stations.");
      const item = await database.prepare("SELECT id FROM items WHERE id = ?").bind(itemId).first();
      if (!item) return fail("That item no longer exists.");
      for (const stationId of [from, to].filter(Boolean)) {
        if (!await database.prepare("SELECT id FROM stations WHERE id = ?").bind(stationId).first()) return fail("That station no longer exists.");
      }
      const changes = [];
      if (from) {
        changes.push(database.prepare("UPDATE stock SET quantity = quantity - ? WHERE station_id = ? AND item_id = ?").bind(quantity, from, itemId));
      }
      if (to) {
        changes.push(database.prepare("INSERT INTO stock (station_id, item_id, quantity) VALUES (?, ?, ?) ON CONFLICT(station_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity").bind(to, itemId, quantity));
      }
      // A nonnegative database constraint aborts the whole batch if stock was used concurrently.
      if (from) {
        const available = await database.prepare("SELECT quantity FROM stock WHERE station_id = ? AND item_id = ?").bind(from, itemId).first<{ quantity: number }>();
        if (!available || available.quantity < quantity) return fail("There is not enough stock at the source station.");
      }
      changes.push(database.prepare("INSERT INTO movements (item_id, from_station_id, to_station_id, quantity, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(itemId, from, to, quantity, note, new Date().toISOString()));
      const result = await database.batch(changes);
      if (from && !result[0].meta.changes) return fail("Stock changed during this request. Refresh and try again.", 409);
    } else return fail("Unknown action.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const message = String(error);
    if (message.includes("UNIQUE constraint")) return fail("That station name or SKU is already in use.");
    return fail("Could not save the change. Please try again.", 503);
  }
}
