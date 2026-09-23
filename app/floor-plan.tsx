"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers3, Minus, Plus, Ruler, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Station = { id: number; name: string; action: string; x: number; y: number; width: number; height: number; activeItems: number };
type Feature = { id: number; name: string; kind: "room" | "aisle" | "wall"; x: number; y: number; width: number; height: number };
type Floor = { settings: { width: number; height: number }; stations: Station[]; features: Feature[] };
type Selection = { type: "station" | "feature"; id: number } | null;
type Draft = { name: string; kind: "room" | "aisle" | "wall"; x: string; y: string; width: string; height: string };
const first: Floor = { settings: { width: 80, height: 50 }, stations: [], features: [] };
const defaultDraft: Draft = { name: "", kind: "room", x: "2", y: "2", width: "12", height: "8" };
const kinds = ["room", "aisle", "wall"] as const;
export default function FloorPlan({ onAddStation, onOpenStation, onOpenOrders, stationVersion }: { onAddStation: () => void; onOpenStation: (id: number) => void; onOpenOrders: (id: number) => void; stationVersion: string }) {
  const [floor, setFloor] = useState<Floor>(first);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [dimensions, setDimensions] = useState({ width: "80", height: "50" });
  const [adding, setAdding] = useState(false);
  const [newArea, setNewArea] = useState<Draft>(defaultDraft);
  const [edit, setEdit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ type: "station" | "feature"; id: number; x: number; y: number; clientX: number; clientY: number; latestX: number; latestY: number } | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/floor", { cache: "no-store" });
      const result = await response.json() as Floor & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load floor plan.");
      setFloor(result); setDimensions({ width: String(result.settings.width), height: String(result.settings.height) }); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load floor plan."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, stationVersion]);
  const chosen = selection?.type === "station" ? floor.stations.find(s => s.id === selection.id) : selection?.type === "feature" ? floor.features.find(f => f.id === selection.id) : null;
  const unit = 14 * zoom;
  function select(type: "station" | "feature", value: Station | Feature) {
    setSelection({ type, id: value.id });
    setDraft({ name: value.name, kind: "kind" in value ? value.kind : "room", x: String(value.x), y: String(value.y), width: String(value.width), height: String(value.height) });
  }
  async function write(body: Record<string, unknown>, message: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save floor plan.");
      setNotice(message); await load();
      return true;
    } catch (e) { const message = e instanceof Error ? e.message : "Could not save floor plan."; await load(); setError(message); return false; }
    finally { setBusy(false); }
  }
  function pointerStart(event: React.PointerEvent<HTMLElement>, type: "station" | "feature", value: Station | Feature) {
    select(type, value);
    if (!edit) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { type, id: value.id, x: value.x, y: value.y, clientX: event.clientX, clientY: event.clientY, latestX: value.x, latestY: value.y };
  }
  function pointerMove(event: React.PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    const value = current.type === "station" ? floor.stations.find(s => s.id === current.id) : floor.features.find(f => f.id === current.id);
    if (!value) return;
    const x = Math.max(0, Math.min(floor.settings.width - value.width, current.x + Math.round((event.clientX - current.clientX) / unit)));
    const y = Math.max(0, Math.min(floor.settings.height - value.height, current.y + Math.round((event.clientY - current.clientY) / unit)));
    current.latestX = x; current.latestY = y;
    setFloor(old => current.type === "station" ? { ...old, stations: old.stations.map(s => s.id === current.id ? { ...s, x, y } : s) } : { ...old, features: old.features.map(f => f.id === current.id ? { ...f, x, y } : f) });
    setDraft(old => ({ ...old, x: String(x), y: String(y) }));
  }
  function pointerEnd() {
    const current = drag.current; drag.current = null;
    if (!current || (current.x === current.latestX && current.y === current.latestY)) return;
    const value = current.type === "station" ? floor.stations.find(s => s.id === current.id) : floor.features.find(f => f.id === current.id);
    if (!value) return;
    if (current.type === "station") void write({ action: "station_position", stationId: current.id, x: current.latestX, y: current.latestY, width: value.width, height: value.height }, "Station moved.");
    else void write({ action: "feature_update", featureId: current.id, name: value.name, kind: (value as Feature).kind, x: current.latestX, y: current.latestY, width: value.width, height: value.height }, "Area moved.");
  }
  const coordinates = (value: { x: number; y: number; width: number; height: number }) => ({ left: value.x * unit, top: value.y * unit, width: value.width * unit, height: value.height * unit });
  function numbers(value: Draft) { return { x: Number(value.x), y: Number(value.y), width: Number(value.width), height: Number(value.height) }; }
  function place(station: Station) {
    const placed = floor.stations.filter(s => s.x >= 0).length;
    const x = Math.min(floor.settings.width - station.width, 2 + (placed % 6) * 11);
    const y = Math.min(floor.settings.height - station.height, 2 + Math.floor(placed / 6) * 9);
    void write({ action: "station_position", stationId: station.id, x, y, width: station.width, height: station.height }, "Station placed.");
  }
  return <div className="floor-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Floor plan</h1><p>Place workstations and map the rooms, aisles, and walls of your actual floor.</p></div><div className="heading-actions"><Button variant="outline" onClick={() => { setNewArea(defaultDraft); setAdding(true); }}><Plus size={16}/> Add area</Button><Button onClick={onAddStation}><Plus size={16}/> Add station</Button></div></div>
    {error && <div className="error" role="alert">{error} <button onClick={() => void load()}>Retry</button></div>}{notice && <div className="notice" role="status">{notice}</div>}
    <div className="floor-layout"><section className="floor-main-panel"><div className="floor-toolbar"><div><strong><Ruler size={17}/> {floor.settings.width} × {floor.settings.height} ft</strong><span>{floor.stations.filter(s => s.x >= 0).length} stations placed · {floor.features.length} areas</span></div><div className="floor-tools"><Button variant={edit ? "default" : "outline"} size="sm" onClick={() => setEdit(v => !v)}>{edit ? "Editing layout" : "View layout"}</Button><Button variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.5, Math.round((z-.25)*100)/100))}><Minus size={15}/></Button><span>{Math.round(zoom*100)}%</span><Button variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.5, Math.round((z+.25)*100)/100))}><Plus size={15}/></Button></div></div>
      <div className="floor-viewport"><div className="floor-canvas" role="group" aria-label="Editable floor plan" style={{ width: floor.settings.width*unit, height: floor.settings.height*unit, backgroundSize: `${unit*5}px ${unit*5}px` }}>
        {floor.features.map(f => <button key={f.id} type="button" className={`floor-feature kind-${f.kind} ${selection?.type === "feature" && selection.id === f.id ? "selected" : ""} ${edit ? "draggable" : ""}`} style={coordinates(f)} onPointerDown={e => pointerStart(e,"feature",f)} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onClick={() => select("feature",f)} aria-label={`${f.kind}: ${f.name}`}><span>{f.name}</span></button>)}
        {floor.stations.filter(s => s.x >= 0).map(s => <button key={s.id} type="button" className={`floor-station ${selection?.type === "station" && selection.id === s.id ? "selected" : ""} ${edit ? "draggable" : ""}`} style={coordinates(s)} onPointerDown={e => pointerStart(e,"station",s)} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onClick={() => select("station",s)} aria-label={`Station ${s.name}, ${s.activeItems} active items`}><Warehouse size={17}/><strong>{s.name}</strong><small>{s.activeItems} active</small></button>)}
        <span className="floor-scale">Each grid square = 5 ft</span>
      </div></div>
      {floor.stations.some(s => s.x < 0) && <div className="unplaced"><strong>Unplaced stations</strong><p>Place these on the plan, then drag them into position.</p><div>{floor.stations.filter(s => s.x < 0).map(s => <Button variant="outline" key={s.id} onClick={() => place(s)} disabled={busy}><Plus size={15}/> {s.name}</Button>)}</div></div>}
      {!loading && !floor.stations.length && <div className="empty"><strong>Start with your first station</strong><p>Add a workstation, then place it where it sits on your floor.</p><Button onClick={onAddStation}>Add station</Button></div>}
    </section><aside className="floor-inspector"><div className="inspector-heading"><Layers3 size={18}/><strong>Floor details</strong></div>
      <div className="inspector-section"><h3>Floor size</h3><p>Measure in feet. Adjust the outline to match your building.</p><div className="form-grid"><label className="field"><span>Width (ft)</span><Input type="number" min={20} max={300} value={dimensions.width} onChange={e => setDimensions(v => ({ ...v, width: e.target.value }))}/></label><label className="field"><span>Depth (ft)</span><Input type="number" min={20} max={200} value={dimensions.height} onChange={e => setDimensions(v => ({ ...v, height: e.target.value }))}/></label></div><Button variant="outline" disabled={busy} onClick={() => void write({ action: "settings", width: Number(dimensions.width), height: Number(dimensions.height) }, "Floor size saved.")}>Save floor size</Button></div>
      <div className="inspector-section"><h3>{chosen ? selection?.type === "station" ? "Workstation" : "Floor area" : "Select an element"}</h3>{!chosen ? <p>Click a station or area on the plan to edit its position and size.</p> : <div className="form">{selection?.type === "station" ? <><strong>{chosen.name}</strong><p>{(chosen as Station).action || "No station action set yet."}</p><p>{(chosen as Station).activeItems} active order items</p></> : <label className="field"><span>Area name</span><Input value={draft.name} onChange={e => setDraft(v => ({ ...v, name: e.target.value }))}/></label>}{selection?.type === "feature" && <label className="field"><span>Area type</span><Select value={draft.kind} onValueChange={v => setDraft(old => ({ ...old, kind: v as Draft["kind"] }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{kinds.map(kind => <SelectItem key={kind} value={kind} className="capitalize">{kind}</SelectItem>)}</SelectContent></Select></label>}
        <div className="inspector-grid">{(["x","y","width","height"] as const).map(key => <label className="field" key={key}><span>{({x:"From left",y:"From top",width:"Width",height:"Depth"})[key]} (ft)</span><Input type="number" min={key==="width" || key==="height" ? selection?.type === "station" ? 2 : 1 : 0} value={draft[key]} onChange={e => setDraft(old => ({ ...old, [key]: e.target.value }))}/></label>)}</div><Button disabled={busy} onClick={() => { const values=numbers(draft); void write(selection?.type === "station" ? { action:"station_position", stationId:chosen.id, ...values } : { action:"feature_update", featureId:chosen.id, name:draft.name, kind:draft.kind, ...values }, "Layout updated."); }}>Save placement</Button>{selection?.type === "station" ? <div className="inspector-links"><Button variant="outline" onClick={() => onOpenStation(chosen.id)}>Station inventory</Button><Button variant="outline" onClick={() => onOpenOrders(chosen.id)}>Station orders</Button><Button variant="ghost" onClick={() => { void write({ action:"station_position", stationId:chosen.id, x:-1, y:-1, width:chosen.width, height:chosen.height }, "Station unplaced."); setSelection(null); }}>Remove from plan</Button></div> : <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive">Delete area</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this area?</AlertDialogTitle><AlertDialogDescription>This removes the area shape from the floor plan. Stations and orders are unaffected.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep area</AlertDialogCancel><AlertDialogAction onClick={() => { void write({ action:"feature_delete", featureId:chosen.id }, "Area deleted."); setSelection(null); }}>Delete area</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>}</div>
    </aside></div>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Add floor area</DialogTitle><DialogDescription>Mark a room, aisle, or wall. Its measurements use feet.</DialogDescription></DialogHeader><form className="form" onSubmit={async e => { e.preventDefault(); if(await write({ action:"feature_create", name:newArea.name, kind:newArea.kind, ...numbers(newArea) }, "Area added.")) setAdding(false); }}><label className="field"><span>Name</span><Input required maxLength={80} value={newArea.name} onChange={e => setNewArea(v => ({...v,name:e.target.value}))} placeholder="e.g. Packaging room"/></label><label className="field"><span>Type</span><Select value={newArea.kind} onValueChange={v => setNewArea(old => ({...old,kind:v as Draft["kind"]}))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{kinds.map(kind => <SelectItem key={kind} value={kind} className="capitalize">{kind}</SelectItem>)}</SelectContent></Select></label><div className="inspector-grid">{(["x","y","width","height"] as const).map(key => <label className="field" key={key}><span>{({x:"From left",y:"From top",width:"Width",height:"Depth"})[key]}</span><Input type="number" required min={key==="width" || key==="height" ? 1 : 0} value={newArea[key]} onChange={e => setNewArea(old => ({...old,[key]:e.target.value}))}/></label>)}</div>{error && <div className="error">{error}</div>}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={busy}>Add area</Button></div></form></DialogContent></Dialog>
  </div>;
}
