"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Customer = {
  id: number;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerZip: string;
  shipTo: string;
  shipToAddress: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;
  contactName: string;
  contactPhone: string;
  email: string;
  comments: string;
  createdAt: string;
  updatedAt: string;
  orderCount: number;
  lastOrderAt: string | null;
};

const blank = {
  customerName: "", customerAddress: "", customerCity: "", customerState: "", customerZip: "",
  shipTo: "", shipToAddress: "", shipToCity: "", shipToState: "", shipToZip: "",
  contactName: "", contactPhone: "", email: "", comments: "",
};

export default function Customers({ startCreateSignal = 0 }: { startCreateSignal?: number }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/customers", { cache: "no-store" });
      const result = await response.json() as { customers?: Customer[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load customers.");
      setCustomers(result.customers || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => [c.customerName,c.contactName,c.contactPhone,c.email,c.customerCity,c.customerState,c.shipTo].some(v => v.toLowerCase().includes(q)));
  }, [customers, query]);

  const set = (name: keyof typeof blank, value: string) => setForm(old => ({ ...old, [name]: value }));

  function openNew() {
    setEditing(null); setForm(blank); setError(""); setNotice(""); setCreating(true);
  }

  useEffect(() => {
    if (startCreateSignal > 0) openNew();
  }, [startCreateSignal]);

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      customerName: customer.customerName,
      customerAddress: customer.customerAddress,
      customerCity: customer.customerCity,
      customerState: customer.customerState,
      customerZip: customer.customerZip,
      shipTo: customer.shipTo,
      shipToAddress: customer.shipToAddress,
      shipToCity: customer.shipToCity,
      shipToState: customer.shipToState,
      shipToZip: customer.shipToZip,
      contactName: customer.contactName,
      contactPhone: customer.contactPhone,
      email: customer.email,
      comments: customer.comments,
    });
    setError(""); setNotice(""); setCreating(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: editing ? "update" : "create", id: editing?.id, ...form }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save customer.");
      setCreating(false);
      setNotice(editing ? "Customer updated." : "Customer saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save customer.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">SALES & ORDERING</div><h1>Customer profiles</h1><p>Build and maintain reusable customer, shipping, contact, and service records for ordering and sales.</p></div>
      <Button onClick={openNew}><Plus size={17}/> New customer profile</Button>
    </div>
    {notice && <div className="notice" role="status">{notice}</div>}
    {error && !creating && <div className="error" role="alert">{error}</div>}
    <section className="panel">
      <div className="panel-title">
        <div><h2><Users size={19}/> Customer profiles</h2><p>{customers.length} saved customer{customers.length === 1 ? "" : "s"}</p></div>
        <label className="search"><Search size={17}/><input aria-label="Search customers" placeholder="Search customer, contact, phone, email..." value={query} onChange={e => setQuery(e.target.value)} /></label>
      </div>
      <div className="table-scroll"><Table>
        <TableHeader><TableRow><TableHead>CUSTOMER</TableHead><TableHead>CONTACT</TableHead><TableHead>PHONE / EMAIL</TableHead><TableHead>SHIP TO</TableHead><TableHead className="text-right">ACTION</TableHead></TableRow></TableHeader>
        <TableBody>{visible.map(customer => <TableRow key={customer.id}>
          <TableCell><strong>{customer.customerName}</strong><span className="cell-sub">{[customer.customerAddress,customer.customerCity,customer.customerState,customer.customerZip].filter(Boolean).join(", ") || "No billing address"}</span></TableCell>
          <TableCell>{customer.contactName || "—"}</TableCell>
          <TableCell>{customer.contactPhone || "—"}<span className="cell-sub">{customer.email || ""}</span></TableCell>
          <TableCell><strong>{customer.shipTo || customer.customerName}</strong><span className="cell-sub">{[customer.shipToAddress,customer.shipToCity,customer.shipToState,customer.shipToZip].filter(Boolean).join(", ") || "Same / not entered"}</span></TableCell>
          <TableCell className="text-right"><div className="customer-row-actions"><Button size="sm" variant="ghost" onClick={() => setProfile(customer)}>View</Button><Button size="sm" variant="ghost" onClick={() => openEdit(customer)}>Edit</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
      {!loading && !visible.length && <div className="empty"><strong>{customers.length ? "No customers match your search" : "No customers saved yet"}</strong><p>Add the first customer to reuse their information on future orders.</p><Button onClick={openNew}>Add customer</Button></div>}
      {loading && <div className="empty">Loading customers…</div>}
    </section>

    <Dialog open={creating} onOpenChange={v => { if (!v) { setCreating(false); setError(""); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? "Edit customer profile" : "Build customer profile"}</DialogTitle><DialogDescription>Save billing, shipping, and contact information for future ordering and sales.</DialogDescription></DialogHeader>
        <form className="form" onSubmit={save}>
          <label className="field"><span>Customer name *</span><Input required maxLength={160} value={form.customerName} onChange={e => set("customerName", e.target.value)} /></label>
          <label className="field"><span>Customer address</span><Input maxLength={200} value={form.customerAddress} onChange={e => set("customerAddress", e.target.value)} /></label>
          <div className="form-grid"><label className="field"><span>City</span><Input maxLength={120} value={form.customerCity} onChange={e => set("customerCity", e.target.value)} /></label><label className="field"><span>State</span><Input maxLength={80} value={form.customerState} onChange={e => set("customerState", e.target.value)} /></label><label className="field"><span>ZIP</span><Input maxLength={30} value={form.customerZip} onChange={e => set("customerZip", e.target.value)} /></label></div>

          <div className="rail-label">SHIPPING</div>
          <Button type="button" variant="outline" className="self-start" onClick={() => setForm(old => ({ ...old, shipTo: old.customerName, shipToAddress: old.customerAddress, shipToCity: old.customerCity, shipToState: old.customerState, shipToZip: old.customerZip }))}>Same as customer address</Button>
          <label className="field"><span>Ship to</span><Input maxLength={200} value={form.shipTo} onChange={e => set("shipTo", e.target.value)} placeholder="Company, department, or recipient" /></label>
          <label className="field"><span>Ship to address</span><Input maxLength={200} value={form.shipToAddress} onChange={e => set("shipToAddress", e.target.value)} /></label>
          <div className="form-grid"><label className="field"><span>Ship to city</span><Input maxLength={120} value={form.shipToCity} onChange={e => set("shipToCity", e.target.value)} /></label><label className="field"><span>Ship to state</span><Input maxLength={80} value={form.shipToState} onChange={e => set("shipToState", e.target.value)} /></label><label className="field"><span>Ship to ZIP</span><Input maxLength={30} value={form.shipToZip} onChange={e => set("shipToZip", e.target.value)} /></label></div>

          <div className="rail-label">CONTACT</div>
          <label className="field"><span>Contact name</span><Input maxLength={160} value={form.contactName} onChange={e => set("contactName", e.target.value)} /></label>
          <div className="form-grid"><label className="field"><span>Contact phone #</span><Input type="tel" maxLength={60} value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} /></label><label className="field"><span>Email address</span><Input type="email" maxLength={200} value={form.email} onChange={e => set("email", e.target.value)} /></label></div>
          <label className="field"><span>Customer service / sales notes</span><textarea rows={5} maxLength={4000} value={form.comments} onChange={e => set("comments", e.target.value)} placeholder="Service history, sales notes, preferences, terms, special instructions, etc." /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="form-actions"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save customer profile" : "Create customer profile"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={!!profile} onOpenChange={v => { if (!v) setProfile(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{profile?.customerName || "Customer profile"}</DialogTitle><DialogDescription>Saved customer details and ordering history.</DialogDescription></DialogHeader>
        {profile && <div className="customer-profile">
          <section><h3>Customer address</h3><p>{profile.customerAddress || "—"}<br/>{[profile.customerCity, profile.customerState, profile.customerZip].filter(Boolean).join(", ") || "—"}</p></section>
          <section><h3>Ship to</h3><p><strong>{profile.shipTo || profile.customerName}</strong><br/>{profile.shipToAddress || "—"}<br/>{[profile.shipToCity, profile.shipToState, profile.shipToZip].filter(Boolean).join(", ") || "—"}</p></section>
          <section><h3>Contact</h3><p><strong>{profile.contactName || "—"}</strong><br/>{profile.contactPhone || "—"}<br/>{profile.email || "—"}</p></section>
          <section><h3>Order history</h3><p><strong>{profile.orderCount || 0}</strong> linked order{profile.orderCount === 1 ? "" : "s"}{profile.lastOrderAt ? <> · Last order {new Date(profile.lastOrderAt).toLocaleDateString()}</> : ""}</p></section>
          <section className="customer-profile-comments"><h3>Comments</h3><p>{profile.comments || "No customer comments."}</p></section>
          <div className="form-actions"><Button variant="outline" onClick={() => { const current = profile; setProfile(null); openEdit(current); }}>Edit customer</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
