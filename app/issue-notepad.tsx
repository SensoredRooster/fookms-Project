"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardPenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Screen = "floor" | "orders" | "inventory" | "stations" | "catalog" | "issues";
type Issue = { id: number; reporterEmail: string; title: string; details: string; steps: string; screen: Screen; severity: string; status: "open" | "resolved"; createdAt: string; updatedAt: string };
const labels: Record<Screen, string> = { floor: "Floor plan", orders: "Orders", inventory: "Inventory", stations: "Workstations", catalog: "Item catalog", issues: "Issue notepad" };

export default function IssueNotepad({ initialScreen }: { initialScreen: Screen }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("");
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [severity, setSeverity] = useState("normal");
  const [filter, setFilter] = useState<"open" | "all" | "resolved">("open");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/issues", { cache: "no-store" });
      const result = await response.json() as { issues?: Issue[]; owner?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load notes.");
      setIssues(result.issues || []); setOwner(!!result.owner); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load notes."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title, details, steps, screen, severity }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save note.");
      setTitle(""); setDetails(""); setSteps(""); setSeverity("normal"); setFilter("open");
      setNotice("Issue saved. The developer can review it here.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save note."); }
    finally { setBusy(false); }
  }

  async function setStatus(issue: Issue) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const status = issue.status === "open" ? "resolved" : "open";
      const response = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", id: issue.id, status }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update issue.");
      setNotice(`Issue ${status}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update issue."); }
    finally { setBusy(false); }
  }

  const visible = issues.filter(issue => filter === "all" || issue.status === filter);
  return <div className="issues-page">
    <div className="page-heading"><div><div className="eyebrow">TESTING FEEDBACK</div><h1>Issue notepad</h1><p>Log a problem as soon as you find it. Notes are saved with your account and visible to the developer.</p></div><Button variant="outline" onClick={() => void load()} disabled={busy}>Refresh notes</Button></div>
    {notice && <div className="notice" role="status">{notice}</div>}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="issues-layout">
      <section className="panel issues-compose"><h2><ClipboardPenLine size={20}/> New issue</h2><form className="form" onSubmit={submit}>
        <label className="field"><span>Short title *</span><Input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Save button does not respond" /></label>
        <div className="form-grid"><label className="field"><span>Screen</span><select value={screen} onChange={e => setScreen(e.target.value as Screen)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Priority</span><select value={severity} onChange={e => setSeverity(e.target.value)}><option value="normal">Normal</option><option value="high">High — blocks testing</option><option value="low">Low</option></select></label></div>
        <label className="field"><span>What happened? *</span><textarea required maxLength={4000} rows={5} value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe what you saw and what you expected." /></label>
        <label className="field"><span>Steps to repeat it</span><textarea maxLength={2000} rows={3} value={steps} onChange={e => setSteps(e.target.value)} placeholder="1. Open Orders&#10;2. Select an order&#10;3. ..." /></label>
        <div className="issues-compose-footer"><small>Your note is saved when you select Log issue.</small><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log issue"}</Button></div>
      </form></section>
      <section className="panel issues-list"><div className="issues-list-head"><div><h2>{owner ? "All tester notes" : "My notes"}</h2><p>{issues.filter(i => i.status === "open").length} open · {issues.length} recorded</p></div><div className="issues-filters" aria-label="Filter issues">{(["open", "all", "resolved"] as const).map(value => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div></div>
        {loading ? <div className="empty">Loading notes…</div> : !visible.length ? <div className="empty"><strong>{filter === "all" ? "No issues logged yet" : `No ${filter} issues`}</strong><p>Use the notepad to record anything that needs attention.</p></div> : <div className="issues-cards">{visible.map(issue => <article className="issue-card" key={issue.id}><div className="issue-card-top"><span className={`issue-priority priority-${issue.severity}`}>{issue.severity} priority</span><span className={`badge ${issue.status === "open" ? "badge-processing" : "badge-fulfilled"}`}>{issue.status}</span></div><h3>#{issue.id} · {issue.title}</h3><div className="issue-meta">{labels[issue.screen] || issue.screen} · {new Date(issue.createdAt).toLocaleString()}{owner && <> · {issue.reporterEmail}</>}</div><p>{issue.details}</p>{issue.steps && <div className="issue-steps"><strong>Steps to repeat</strong><p>{issue.steps}</p></div>}{owner && <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus(issue)}>{issue.status === "open" ? <><CheckCircle2 size={15}/> Mark resolved</> : <><RotateCcw size={15}/> Reopen</>}</Button>}</article>)}</div>}
      </section>
    </div>
  </div>;
}
