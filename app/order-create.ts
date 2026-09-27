export class OrderInputError extends Error {}
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value: unknown) => String(value ?? "").trim();

type OrderLineInput = { itemId: number; quantity: number; cutLengthInches: number | null };
type OrderFields = { stationId: number; requestedBy: string; purchaseOrderNumber: string; note: string; contactEmail: string; contactPhone: string; lines: OrderLineInput[] };

async function validateOrder(database: D1Database, body: Record<string, unknown>, source: "online" | "phone" | "walk_in", forcedStationId?: number): Promise<OrderFields> {
  const stationId = forcedStationId || positive(body.stationId);
  const requestedBy = clean(body.requestedBy), purchaseOrderNumber = clean(body.purchaseOrderNumber), note = clean(body.note);
  const contactEmail = clean(body.contactEmail), contactPhone = clean(body.contactPhone);
  const raw = Array.isArray(body.lines) ? body.lines : [];
  const lines = raw.map((line: unknown) => {
    const value = line && typeof line === "object" ? line as Record<string, unknown> : {};
    const length = value.cutLengthInches === "" || value.cutLengthInches == null ? null : Number(value.cutLengthInches);
    return { itemId: positive(value.itemId), quantity: positive(value.quantity), cutLengthInches: length };
  });
  if (!stationId || !lines.length || lines.length > 50 || lines.some(l => !l.itemId || !l.quantity) || new Set(lines.map(l => l.itemId)).size !== lines.length) throw new OrderInputError("Choose a station and at least one valid item and quantity.");
  if (lines.some(l => l.cutLengthInches !== null && (!Number.isFinite(l.cutLengthInches) || l.cutLengthInches <= 0 || l.cutLengthInches > 1000000 || Math.abs(Math.round(l.cutLengthInches * 1000) - l.cutLengthInches * 1000) > 1e-7))) throw new OrderInputError("Cut length must be a positive number of inches with up to three decimal places.");
  if (!requestedBy || requestedBy.length > 100 || purchaseOrderNumber.length > 80 || note.length > 500 || contactEmail.length > 150 || contactPhone.length > 40) throw new OrderInputError("Enter valid contact, PO, and order details.");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new OrderInputError("Enter a valid email address.");
  if (source === "online" && !contactEmail && !contactPhone) throw new OrderInputError("Enter an email address or phone number so we can reach you.");
  if (!await database.prepare("SELECT id FROM stations WHERE id = ?").bind(stationId).first()) throw new OrderInputError("Station not found.");
  const existing = await database.prepare("SELECT id FROM items WHERE id IN (" + lines.map(() => "?").join(",") + ")").bind(...lines.map(l => l.itemId)).all();
  if (existing.results.length !== lines.length) throw new OrderInputError("One or more items are no longer available.");
  return { stationId, requestedBy, purchaseOrderNumber, note, contactEmail, contactPhone, lines: lines as OrderLineInput[] };
}

export async function createOrder(database: D1Database, body: Record<string, unknown>, source: "online" | "phone" | "walk_in", forcedStationId?: number) {
  const fields = await validateOrder(database, body, source, forcedStationId);
  const { stationId, requestedBy, purchaseOrderNumber, note, contactEmail, contactPhone, lines } = fields;
  const number = "ORD-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("INSERT INTO orders (number, station_id, requested_by, purchase_order_number, source, contact_email, contact_phone, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)").bind(number, stationId, requestedBy, purchaseOrderNumber, source, contactEmail, contactPhone, note, now, now),
    ...lines.map(l => database.prepare("INSERT INTO order_lines (order_id, item_id, quantity, cut_length_inches) SELECT id, ?, ?, ? FROM orders WHERE number = ?").bind(l.itemId, l.quantity, l.cutLengthInches, number)),
  ]);
  return number;
}

export async function updateOrder(database: D1Database, body: Record<string, unknown>) {
  const orderId = positive(body.orderId), expectedUpdatedAt = clean(body.expectedUpdatedAt);
  if (!orderId || !expectedUpdatedAt) throw new OrderInputError("Refresh the order before editing it.");
  const current = await database.prepare("SELECT number, source, status, updated_at AS updatedAt FROM orders WHERE id=?").bind(orderId).first<{ number: string; source: string; status: string; updatedAt: string }>();
  if (!current) throw new OrderInputError("Order not found.");
  if (!["received", "processing"].includes(current.status)) throw new OrderInputError("This order can no longer be edited.");
  if (await database.prepare("SELECT 1 FROM order_line_events WHERE order_id=? LIMIT 1").bind(orderId).first()) throw new OrderInputError("A station has started work on this order. Its items can no longer be edited.");
  if (current.updatedAt !== expectedUpdatedAt) throw new OrderInputError("The order changed. Refresh it before editing.");
  const fields = await validateOrder(database, body, current.source as "online" | "phone" | "walk_in");
  const { stationId, requestedBy, purchaseOrderNumber, note, contactEmail, contactPhone, lines } = fields;
  const now = new Date().toISOString();
  const results = await database.batch([
    database.prepare("UPDATE orders SET station_id=?, requested_by=?, purchase_order_number=?, contact_email=?, contact_phone=?, note=?, updated_at=? WHERE id=? AND updated_at=? AND status IN ('received','processing') AND NOT EXISTS (SELECT 1 FROM order_line_events WHERE order_id=?)").bind(stationId, requestedBy, purchaseOrderNumber, contactEmail, contactPhone, note, now, orderId, expectedUpdatedAt, orderId),
    database.prepare("DELETE FROM order_lines WHERE order_id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND updated_at=?)").bind(orderId, orderId, now),
    ...lines.map(l => database.prepare("INSERT INTO order_lines (order_id,item_id,quantity,cut_length_inches) SELECT id,?,?,? FROM orders WHERE id=? AND updated_at=?").bind(l.itemId, l.quantity, l.cutLengthInches, orderId, now)),
  ]);
  if (!results[0].meta.changes) throw new OrderInputError("The order changed. Refresh it before editing.");
  return current.number;
}
