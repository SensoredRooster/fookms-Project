export class OrderInputError extends Error {}
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value: unknown) => String(value ?? "").trim();

export async function createOrder(database: D1Database, body: Record<string, unknown>, source: "online" | "phone" | "walk_in", forcedStationId?: number) {
  const stationId = forcedStationId || positive(body.stationId);
  const requestedBy = clean(body.requestedBy), note = clean(body.note);
  const contactEmail = clean(body.contactEmail), contactPhone = clean(body.contactPhone);
  const raw = Array.isArray(body.lines) ? body.lines : [];
  const lines = raw.map((line: unknown) => {
    const value = line && typeof line === "object" ? line as Record<string, unknown> : {};
    return { itemId: positive(value.itemId), quantity: positive(value.quantity) };
  });
  if (!stationId || !lines.length || lines.length > 50 || lines.some(l => !l.itemId || !l.quantity) || new Set(lines.map(l => l.itemId)).size !== lines.length) throw new OrderInputError("Choose a station and at least one valid item and quantity.");
  if (!requestedBy || requestedBy.length > 100 || note.length > 500 || contactEmail.length > 150 || contactPhone.length > 40) throw new OrderInputError("Enter valid contact and order details.");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new OrderInputError("Enter a valid email address.");
  if (source === "online" && !contactEmail && !contactPhone) throw new OrderInputError("Enter an email address or phone number so we can reach you.");
  if (!await database.prepare("SELECT id FROM stations WHERE id = ?").bind(stationId).first()) throw new OrderInputError("Station not found.");
  const existing = await database.prepare("SELECT id FROM items WHERE id IN (" + lines.map(() => "?").join(",") + ")").bind(...lines.map(l => l.itemId)).all();
  if (existing.results.length !== lines.length) throw new OrderInputError("One or more items are no longer available.");
  const number = "ORD-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("INSERT INTO orders (number, station_id, requested_by, source, contact_email, contact_phone, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)").bind(number, stationId, requestedBy, source, contactEmail, contactPhone, note, now, now),
    ...lines.map(l => database.prepare("INSERT INTO order_lines (order_id, item_id, quantity) SELECT id, ?, ? FROM orders WHERE number = ?").bind(l.itemId, l.quantity, number)),
  ]);
  return number;
}
