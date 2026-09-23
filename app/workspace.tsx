"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRightLeft, Boxes, CircleAlert, ClipboardList, Plus, Search, Warehouse, ShoppingCart, Map, Package, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import Orders from "./orders";
import FloorPlan from "./floor-plan";

type Station = { id: number; name: string; location: string; action: string; onlineIntake: number };
type Item = { id: number; name: string; sku: string; unit: string; threshold: number };
type Stock = { stationId: number; itemId: number; quantity: number };
type Movement = { id: number; itemId: number; fromStationId: number | null; toStationId: number | null; quantity: number; note: string; createdAt: string; orderId: number | null };
type Data = { stations: Station[]; items: Item[]; stock: Stock[]; movements: Movement[] };
type Mode = "station" | "station_edit" | "item" | "receive" | "use" | "transfer";
const empty: Data = { stations: [], items: [], stock: [], movements: [] };

export default function Inventory({ initialView = "floor" }: { initialView?: "floor" | "orders" | "inventory" | "stations" | "catalog" }) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("all");
  const [view, setView] = useState<"floor" | "orders" | "inventory" | "stations" | "catalog">(initialView);
  const [detailItem, setDetailItem] = useState<number | null>(null);
  const [itemHistory, setItemHistory] = useState<Movement[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load inventory.");
      setData(result);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load inventory."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const loadHistory = useCallback(async (itemId: number, offset: number) => {
    try {
      const response = await fetch(`/api/inventory/history?itemId=${itemId}&offset=${offset}`, { cache: "no-store" });
      const result = await response.json() as { movements: Movement[]; hasMore: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load history.");
      setItemHistory(old => offset ? [...old, ...result.movements] : result.movements);
      setHistoryMore(result.hasMore); setHistoryError("");
    } catch (e) { setHistoryError(e instanceof Error ? e.message : "Could not load history."); }
  }, []);
  useEffect(() => { if (detailItem !== null) { setItemHistory([]); void loadHistory(detailItem, 0); } }, [detailItem, loadHistory]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_station_inventory", title: "Read station inventory",
      description: "Read the current stations, item catalog, stock quantities, and recent movements.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute() {
        const response = await fetch("/api/inventory", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not read inventory");
        return await response.json();
      },
    }, { signal: lifecycle.signal })).catch(console.error);
    void Promise.resolve(context.registerTool({
      name: "record_stock_movement", title: "Record stock movement",
      description: "Receive, use, or transfer a whole number quantity of an existing item between stations.",
      inputSchema: { type: "object", properties: {
        action: { type: "string", enum: ["receive", "use", "transfer"] }, itemId: { type: "integer", minimum: 1 },
        fromStationId: { type: "integer", minimum: 1 }, toStationId: { type: "integer", minimum: 1 },
        quantity: { type: "integer", minimum: 1 }, note: { type: "string", maxLength: 200 },
      }, required: ["action", "itemId", "quantity"], additionalProperties: false },
      annotations: { readOnlyHint: false },
      async execute(input: unknown) {
        const value = input as Record<string, unknown>;
        if (!value || !["receive", "use", "transfer"].includes(String(value.action)) || !Number.isSafeInteger(value.itemId) || !Number.isSafeInteger(value.quantity) || Number(value.quantity) < 1) throw new Error("Invalid movement");
        const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not record movement");
        await reload();
        setNotice("Stock movement recorded");
        return { ok: true };
      },
    }, { signal: lifecycle.signal })).catch(console.error);
    return () => lifecycle.abort();
  }, [reload]);

  const stationName = (id: number | null) => data.stations.find(s => s.id === id)?.name || "External";
  const itemName = (id: number) => data.items.find(i => i.id === id)?.name || "Unknown item";
  const quantity = (itemId: number, stationId: number) => data.stock.find(s => s.itemId === itemId && s.stationId === stationId)?.quantity || 0;
  const rows = useMemo(() => data.items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) || item.sku.toLowerCase().includes(query.toLowerCase())).map(item => {
    const total = selected === "all" ? data.stock.filter(s => s.itemId === item.id).reduce((sum, row) => sum + row.quantity, 0) : quantity(item.id, Number(selected));
    return { ...item, total };
  }), [data, query, selected]);
  const low = rows.filter(row => row.total <= row.threshold);
  const open = (next: Mode, preset: Record<string, string> = {}) => { setMode(next); setForm(next === "item" ? { threshold: "0", ...preset } : preset); setError(""); setNotice(""); };
  const field = (name: string, label: string, props: { type?: string; placeholder?: string; required?: boolean; min?: number } = {}) => (
    <label className="field"><span>{label}</span><Input name={name} value={form[name] || ""} onChange={e => setForm(v => ({ ...v, [name]: e.target.value }))} {...props} /></label>
  );
  const picker = (name: string, label: string, options: { id: number; name: string }[]) => (
    <label className="field"><span>{label}</span><Select value={form[name] || ""} onValueChange={value => setForm(v => ({ ...v, [name]: value }))}><SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}</SelectContent></Select></label>
  );
  const editStation = (station: Station) => open("station_edit", { stationId: String(station.id), name: station.name, location: station.location, stationAction: station.action, onlineIntake: String(!!station.onlineIntake) });
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!mode || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, ...form }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save change.");
      setMode(null); setNotice(({ station: "Station added", station_edit: "Station updated", item: "Item added", receive: "Stock received", use: "Stock used", transfer: "Transfer complete" })[mode]);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save change."); }
    finally { setBusy(false); }
  }

  return <div className="app-shell">
    <aside className="rail">
      <button className="brand brand-button" onClick={() => setView("floor")} aria-label="Open floor plan"><span className="brand-icon"><Boxes size={22} /></span><div><strong>Station Inventory</strong><small>Operations workspace</small></div></button>
      <div className="rail-label">OPERATIONS</div>
      <button className={`rail-link ${view === "floor" ? "active" : ""}`} onClick={() => setView("floor")}><Map size={19} /> Floor plan</button>
      <button className={`rail-link ${view === "orders" ? "active" : ""}`} onClick={() => setView("orders")}><ShoppingCart size={19} /> Orders</button>
      <button className={`rail-link ${view === "inventory" ? "active" : ""}`} onClick={() => { setSelected("all"); setView("inventory"); }}><ClipboardList size={19} /> Inventory</button>
      <div className="rail-label rail-manage">MANAGE</div>
      <button className={`rail-link ${view === "stations" ? "active" : ""}`} onClick={() => setView("stations")}><Warehouse size={19} /> Workstations</button>
      <button className={`rail-link ${view === "catalog" ? "active" : ""}`} onClick={() => setView("catalog")}><Package size={19} /> Item catalog</button>
      <div className="rail-label rail-online">ORDER ENTRY</div>
      <a className="rail-link" href="/order"><ShoppingCart size={19}/> Online order form</a>
      <div className="rail-bottom"><span className="live-dot" /> Shared inventory records</div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Workspace / {({floor:"Floor plan",orders:"Orders",inventory:"Inventory",stations:"Workstations",catalog:"Item catalog"})[view]}</span><span className="topbar-right">STATION CONTROL <span className="avatar">SI</span></span></header>
      <div className="content">
        {view === "floor" && <FloorPlan stationVersion={data.stations.map(s => `${s.id}:${s.name}`).join("|")} onAddStation={() => open("station")} onOpenStation={id => { setSelected(String(id)); setView("inventory"); }} onOpenOrders={id => { setSelected(String(id)); setView("orders"); }} />}
        {view === "orders" && <Orders stations={data.stations} items={data.items} stock={data.stock} selectedStation={selected} onStationChange={setSelected} onInventoryChange={reload} />}
        {view === "stations" && <><div className="page-heading"><div><div className="eyebrow">MANAGE</div><h1>Workstations</h1><p>Define what each station does and where online orders begin.</p></div><Button onClick={() => open("station")}><Plus size={17}/> Add station</Button></div><div className="station-grid">{data.stations.map(station => <article className="station-card" key={station.id}><div className="station-card-icon"><Warehouse size={21}/></div><h2>{station.name}</h2><p>{station.action || "Station action not set"}</p>{station.location && <small>{station.location}</small>}{!!station.onlineIntake && <span className="badge badge-ok">Online intake</span>}<div className="station-card-actions"><Button size="sm" onClick={() => { setSelected(String(station.id)); setView("inventory"); }}>Inventory</Button><Button size="sm" variant="outline" onClick={() => { setSelected(String(station.id)); setView("orders"); }}>Orders</Button><Button size="sm" variant="ghost" onClick={() => editStation(station)}><Settings2 size={15}/> Edit</Button></div></article>)}</div>{!data.stations.length && <div className="empty"><strong>No stations yet</strong><p>Add a station, describe its action, then place it on the floor plan.</p><Button onClick={() => open("station")}>Add station</Button></div>}</>}
        {view === "catalog" && <><div className="page-heading"><div><div className="eyebrow">MANAGE</div><h1>Item catalog</h1><p>Items customers can request and staff can track by station.</p></div><Button onClick={() => open("item")}><Plus size={17}/> Add item</Button></div><section className="panel"><div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ITEM</TableHead><TableHead>SKU</TableHead><TableHead>UNIT</TableHead><TableHead>TOTAL STOCK</TableHead><TableHead>LOW STOCK AT</TableHead><TableHead className="text-right">DETAILS</TableHead></TableRow></TableHeader><TableBody>{data.items.map(item => <TableRow key={item.id}><TableCell className="font-semibold">{item.name}</TableCell><TableCell className="mono">{item.sku}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{data.stock.filter(s => s.itemId===item.id).reduce((sum,s) => sum+s.quantity,0)}</TableCell><TableCell>{item.threshold}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setDetailItem(item.id)}>View history</Button></TableCell></TableRow>)}</TableBody></Table></div>{!data.items.length && <div className="empty"><strong>No items yet</strong><p>Add items to make them available for orders.</p><Button onClick={() => open("item")}>Add item</Button></div>}</section></>}
        {view === "inventory" && <>
        <div className="page-heading"><div><div className="eyebrow">INVENTORY CONTROL</div><h1>{selected === "all" ? "All inventory" : stationName(Number(selected))}</h1><p>{selected === "all" ? "Stock levels across every station." : data.stations.find(s => String(s.id) === selected)?.action || "Configure the action performed at this station."}</p></div><div className="heading-actions"><Select value={selected} onValueChange={setSelected}><SelectTrigger aria-label="Choose inventory station"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stations</SelectItem>{data.stations.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>{selected !== "all" && <Button variant="outline" onClick={() => { const s = data.stations.find(s => String(s.id) === selected); if (s) editStation(s); }}>Edit station</Button>}<Button variant="outline" onClick={() => open("item")}><Plus size={17} /> Add item</Button><Button onClick={() => open("receive", selected === "all" ? {} : { toStationId: selected })}><ArrowDownToLine size={17} /> Receive stock</Button></div></div>
        {notice && <div className="notice" role="status">{notice}</div>}
        {error && !mode && <div className="error" role="alert">{error} <button onClick={() => void reload()}>Retry</button></div>}
        <section className="metrics" aria-label="Inventory summary">
          <div className="metric"><span><Boxes size={18} /> ITEMS TRACKED</span><strong>{rows.length}</strong><small>{selected === "all" ? "Across all stations" : "At this station"}</small></div>
          <div className="metric"><span><Warehouse size={18} /> ACTIVE STATIONS</span><strong>{data.stations.length}</strong><small>Available locations</small></div>
          <div className="metric alert"><span><CircleAlert size={18} /> LOW STOCK</span><strong>{low.length}</strong><small>At or below reorder level</small></div>
          <div className="metric"><span><ArrowRightLeft size={18} /> RECENT MOVES</span><strong>{data.movements.length}</strong><small>Latest recorded activity</small></div>
        </section>
        <section className="panel">
          <div className="panel-title"><div><h2>Stock levels</h2><p>Review quantities and record changes.</p></div><div className="table-actions"><label className="search"><Search size={17} /><input aria-label="Search items" placeholder="Search item or SKU" value={query} onChange={e => setQuery(e.target.value)} /></label><Button variant="outline" onClick={() => open("transfer")} disabled={!data.stations.length || !data.items.length}><ArrowRightLeft size={17} /> Transfer</Button></div></div>
          <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ITEM</TableHead><TableHead>SKU</TableHead><TableHead>QUANTITY</TableHead><TableHead>REORDER AT</TableHead><TableHead>STATUS</TableHead><TableHead className="text-right">ACTION</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Button variant="link" className="p-0 h-auto font-bold" onClick={() => setDetailItem(row.id)}>{row.name}</Button><span className="cell-sub">{row.unit}</span></TableCell><TableCell className="mono">{row.sku}</TableCell><TableCell className="quantity">{row.total}</TableCell><TableCell>{row.threshold}</TableCell><TableCell><span className={`badge ${row.total <= row.threshold ? "badge-low" : "badge-ok"}`}>{row.total <= row.threshold ? "Low stock" : "In stock"}</span></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => open("use", { itemId: String(row.id), ...(selected === "all" ? {} : { fromStationId: selected }) })}>Record use</Button></TableCell></TableRow>)}</TableBody></Table></div>
          {!loading && !rows.length && <div className="empty">{data.items.length ? "No items match your search." : <><strong>No items yet</strong><p>Add an item, then receive stock at a station.</p><Button onClick={() => open("item")}><Plus size={16} /> Add first item</Button></>}</div>}
          {loading && <div className="empty">Loading inventory…</div>}
        </section>
        <section className="panel activity"><div className="panel-title"><div><h2>Recent activity</h2><p>Latest stock movements across stations.</p></div></div>{data.movements.length ? <div className="activity-list">{data.movements.slice(0, 8).map(move => <div className="activity-row" key={move.id}><span className="movement-icon"><ArrowRightLeft size={17}/></span><div><strong>{itemName(move.itemId)}</strong><small>{move.fromStationId ? stationName(move.fromStationId) : "Received"} → {move.toStationId ? stationName(move.toStationId) : "Used"}{move.note ? ` · ${move.note}` : ""}</small></div><span className="activity-qty">{move.quantity}</span><time>{new Date(move.createdAt).toLocaleDateString()}</time></div>)}</div> : <p className="activity-empty">Movements will appear here when stock is received, used, or transferred.</p>}</section>
        </>}
      </div>
    </main>
    <Sheet open={detailItem !== null} onOpenChange={v => { if (!v) setDetailItem(null); }}><SheetContent className="overflow-y-auto p-6"><SheetHeader><SheetTitle>{data.items.find(i => i.id === detailItem)?.name || "Item details"}</SheetTitle><SheetDescription>{data.items.find(i => i.id === detailItem)?.sku} · Stock by station and movement history</SheetDescription></SheetHeader><div className="item-detail"><h3>Station quantities</h3>{data.stations.map(station => <div className="detail-line" key={station.id}><strong>{station.name}</strong><span>{quantity(detailItem || 0, station.id)} {data.items.find(i => i.id === detailItem)?.unit}</span></div>)}{!data.stations.length && <p>No stations yet.</p>}<h3>Movement history</h3>{itemHistory.map(m => <div className="detail-line" key={m.id}><div><strong>{m.fromStationId ? stationName(m.fromStationId) : "Received"} → {m.toStationId ? stationName(m.toStationId) : "Used"}</strong><small>{m.note || "Stock movement"} · {new Date(m.createdAt).toLocaleString()}</small></div><span>{m.quantity}</span></div>)}{!itemHistory.length && !historyError && <p>No movements recorded for this item.</p>}{historyError && <div className="error">{historyError}</div>}{historyMore && detailItem !== null && <Button variant="outline" onClick={() => void loadHistory(detailItem, itemHistory.length)}>Load more</Button>}</div></SheetContent></Sheet>
    <Dialog open={!!mode} onOpenChange={value => { if (!value) { setMode(null); setError(""); } }}><DialogContent><DialogHeader><DialogTitle>{mode && ({ station: "Add station", station_edit: "Edit station", item: "Add item", receive: "Receive stock", use: "Record use", transfer: "Transfer stock" })[mode]}</DialogTitle><DialogDescription>{mode === "station" || mode === "station_edit" ? "Name this workstation and describe the action it performs." : mode === "item" ? "Add a catalog item to track across stations." : "Record a stock movement. Counts update immediately."}</DialogDescription></DialogHeader><form onSubmit={save} className="form">
      {(mode === "station" || mode === "station_edit") && <>{field("name", "Station name", { placeholder: "e.g. Assembly", required: true })}{field("stationAction", "Station action", { placeholder: "e.g. Assemble and inspect", required: true })}{field("location", "Location", { placeholder: "Optional" })}<label className="checkbox-field"><Checkbox checked={form.onlineIntake === "true"} onCheckedChange={checked => setForm(v => ({ ...v, onlineIntake: checked === true ? "true" : "false" }))} /><span>Start online orders at this station</span></label></>}
      {mode === "item" && <>{field("name", "Item name", { required: true, placeholder: "e.g. Nitrile gloves" })}{field("sku", "SKU / item code", { required: true, placeholder: "e.g. GLV-001" })}<div className="form-grid">{field("unit", "Unit", { placeholder: "each" })}{field("threshold", "Low stock level", { type: "number", min: 0, required: true })}</div></>}
      {["receive", "use", "transfer"].includes(mode || "") && <>{picker("itemId", "Item", data.items)}{(mode === "use" || mode === "transfer") && picker("fromStationId", "From station", data.stations)}{(mode === "receive" || mode === "transfer") && picker("toStationId", "To station", data.stations)}{field("quantity", "Quantity", { type: "number", min: 1, required: true })}{field("note", "Note", { placeholder: "Optional reference or reason" })}</>}
      {error && <div className="error" role="alert">{error}</div>}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" disabled={busy || (["receive", "use", "transfer"].includes(mode || "") && (!data.items.length || !data.stations.length))}>{busy ? "Saving…" : "Save change"}</Button></div>
    </form></DialogContent></Dialog>
  </div>;
}
