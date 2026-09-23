"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, PackageCheck, Clock3, Search, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Station = { id: number; name: string; action: string; onlineIntake: number };
type Item = { id: number; name: string; sku: string; unit: string };
type Stock = { itemId: number; stationId: number; quantity: number };
type Order = { id: number; number: string; stationId: number; requestedBy: string; source: string; contactEmail: string; contactPhone: string; note: string; status: string; createdAt: string; updatedAt: string };
type Line = { orderId: number; itemId: number; quantity: number; currentStationId: number; actionDone: number; completedAt: string | null };
type Event = { id: number; orderId: number; itemId: number; type: string; fromStationId: number | null; toStationId: number | null; createdAt: string };
type OrderData = { orders: Order[]; lines: Line[] };
const initial: OrderData = { orders: [], lines: [] };
export default function Orders({ stations, items, stock, selectedStation, onStationChange, onInventoryChange }: { stations: Station[]; items: Item[]; stock: Stock[]; selectedStation: string; onStationChange: (station: string) => void; onInventoryChange: () => Promise<void> }) {
  const [data, setData] = useState<OrderData>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [detailEvents, setDetailEvents] = useState<Event[]>([]);
  const [stationId, setStationId] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [source, setSource] = useState<"phone" | "walk_in">("phone");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: "", quantity: "1" }]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [nextStations, setNextStations] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const result = await response.json() as OrderData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load orders.");
      setData(result); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load orders."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  const loadEvents = useCallback(async (orderId: number) => {
    try {
      const response = await fetch(`/api/orders?orderId=${orderId}`, { cache: "no-store" });
      const result = await response.json() as { events: Event[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load order history.");
      setDetailEvents(result.events);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load order history."); }
  }, []);
  useEffect(() => { if (detail !== null) { setDetailEvents([]); void loadEvents(detail); } }, [detail, loadEvents]);
  const visible = useMemo(() => data.orders.filter(o => (selectedStation === "all" || data.lines.some(l => l.orderId === o.id && String(l.currentStationId) === selectedStation)) && (o.number.toLowerCase().includes(query.toLowerCase()) || o.requestedBy.toLowerCase().includes(query.toLowerCase()))), [data.orders, data.lines, selectedStation, query]);
  const active = data.orders.find(o => o.id === detail);
  const activeLines = data.lines.filter(l => l.orderId === detail);
  const stockAt = (itemId: number, station: number) => stock.find(s => s.itemId === itemId && s.stationId === station)?.quantity || 0;
  const item = (id: number) => items.find(i => i.id === id);
  const station = (id: number) => stations.find(s => s.id === id)?.name || "Unknown station";
  const stationAction = (id: number) => stations.find(s => s.id === id)?.action || "Complete this station's work";
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  function start() {
    setStationId(selectedStation === "all" ? "" : selectedStation);
    setRequestedBy(""); setSource("phone"); setContactEmail(""); setContactPhone(""); setNote(""); setLines([{ itemId: "", quantity: "1" }]); setError(""); setNotice(""); setCreating(true);
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!stationId || !lines.length || lines.some(l => !l.itemId || !Number.isSafeInteger(Number(l.quantity)) || Number(l.quantity) < 1) || new Set(lines.map(l => l.itemId)).size !== lines.length) { setError("Choose a station and unique items with positive quantities."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", source, stationId, requestedBy, contactEmail, contactPhone, note, lines }) });
      const result = await response.json() as { error?: string; number?: string };
      if (!response.ok) throw new Error(result.error || "Could not create order.");
      setCreating(false); setNotice(`Order ${result.number} created`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create order."); }
    finally { setBusy(false); }
  }
  async function status(orderId: number, next: string) {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", orderId, status: next }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update order.");
      setNotice(`Order marked ${next}.`);
      await Promise.all([load(), onInventoryChange(), loadEvents(orderId)]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update order."); }
    finally { setBusy(false); }
  }
  async function lineAction(action: "mark_step" | "handoff" | "complete_line", line: Line) {
    if (busy || !active) return;
    const orderId = active.id;
    if (action === "handoff" && (!nextStations[line.itemId] || Number(nextStations[line.itemId]) === line.currentStationId)) { setError("Choose a different next workstation."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, orderId, itemId: line.itemId, currentStationId: line.currentStationId, nextStationId: nextStations[line.itemId] }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update item.");
      setNotice(action === "mark_step" ? "Station step recorded." : action === "handoff" ? "Item passed to the next workstation." : "Item finished; inventory updated.");
      if (action === "handoff") setNextStations(old => ({ ...old, [line.itemId]: "" }));
      await Promise.all([load(), onInventoryChange(), loadEvents(orderId)]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update item."); }
    finally { setBusy(false); }
  }

  return <><div className="page-heading"><div><div className="eyebrow">ORDER PROCESSING</div><h1>Orders</h1><p>Online, phone, and walk in orders share one workstation queue.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => void load()}>Refresh</Button><Button variant="outline" asChild><a href="/order">Online order form</a></Button><Button onClick={start} disabled={!stations.length || !items.length}><Plus size={17} /> Enter order</Button></div></div>
    {!stations.some(s => s.onlineIntake) && <div className="notice">To accept online orders, open a station in Inventory, choose Edit station, and select “Start online orders at this station.”</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {error && !creating && <div className="error" role="alert">{error} <button onClick={() => { void load(); void onInventoryChange(); }}>Refresh</button></div>}
    <section className="metrics order-metrics">
      <div className="metric"><span><Clock3 size={18} /> RECEIVED</span><strong>{visible.filter(o => o.status === "received").length}</strong><small>Awaiting processing</small></div>
      <div className="metric"><span><PackageCheck size={18} /> PROCESSING</span><strong>{visible.filter(o => o.status === "processing").length}</strong><small>At workstations</small></div>
      <div className="metric"><span><PackageCheck size={18} /> FULFILLED</span><strong>{visible.filter(o => o.status === "fulfilled").length}</strong><small>Stock recorded</small></div>
      <div className="metric"><span><CircleAlert size={18} /> TOTAL ORDERS</span><strong>{visible.length}</strong><small>{selectedStation === "all" ? "Across stations" : "Items at this station"}</small></div>
    </section>
    <section className="panel"><div className="panel-title"><div><h2>Order queue</h2><p>Open an order to review its items and next step.</p></div><div className="table-actions"><Select value={selectedStation} onValueChange={onStationChange}><SelectTrigger aria-label="Filter orders by station"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stations</SelectItem>{stations.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select><label className="search"><Search size={17} /><input aria-label="Search orders" placeholder="Search order or requester" value={query} onChange={e => setQuery(e.target.value)} /></label></div></div>
      <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ORDER</TableHead><TableHead>SOURCE</TableHead><TableHead>STARTED AT</TableHead><TableHead>ITEMS</TableHead><TableHead>CREATED</TableHead><TableHead>STATUS</TableHead><TableHead className="text-right">DETAILS</TableHead></TableRow></TableHeader><TableBody>{visible.map(order => <TableRow key={order.id}><TableCell><strong>{order.number}</strong><span className="cell-sub">{order.requestedBy || "No requester"}</span></TableCell><TableCell className="capitalize">{order.source.replace("_", " ")}</TableCell><TableCell>{station(order.stationId)}</TableCell><TableCell>{data.lines.filter(l => l.orderId === order.id).length} items</TableCell><TableCell>{date(order.createdAt)}</TableCell><TableCell><span className={`badge badge-${order.status}`}>{order.status}</span></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => { setError(""); setDetail(order.id); }}>View order</Button></TableCell></TableRow>)}</TableBody></Table></div>
      {!loading && !visible.length && <div className="empty">{data.orders.length ? "No orders match this station or search." : <><strong>No orders yet</strong><p>Create an order and assign it to a station.</p><Button onClick={start} disabled={!stations.length || !items.length}><Plus size={16} /> New order</Button>{(!stations.length || !items.length) && <p>Add a station and an item in Inventory first.</p>}</>}</div>}
      {loading && <div className="empty">Loading orders…</div>}
    </section>
    <Dialog open={creating} onOpenChange={v => { if (!v) { setCreating(false); setError(""); } }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Enter an order</DialogTitle><DialogDescription>Record a phone or walk in request and choose its first workstation.</DialogDescription></DialogHeader><form className="form" onSubmit={create}>
      <label className="field"><span>Order source</span><Select value={source} onValueChange={v => setSource(v as "phone" | "walk_in")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone call</SelectItem><SelectItem value="walk_in">Walk in</SelectItem></SelectContent></Select></label>
      <label className="field"><span>First workstation</span><Select value={stationId} onValueChange={setStationId}><SelectTrigger className="w-full"><SelectValue placeholder="Select station" /></SelectTrigger><SelectContent>{stations.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></label>
      <label className="field"><span>Customer or requester *</span><Input required value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="Name or department" maxLength={100} /></label>
      <div className="form-grid"><label className="field"><span>Email</span><Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} maxLength={150} /></label><label className="field"><span>Phone</span><Input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} maxLength={40} /></label></div>
      <div className="field"><span>Order items</span>{lines.map((line, index) => <div className="order-line" key={index}><Select value={line.itemId} onValueChange={v => setLines(old => old.map((l, i) => i === index ? { ...l, itemId: v } : l))}><SelectTrigger className="w-full"><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent>{items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} · {i.sku}</SelectItem>)}</SelectContent></Select><Input type="number" aria-label={`Quantity for item ${index + 1}`} min={1} required value={line.quantity} onChange={e => setLines(old => old.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l))} /><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(old => old.filter((_, i) => i !== index))}>Remove</Button></div>)}
      <Button type="button" variant="outline" className="self-start" disabled={lines.length >= 50} onClick={() => setLines(old => [...old, { itemId: "", quantity: "1" }])}><Plus size={16} /> Add item</Button></div>
      <label className="field"><span>Order note</span><Input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Optional instructions" /></label>
      {error && <div className="error" role="alert">{error}</div>}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create order"}</Button></div>
    </form></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={v => { if (!v) { setDetail(null); setError(""); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{active?.number || "Order details"}</DialogTitle><DialogDescription>{active && `Started at ${station(active.stationId)} · Created ${date(active.createdAt)}`}</DialogDescription></DialogHeader>{active && <div className="order-detail">
      <div className="detail-meta"><span>Status <strong className={`badge badge-${active.status}`}>{active.status}</strong></span><span>Source <strong className="capitalize">{active.source.replace("_", " ")}</strong></span><span>Requested by <strong>{active.requestedBy || "—"}</strong></span>{active.contactEmail && <span>Email <strong>{active.contactEmail}</strong></span>}{active.contactPhone && <span>Phone <strong>{active.contactPhone}</strong></span>}</div>
      <div className="workflow-lines">{activeLines.map(l => <div key={l.itemId} className="workflow-card"><div className="workflow-card-top"><div><strong>{item(l.itemId)?.name}</strong><small>{item(l.itemId)?.sku} · Quantity {l.quantity}</small></div><span className={`badge ${l.completedAt ? "badge-fulfilled" : l.actionDone ? "badge-processing" : "badge-received"}`}>{l.completedAt ? "Finished" : l.actionDone ? "Step done" : "At station"}</span></div><div className="workflow-station"><span>Current workstation</span><strong>{station(l.currentStationId)}</strong><small>{stationAction(l.currentStationId)}</small><small>Stock here: {stockAt(l.itemId, l.currentStationId)} {item(l.itemId)?.unit}</small></div>{active.status === "processing" && !l.completedAt && <div className="workflow-actions">{!l.actionDone ? <Button disabled={busy} onClick={() => void lineAction("mark_step", l)}>Mark station step done</Button> : <><Select value={nextStations[l.itemId] || ""} onValueChange={v => setNextStations(old => ({ ...old, [l.itemId]: v }))}><SelectTrigger aria-label={`Next workstation for ${item(l.itemId)?.name}`} className="min-w-[150px]"><SelectValue placeholder="Next workstation" /></SelectTrigger><SelectContent>{stations.filter(s => s.id !== l.currentStationId).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={busy || !nextStations[l.itemId] || stockAt(l.itemId, l.currentStationId) < l.quantity} onClick={() => void lineAction("handoff", l)}>Pass item on</Button><Button disabled={busy || stockAt(l.itemId, l.currentStationId) < l.quantity} onClick={() => void lineAction("complete_line", l)}>Finish item</Button></>}{stockAt(l.itemId, l.currentStationId) < l.quantity && <small className="stock-warning">Receive stock at this station before passing or finishing this item.</small>}</div>}<div className="workflow-history"><span>ITEM HISTORY</span><small>Started at {station(active.stationId)}</small>{detailEvents.filter(e => e.itemId === l.itemId).map(e => <small key={e.id}>{e.type === "step_done" ? `Step done at ${station(e.fromStationId || 0)}` : e.type === "handoff" ? `Passed from ${station(e.fromStationId || 0)} to ${station(e.toStationId || 0)}` : `Finished at ${station(e.fromStationId || 0)}`} · {date(e.createdAt)}</small>)}</div></div>)}</div>
      {active.note && <p className="order-note">{active.note}</p>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="form-actions">{["received", "processing"].includes(active.status) && !activeLines.some(l => l.completedAt) && <Button variant="outline" disabled={busy} onClick={() => void status(active.id, "cancelled")}>Cancel order</Button>}{active.status === "received" && <Button disabled={busy} onClick={() => void status(active.id, "processing")}>Start processing</Button>}{active.status === "processing" && <small className="order-help">The order is fulfilled when every item is finished.</small>}</div>
    </div>}</DialogContent></Dialog>
  </>;
}
