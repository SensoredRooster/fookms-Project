import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { isStaff } from "@/app/staff-auth";

export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const clean = (value: unknown) => String(value ?? "").trim();
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export async function GET() {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    if (!env.DB) throw new Error("Customer database unavailable");
    const result = await env.DB.prepare(`
      SELECT id,
        customer_name AS customerName,
        customer_address AS customerAddress,
        customer_city AS customerCity,
        customer_state AS customerState,
        customer_zip AS customerZip,
        ship_to AS shipTo,
        ship_to_address AS shipToAddress,
        ship_to_city AS shipToCity,
        ship_to_state AS shipToState,
        ship_to_zip AS shipToZip,
        contact_name AS contactName,
        contact_phone AS contactPhone,
        email,
        comments,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM customers
      ORDER BY customer_name COLLATE NOCASE
    `).all();
    return NextResponse.json({ customers: result.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return fail("Could not load customers.", 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!await isStaff()) return fail("Staff access required.", 403);
    if (!env.DB) throw new Error("Customer database unavailable");
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action);
    const id = positive(body.id);
    const customerName = clean(body.customerName);
    const customerAddress = clean(body.customerAddress);
    const customerCity = clean(body.customerCity);
    const customerState = clean(body.customerState);
    const customerZip = clean(body.customerZip);
    const shipTo = clean(body.shipTo);
    const shipToAddress = clean(body.shipToAddress);
    const shipToCity = clean(body.shipToCity);
    const shipToState = clean(body.shipToState);
    const shipToZip = clean(body.shipToZip);
    const contactName = clean(body.contactName);
    const contactPhone = clean(body.contactPhone);
    const email = clean(body.email);
    const comments = clean(body.comments);
    if (!customerName || customerName.length > 160) return fail("Customer name is required.");
    if ([customerAddress,customerCity,customerState,customerZip,shipTo,shipToAddress,shipToCity,shipToState,shipToZip,contactName,contactPhone,email].some(v => v.length > 200) || comments.length > 4000) return fail("One or more customer fields are too long.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
    const now = new Date().toISOString();
    if (action === "create") {
      const result = await env.DB.prepare(`
        INSERT INTO customers (
          customer_name, customer_address, customer_city, customer_state, customer_zip,
          ship_to, ship_to_address, ship_to_city, ship_to_state, ship_to_zip,
          contact_name, contact_phone, email, comments, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(customerName,customerAddress,customerCity,customerState,customerZip,shipTo,shipToAddress,shipToCity,shipToState,shipToZip,contactName,contactPhone,email,comments,now,now).run();
      return NextResponse.json({ ok: true, id: result.meta.last_row_id });
    }
    if (action === "update") {
      if (!id) return fail("Choose a customer to update.");
      const result = await env.DB.prepare(`
        UPDATE customers SET
          customer_name=?, customer_address=?, customer_city=?, customer_state=?, customer_zip=?,
          ship_to=?, ship_to_address=?, ship_to_city=?, ship_to_state=?, ship_to_zip=?,
          contact_name=?, contact_phone=?, email=?, comments=?, updated_at=?
        WHERE id=?
      `).bind(customerName,customerAddress,customerCity,customerState,customerZip,shipTo,shipToAddress,shipToCity,shipToState,shipToZip,contactName,contactPhone,email,comments,now,id).run();
      if (!result.meta.changes) return fail("Customer not found.", 404);
      return NextResponse.json({ ok: true, id });
    }
    return fail("Unknown customer action.");
  } catch (error) {
    console.error(error);
    return fail("Could not save customer.", 503);
  }
}
