"use client";

import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Item = { id: number; name: string; sku: string; unit: string };
export default function PublicOrder() {
  const [items, setItems] = useState<Item[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestedBy, setRequestedBy] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: "", quantity: "1" }]);
  useEffect(() => {
    fetch("/api/public-catalog", { cache: "no-store" }).then(async response => {
      const result = await response.json() as { items?: Item[]; accepting?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load the catalog.");
      setItems(result.items || []); setAccepting(!!result.accepting);
    }).catch(e => setError(e instanceof Error ? e.message : "Could not load the catalog.")).finally(() => setLoading(false));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!requestedBy.trim() || (!contactEmail.trim() && !contactPhone.trim()) || lines.some(l => !l.itemId || !Number.isSafeInteger(Number(l.quantity)) || Number(l.quantity) < 1) || new Set(lines.map(l => l.itemId)).size !== lines.length) {
      setError("Enter your name, email or phone, and unique items with positive quantities."); return;
    }
    setBusy(true); setError("");
    try {
      const website = (new FormData(event.currentTarget).get("website") || "").toString();
      const response = await fetch("/api/public-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestedBy, contactEmail, contactPhone, note, lines, website }) });
      const result = await response.json() as { error?: string; number?: string };
      if (!response.ok) throw new Error(result.error || "Could not submit the order.");
      setNumber(result.number || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit the order."); }
    finally { setBusy(false); }
  }
  return <div className="public-page"><header className="public-top"><div className="public-brand"><span className="brand-icon"><Boxes size={21}/></span><strong>Station Inventory</strong></div><a href="/" target="_top">← Workstation workspace</a></header><main className="public-main">{number ? <section className="public-card public-success" role="status"><div className="eyebrow">ORDER RECEIVED</div><h1>Thank you, {requestedBy.trim()}.</h1><p>Your order request number is <strong>{number}</strong>. Keep this number for your records. Staff will review the request and use the contact details you provided if they need to reach you.</p><Button onClick={() => { setNumber(""); setRequestedBy(""); setContactEmail(""); setContactPhone(""); setNote(""); setLines([{ itemId: "", quantity: "1" }]); }}>Place another order</Button></section> : <><div className="public-heading"><div className="eyebrow">ONLINE ORDER</div><h1>Place an order</h1><p>Select the items you need and leave a way to reach you. This submits a request for staff processing; no payment is collected here.</p></div><form className="public-card form" onSubmit={submit}><h2>Contact details</h2><div className="form-grid"><label className="field"><span>Your name *</span><Input required maxLength={100} value={requestedBy} onChange={e => setRequestedBy(e.target.value)} autoComplete="name" /></label><label className="field"><span>Email</span><Input type="email" maxLength={150} value={contactEmail} onChange={e => setContactEmail(e.target.value)} autoComplete="email" /></label></div><label className="field"><span>Phone</span><Input type="tel" maxLength={40} value={contactPhone} onChange={e => setContactPhone(e.target.value)} autoComplete="tel" /><small>Provide an email address or phone number.</small></label><div className="public-divider" /><div className="public-row"><div><h2>Items</h2><p>Choose each item and the quantity requested.</p></div></div>{lines.map((line, index) => <div className="public-order-line" key={index}><label className="field"><span>Item {index + 1}</span><Select value={line.itemId} onValueChange={value => setLines(old => old.map((l,i) => i === index ? { ...l, itemId: value } : l))}><SelectTrigger className="w-full"><SelectValue placeholder="Choose an item" /></SelectTrigger><SelectContent>{items.map(item => <SelectItem value={String(item.id)} key={item.id}>{item.name} · {item.sku}</SelectItem>)}</SelectContent></Select></label><label className="field"><span>Quantity</span><Input required type="number" min={1} step={1} value={line.quantity} onChange={e => setLines(old => old.map((l,i) => i === index ? { ...l, quantity: e.target.value } : l))} /></label><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(old => old.filter((_,i) => i !== index))}><Trash2 size={17} /></Button></div>)}<Button type="button" variant="outline" className="justify-self-start" disabled={lines.length >= 50} onClick={() => setLines(old => [...old, { itemId: "", quantity: "1" }])}><Plus size={16}/> Add item</Button><label className="field"><span>Order notes</span><textarea maxLength={500} rows={3} placeholder="Optional details for the staff" value={note} onChange={e => setNote(e.target.value)} /></label><div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>{error && <div className="error" role="alert">{error}</div>}{!loading && (!accepting || !items.length) && <div className="error" role="status">{!accepting ? "Online ordering is not ready yet. Please check back later." : "No items are available to order yet."}</div>}<div className="public-submit"><span>We use your contact details only to process this order request.</span><Button type="submit" disabled={loading || busy || !accepting || !items.length}>{busy ? "Submitting…" : "Submit order"}</Button></div></form></>}</main></div>;
}
