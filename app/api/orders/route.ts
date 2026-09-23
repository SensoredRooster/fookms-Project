import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isStaff } from "@/app/staff-auth";
import { createOrder, OrderInputError } from "@/app/order-create";

export const dynamic = "force-dynamic";
const db = () => {
  if (!env.DB) throw new Error("Order database is unavailable");
  return env.DB;
};
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request) {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const database = db();
    const detailId = new URL(request.url).searchParams.get("orderId");
    if (detailId !== null) {
      const orderId = positive(detailId);
      if (!orderId) return fail("Invalid order ID.");
      const events = await database.prepare("SELECT id, order_id AS orderId, item_id AS itemId, type, from_station_id AS fromStationId, to_station_id AS toStationId, created_at AS createdAt FROM order_line_events WHERE order_id=? ORDER BY id ASC").bind(orderId).all();
      return NextResponse.json({ events: events.results });
    }
    const [orders, lines] = await Promise.all([
      database.prepare("SELECT id, number, station_id AS stationId, requested_by AS requestedBy, source, contact_email AS contactEmail, contact_phone AS contactPhone, note, status, created_at AS createdAt, updated_at AS updatedAt FROM orders ORDER BY id DESC LIMIT 250").all(),
      database.prepare("SELECT l.order_id AS orderId, l.item_id AS itemId, l.quantity, COALESCE(l.current_station_id, o.station_id) AS currentStationId, l.action_done AS actionDone, l.completed_at AS completedAt FROM order_lines l JOIN (SELECT id, station_id FROM orders ORDER BY id DESC LIMIT 250) o ON o.id = l.order_id ORDER BY l.order_id DESC").all(),
    ]);
    return NextResponse.json({ orders: orders.results, lines: lines.results });
  } catch (error) {
    console.error(error);
    return fail("Orders are temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    const body = await request.json() as Record<string, unknown>;
    const database = db();
    if (body.action === "create") {
      if (body.source !== "phone" && body.source !== "walk_in") return fail("Choose phone or walk-in as the order source.");
      const number = await createOrder(database, body, body.source);
      return NextResponse.json({ ok: true, number });
    }
    if (body.action === "status") {
      const orderId = positive(body.orderId), status = clean(body.status);
      if (!orderId || !["processing", "cancelled"].includes(status)) return fail("Invalid order update.");
      const old = await database.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first<{ status: string }>();
      if (!old) return fail("Order not found.", 404);
      if (!((old.status === "received" && ["processing", "cancelled"].includes(status)) || (old.status === "processing" && status === "cancelled"))) return fail("This order can no longer make that status change.", 409);
      if (status === "cancelled" && await database.prepare("SELECT 1 FROM order_lines WHERE order_id=? AND completed_at IS NOT NULL LIMIT 1").bind(orderId).first()) return fail("This order has completed items and cannot be cancelled.", 409);
      const result = await database.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?").bind(status, new Date().toISOString(), orderId, old.status).run();
      if (!result.meta.changes) return fail("Order changed while you were working. Refresh and try again.", 409);
      return NextResponse.json({ ok: true });
    }
    if (["mark_step", "handoff", "complete_line"].includes(String(body.action))) {
      const orderId = positive(body.orderId), itemId = positive(body.itemId), expectedStationId = positive(body.currentStationId);
      if (!orderId || !itemId || !expectedStationId) return fail("Choose an order item and workstation.");
      const line = await database.prepare("SELECT l.action_done AS actionDone, l.completed_at AS completedAt, COALESCE(l.current_station_id, o.station_id) AS currentStationId, o.status FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE l.order_id=? AND l.item_id=?").bind(orderId, itemId).first<{ actionDone: number; completedAt: string | null; currentStationId: number; status: string }>();
      if (!line) return fail("Order item not found.", 404);
      if (line.status !== "processing" || line.completedAt || line.currentStationId !== expectedStationId) return fail("This item has changed. Refresh the order.", 409);
      if (body.action === "mark_step") {
        if (line.actionDone) return fail("This station step is already recorded.", 409);
        const result = await database.prepare("UPDATE order_lines SET action_done=1 WHERE order_id=? AND item_id=? AND action_done=0 AND completed_at IS NULL AND COALESCE(current_station_id, (SELECT station_id FROM orders WHERE id=?))=? AND (SELECT status FROM orders WHERE id=?)='processing'").bind(orderId,itemId,orderId,expectedStationId,orderId).run();
        if (!result.meta.changes) return fail("Item changed. Refresh the order.",409);
      } else if (body.action === "handoff") {
        const next = positive(body.nextStationId);
        if (!line.actionDone || !next || next === expectedStationId) return fail("Complete the current station step and choose a different station.");
        if (!await database.prepare("SELECT id FROM stations WHERE id=?").bind(next).first()) return fail("Next station not found.");
        const result = await database.prepare("UPDATE order_lines SET current_station_id=?, action_done=0 WHERE order_id=? AND item_id=? AND action_done=1 AND completed_at IS NULL AND COALESCE(current_station_id, (SELECT station_id FROM orders WHERE id=?))=? AND (SELECT status FROM orders WHERE id=?)='processing'").bind(next,orderId,itemId,orderId,expectedStationId,orderId).run();
        if (!result.meta.changes) return fail("Item changed. Refresh the order.",409);
      } else {
        if (!line.actionDone) return fail("Complete the station step before finishing this item.");
        const result = await database.prepare("UPDATE order_lines SET completed_at=? WHERE order_id=? AND item_id=? AND action_done=1 AND completed_at IS NULL AND COALESCE(current_station_id, (SELECT station_id FROM orders WHERE id=?))=? AND (SELECT status FROM orders WHERE id=?)='processing'").bind(new Date().toISOString(),orderId,itemId,orderId,expectedStationId,orderId).run();
        if (!result.meta.changes) return fail("Item changed. Refresh the order.",409);
      }
      return NextResponse.json({ ok: true });
    }
    return fail("Unknown order action.");
  } catch (error) {
    if (error instanceof OrderInputError) return fail(error.message);
    console.error(error);
    const message = String(error);
    if (message.includes("Insufficient station stock") || message.includes("quantity_nonnegative")) return fail("This station does not have enough stock to fulfill the order.", 409);
    if (message.includes("Station step incomplete") || message.includes("Order is not processing")) return fail("This station step must be completed first. Refresh the order.", 409);
    if (message.includes("Invalid order status transition")) return fail("Order changed while you were working. Refresh and try again.", 409);
    return fail("Could not save the order. Please try again.", 503);
  }
}
