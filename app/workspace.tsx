"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRightLeft, Boxes, CircleAlert, ClipboardList, ClipboardPenLine, Plus, Search, Warehouse, ShoppingCart, Map, Package, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import Orders from "./orders";
import FloorPlan from "./floor-plan";
import IssueNotepad from "./issue-notepad";
import Customers from "./customers";

type Station = { id: number; name: string; location: string; action: string; onlineIntake: number };
type Item = { id: number; name: string; sku: string; unit: string; threshold: number };
type Stock = { stationId: number; itemId: number; quantity: number };
type Movement = { id: number; itemId: number; fromStationId: number | null; toStationId: number | null; quantity: number; note: string; createdAt: string; orderId: number | null };
type Data = { stations: Station[]; items: Item[]; stock: Stock[]; movements: Movement[] };
type Mode = "station" | "station_edit" | "item" | "item_edit" | "receive" | "use" | "transfer" | "produce";
const empty: Data = { stations: [], items: [], stock: [], movements: [] };
type View = "floor" | "orders" | "inventory" | "stations" | "catalog" | "customers" | "issues";

export default function Inventory({ initialView = "floor" }: { initialView?: View }) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("all");
  const [view, setView] = useState<View>(initialView);
  const [issueScreen, setIssueScreen] = useState<View>("floor");
  const [detailItem, setDetailItem] = useState<number | null>(null);
  const [itemHistory, setItemHistory] = useState<Movement[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [issueAlert, setIssueAlert] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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
  const loadIssueCount = useCallback(async (announce = true) => {
    try {
      const response = await fetch("/api/issues", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { issues?: { id: number; status: string; title: string; reporterEmail: string; createdAt: string }[] };
      const issues = result.issues || [];
      setOpenIssueCount(issues.filter(issue => issue.status === "open").length);

      const newest = issues.reduce<typeof issues[number] | null>((latest, issue) => !latest || issue.id > latest.id ? issue : latest, null);
      if (!newest) return;

      const key = "station-last-seen-issue-id";
      const previous = Number(window.localStorage.getItem(key) || "0");
      if (!previous) {
        window.localStorage.setItem(key, String(newest.id));
        return;
      }
      if (newest.id > previous) {
        window.localStorage.setItem(key, String(newest.id));
        if (announce) {
          const message = `New note #${newest.id}: ${newest.title}`;
          setIssueAlert(message);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Station Inventory: New note", {
              body: `${newest.title} — ${newest.reporterEmail}`,
              tag: `station-note-${newest.id}`,
            });
          }
        }
      }
    } catch { /* keep the last known count if notes are temporarily unavailable */ }
  }, []);
  useEffect(() => {
    if ("Notification" in window) setNotificationsEnabled(Notification.permission === "granted");
    void loadIssueCount(false);
    const timer = window.setInterval(() => void loadIssueCount(true), 15000);
    const changed = () => void loadIssueCount(true);
    window.addEventListener("station-issues-changed", changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("station-issues-changed", changed);
    };
  }, [loadIssueCount]);
  const enableNoteAlerts = useCallback(async () => {
    if (!("Notification" in window)) {
      setIssueAlert("Browser notifications are not supported here. New-note alerts will still appear inside the app.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    setIssueAlert(permission === "granted" ? "Browser note alerts enabled." : "Browser notification permission was not enabled. In-app alerts will still work.");
  }, []);
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
  const stockByStation = useMemo(() => {
    const grouped: Record<number, { itemId: number; name: string; sku: string; unit: string; quantity: number }[]> = {};
    for (const row of data.stock) {
      if (row.quantity <= 0) continue;
      const item = data.items.find(item => item.id === row.itemId);
      if (!item) continue;
      (grouped[row.stationId] ||= []).push({ itemId: row.itemId, name: item.name, sku: item.sku, unit: item.unit, quantity: row.quantity });
    }
    for (const stationId of Object.keys(grouped)) grouped[Number(stationId)].sort((a,b) => a.name.localeCompare(b.name));
    return grouped;
  }, [data.stock, data.items]);
  const open = (next: Mode, preset: Record<string, string> = {}) => { setMode(next); setForm(next === "item" ? { threshold: "0", ...preset } : preset); setError(""); setNotice(""); };
  const field = (name: string, label: string, props: { type?: string; placeholder?: string; required?: boolean; min?: number } = {}) => (
    <label className="field"><span>{label}</span><Input name={name} value={form[name] || ""} onChange={e => setForm(v => ({ ...v, [name]: e.target.value }))} {...props} /></label>
  );
  const picker = (name: string, label: string, options: { id: number; name: string }[]) => (
    <label className="field"><span>{label}</span><Select value={form[name] || ""} onValueChange={value => setForm(v => ({ ...v, [name]: value }))}><SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}</SelectContent></Select></label>
  );
  const editStation = (station: Station) => open("station_edit", { stationId: String(station.id), name: station.name, location: station.location, stationAction: station.action, onlineIntake: String(!!station.onlineIntake) });
  const editItem = (item: Item) => open("item_edit", { itemId: String(item.id), name: item.name, sku: item.sku, unit: item.unit, threshold: String(item.threshold) });
  const unitFor = (itemId: string | number) => data.items.find(i => String(i.id) === String(itemId))?.unit || "units";
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!mode || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, ...form }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save change.");
      setMode(null); setNotice(({ station: "Station added", station_edit: "Station updated", item: "Item added", item_edit: "Item updated", receive: "Stock received", use: "Stock used", transfer: "Transfer complete", produce: "Material consumed and piece stock recorded" })[mode]);
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
      <button className={`rail-link ${view === "customers" ? "active" : ""}`} onClick={() => setView("customers")}><Users size={19} /> Customers</button>
      <button className={`rail-link ${view === "issues" ? "active" : ""}`} onClick={() => { if (view !== "issues") setIssueScreen(view); setView("issues"); }}><ClipboardPenLine size={19} /> Issue notepad {openIssueCount > 0 && <span className="badge badge-low" aria-label={`${openIssueCount} open notes`}>{openIssueCount}</span>}</button>
      <div className="rail-label rail-manage">MANAGE</div>
      <button className={`rail-link ${view === "stations" ? "active" : ""}`} onClick={() => setView("stations")}><Warehouse size={19} /> Workstations</button>
      <button className={`rail-link ${view === "catalog" ? "active" : ""}`} onClick={() => setView("catalog")}><Package size={19} /> Item catalog</button>
      <div className="rail-label rail-online">ORDER ENTRY</div>
      <a className="rail-link" href="/order"><ShoppingCart size={19}/> Online order form</a>
      <div className="rail-bottom"><span className="live-dot" /> Shared inventory records</div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Workspace / {({floor:"Floor plan",orders:"Orders",inventory:"Inventory",stations:"Workstations",catalog:"Item catalog",customers:"Customers",issues:"Issue notepad"})[view]}</span><span className="topbar-right">{!notificationsEnabled && <button className="badge" onClick={() => void enableNoteAlerts()}>Enable note alerts</button>}{openIssueCount > 0 && <button className="badge badge-low" onClick={() => { if (view !== "issues") setIssueScreen(view); setView("issues"); }}><CircleAlert size={14}/> {openIssueCount} OPEN {openIssueCount === 1 ? "NOTE" : "NOTES"}</button>} STATION CONTROL <span className="avatar">SI</span></span></header>
      <div className="content">
        {issueAlert && <div className="notice" role="alert"><strong>{issueAlert}</strong> <button onClick={() => { setIssueAlert(""); if (view !== "issues") setIssueScreen(view); setView("issues"); }}>View notes</button> <button onClick={() => setIssueAlert("")}>Dismiss</button></div>}
        {view === "issues" && <IssueNotepad initialScreen={issueScreen} />}
        {view === "customers" && <Customers />}
        {view === "floor" && <FloorPlan stationVersion={data.stations.map(s => `${s.id}:${s.name}`).join("|")} stockByStation={stockByStation} onAddStation={() => open("station")} onOpenStation={id => { setSelected(String(id)); setView("inventory"); }} onOpenOrders={id => { setSelected(String(id)); setView("orders"); }} />}
        {view === "orders" && <Orders stations={data.stations} items={data.items} stock={data.stock} selectedStation={selected} onStationChange={setSelected} onInventoryChange={reload} />}
        {view === "stations" && <><div className="page-heading"><div><div className="eyebrow">MANAGE</div><h1>Workstations</h1><p>Define what each station does and where online orders begin.</p></div><Button onClick={() => open("station")}><Plus size={17}/> Add station</Button></div><div className="station-grid">{data.stations.map(station => <article className="station-card" key={station.id}><div className="station-card-icon"><Warehouse size={21}/></div><h2>{station.name}</h2><p>{station.action || "Station action not set"}</p>{station.location && <small>{station.location}</small>}{!!station.onlineIntake && <span className="badge badge-ok">Online intake</span>}<div className="station-card-actions"><Button size="sm" onClick={() => { setSelected(String(station.id)); setView("inventory"); }}>Inventory</Button><Button size="sm" variant="outline" onClick={() => { setSelected(String(station.id)); setView("orders"); }}>Orders</Button><Button size="sm" variant="ghost" onClick={() => editStation(station)}><Settings2 size={15}/> Edit</Button></div></article>)}</div>{!data.stations.length && <div className="empty"><strong>No stations yet</strong><p>Add a station, describe its action, then place it on the floor plan.</p><Button onClick={() => open("station")}>Add station</Button></div>}</>}
        {view === "catalog" && <><div className="page-heading"><div><div className="eyebrow">MANAGE</div><h1>Item catalog</h1><p>Track raw materials and produced stock as separate items with their own units.</p></div><Button onClick={() => open("item")}><Plus size={17}/> Add item</Button></div><section className="panel"><div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ITEM</TableHead><TableHead>SKU</TableHead><TableHead>UNIT</TableHead><TableHead>TOTAL STOCK</TableHead><TableHead>LOW STOCK AT</TableHead><TableHead className="text-right">DETAILS</TableHead></TableRow></TableHeader><TableBody>{data.items.map(item => <TableRow key={item.id}><TableCell className="font-semibold">{item.name}</TableCell><TableCell className="mono">{item.sku}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{data.stock.filter(s => s.itemId===item.id).reduce((sum,s) => sum+s.quantity,0)} {item.unit}</TableCell><TableCell>{item.threshold} {item.unit}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => editItem(item)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => setDetailItem(item.id)}>View history</Button></TableCell></TableRow>)}</TableBody></Table></div>{!data.items.length && <div className="empty"><strong>No items yet</strong><p>Add an item to track inventory.</p><Button onClick={() => open("item")}>Add item</Button></div>}</section></>}
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
        {selected === "all" ? <section className="all-stations-inventory">
          <div className="all-stations-header"><div><h2>Inventory by workstation</h2><p>Current stock physically recorded at each workstation.</p></div><div className="table-actions"><label className="search"><Search size={17} /><input aria-label="Search station inventory" placeholder="Search item or SKU" value={query} onChange={e => setQuery(e.target.value)} /></label><Button variant="outline" onClick={() => open("transfer")} disabled={!data.stations.length || !data.items.length}><ArrowRightLeft size={17} /> Transfer</Button><Button onClick={() => open("produce")} disabled={!data.stations.length || !data.items.length}><Package size={17} /> Finish work → stock</Button></div></div>
          <div className="station-inventory-grid">{data.stations.map(station => {
            const stationRows = (stockByStation[station.id] || []).filter(row => row.name.toLowerCase().includes(query.toLowerCase()) || row.sku.toLowerCase().includes(query.toLowerCase()));
            return <section className="station-inventory-panel" key={station.id}>
              <div className="station-inventory-head"><div><Warehouse size={18}/><div><h3>{station.name}</h3><p>{station.action || station.location || "Workstation inventory"}</p></div></div><Button size="sm" variant="outline" onClick={() => setSelected(String(station.id))}>Open station</Button></div>
              {stationRows.length ? <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ITEM</TableHead><TableHead>SKU</TableHead><TableHead>QUANTITY</TableHead><TableHead className="text-right">ACTION</TableHead></TableRow></TableHeader><TableBody>{stationRows.map(row => <TableRow key={row.itemId}><TableCell><Button variant="link" className="p-0 h-auto font-bold" onClick={() => setDetailItem(row.itemId)}>{row.name}</Button><span className="cell-sub">{row.unit}</span></TableCell><TableCell className="mono">{row.sku}</TableCell><TableCell className="quantity">{row.quantity} {row.unit}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => open("use", { itemId: String(row.itemId), fromStationId: String(station.id) })}>Record use</Button></TableCell></TableRow>)}</TableBody></Table></div> : <div className="station-inventory-empty">{query ? "No matching stock at this workstation." : "No stock currently recorded at this workstation."}</div>}
            </section>;
          })}</div>
          {!loading && !data.stations.length && <div className="empty"><strong>No workstations yet</strong><p>Add a workstation to begin tracking station inventory.</p></div>}
          {loading && <div className="empty">Loading inventory…</div>}
        </section> : <section className="panel">
          <div className="panel-title"><div><h2>Stock levels</h2><p>Transfer an unchanged item, or finish work to consume material and create pieces.</p></div><div className="table-actions"><label className="search"><Search size={17} /><input aria-label="Search items" placeholder="Search item or SKU" value={query} onChange={e => setQuery(e.target.value)} /></label><Button variant="outline" onClick={() => open("transfer")} disabled={!data.stations.length || !data.items.length}><ArrowRightLeft size={17} /> Transfer</Button><Button onClick={() => open("produce", { fromStationId: selected })} disabled={!data.stations.length || !data.items.length}><Package size={17} /> Finish work → stock</Button></div></div>
          <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>ITEM</TableHead><TableHead>SKU</TableHead><TableHead>QUANTITY</TableHead><TableHead>REORDER AT</TableHead><TableHead>STATUS</TableHead><TableHead className="text-right">ACTION</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Button variant="link" className="p-0 h-auto font-bold" onClick={() => setDetailItem(row.id)}>{row.name}</Button><span className="cell-sub">{row.unit}</span></TableCell><TableCell className="mono">{row.sku}</TableCell><TableCell className="quantity">{row.total} {row.unit}</TableCell><TableCell>{row.threshold} {row.unit}</TableCell><TableCell><span className={`badge ${row.total <= row.threshold ? "badge-low" : "badge-ok"}`}>{row.total <= row.threshold ? "Low stock" : "In stock"}</span></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => open("use", { itemId: String(row.id), fromStationId: selected })}>Record use</Button></TableCell></TableRow>)}</TableBody></Table></div>
          {!loading && !rows.length && <div className="empty">{data.items.length ? "No items match your search." : <><strong>No items yet</strong><p>Add an item, then receive stock at a station.</p><Button onClick={() => open("item")}><Plus size={16} /> Add first item</Button></>}</div>}
          {loading && <div className="empty">Loading inventory…</div>}
        </section>}
        <section className="panel activity"><div className="panel-title"><div><h2>Recent activity</h2><p>Latest stock movements across stations.</p></div></div>{data.movements.length ? <div className="activity-list">{data.movements.slice(0, 8).map(move => <div className="activity-row" key={move.id}><span className="movement-icon"><ArrowRightLeft size={17}/></span><div><strong>{itemName(move.itemId)}</strong><small>{move.fromStationId ? stationName(move.fromStationId) : "Received"} → {move.toStationId ? stationName(move.toStationId) : "Used"}{move.note ? ` · ${move.note}` : ""}</small></div><span className="activity-qty">{move.quantity} {unitFor(move.itemId)}</span><time>{new Date(move.createdAt).toLocaleDateString()}</time></div>)}</div> : <p className="activity-empty">Movements will appear here when stock is received, used, or transferred.</p>}</section>
        </>}
      </div>
    </main>
    {view !== "issues" && <button className="issue-quick" onClick={() => { setIssueScreen(view); setView("issues"); }}><ClipboardPenLine size={18}/> {openIssueCount > 0 ? `Notes (${openIssueCount})` : "Log issue"}</button>}
    <Sheet open={detailItem !== null} onOpenChange={v => { if (!v) setDetailItem(null); }}><SheetContent className="overflow-y-auto p-6"><SheetHeader><SheetTitle>{data.items.find(i => i.id === detailItem)?.name || "Item details"}</SheetTitle><SheetDescription>{data.items.find(i => i.id === detailItem)?.sku} · Stock by station and movement history</SheetDescription></SheetHeader><div className="item-detail"><h3>Station quantities</h3>{data.stations.map(station => <div className="detail-line" key={station.id}><strong>{station.name}</strong><span>{quantity(detailItem || 0, station.id)} {data.items.find(i => i.id === detailItem)?.unit}</span></div>)}{!data.stations.length && <p>No stations yet.</p>}<h3>Movement history</h3>{itemHistory.map(m => <div className="detail-line" key={m.id}><div><strong>{m.fromStationId ? stationName(m.fromStationId) : "Received"} → {m.toStationId ? stationName(m.toStationId) : "Used"}</strong><small>{m.note || "Stock movement"} · {new Date(m.createdAt).toLocaleString()}</small></div><span>{m.quantity} {unitFor(m.itemId)}</span></div>)}{!itemHistory.length && !historyError && <p>No movements recorded for this item.</p>}{historyError && <div className="error">{historyError}</div>}{historyMore && detailItem !== null && <Button variant="outline" onClick={() => void loadHistory(detailItem, itemHistory.length)}>Load more</Button>}</div></SheetContent></Sheet>
    <Dialog open={!!mode} onOpenChange={value => { if (!value) { setMode(null); setError(""); } }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{mode && ({ station: "Add station", station_edit: "Edit station", item: "Add item", item_edit: "Edit item", receive: "Receive stock", use: "Record use", transfer: "Transfer stock", produce: "Finish work → stock" })[mode]}</DialogTitle><DialogDescription>{mode === "station" || mode === "station_edit" ? "Name this workstation and describe the action it performs." : mode === "item" || mode === "item_edit" ? "Set the item unit for every inventory count." : mode === "produce" ? "Consume material at the current workstation and count finished stock in pieces at the next one." : mode === "transfer" ? "Move the same item and unit. The overall total stays the same." : "Record a stock movement. Counts update immediately."}</DialogDescription></DialogHeader><form onSubmit={save} className="form">
      {(mode === "station" || mode === "station_edit") && <>{field("name", "Station name", { placeholder: "e.g. Assembly", required: true })}{field("stationAction", "Station action", { placeholder: "e.g. Assemble and inspect", required: true })}{field("location", "Location", { placeholder: "Optional" })}<label className="checkbox-field"><Checkbox checked={form.onlineIntake === "true"} onCheckedChange={checked => setForm(v => ({ ...v, onlineIntake: checked === true ? "true" : "false" }))} /><span>Start online orders at this station</span></label></>}
      {(mode === "item" || mode === "item_edit") && <>{field("name", "Item name", { required: true, placeholder: "e.g. 3/4 cut stock" })}{field("sku", "SKU / item code", { required: true, placeholder: "e.g. GLV-001" })}<div className="form-grid">{field("unit", "Unit", { placeholder: "inches or pieces", required: true })}{field("threshold", "Low stock level", { type: "number", min: 0, required: true })}</div></>}
      {["receive", "use", "transfer"].includes(mode || "") && <>{picker("itemId", "Item", data.items)}{(mode === "use" || mode === "transfer") && picker("fromStationId", "From station", data.stations)}{(mode === "receive" || mode === "transfer") && picker("toStationId", "To station", data.stations)}{field("quantity", `Quantity (${unitFor(form.itemId)})`, { type: "number", min: 1, required: true })}{field("note", "Note", { placeholder: "Optional reference or reason" })}</>}
      {mode === "produce" && <>{picker("fromStationId", "Workstation using material", data.stations)}{picker("itemId", "Material item", data.items)}{field("quantity", `Material used (${unitFor(form.itemId)})`, { type: "number", min: 1, required: true })}{picker("toStationId", "Next workstation / stock location", data.stations)}{picker("outputItemId", "Produced stock item (pieces)", data.items.filter(i => i.unit.toLowerCase() === "pieces"))}{field("outputQuantity", "Stock produced (pieces)", { type: "number", min: 1, required: true })}<p className="cell-sub">Create a separate item with unit “pieces” in Item catalog if it is missing. The material total decreases; the piece stock total increases.</p>{field("note", "Note", { placeholder: "Optional cut length or batch reference" })}</>}
      {error && <div className="error" role="alert">{error}</div>}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" disabled={busy || (["receive", "use", "transfer", "produce"].includes(mode || "") && (!data.items.length || !data.stations.length || (mode === "produce" && !data.items.some(i => i.unit.toLowerCase() === "pieces"))))}>{busy ? "Saving…" : "Save change"}</Button></div>
    </form></DialogContent></Dialog>
  </div>;
}
