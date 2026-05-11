"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Plus, Pencil, Trash2, X, Check, ChevronDown, Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CATEGORIES = [
  { value: "subscription", label: "Abonnement" },
  { value: "salary",       label: "Salaris" },
  { value: "other",        label: "Overige" },
];

interface MonthData {
  month: string; orders: number; gross_revenue: number; return_amount: number;
  net_revenue: number; ad_spend: number; product_cost: number; overhead: number;
  profit: number; margin: number;
}
interface PnLTotals {
  orders: number; gross_revenue: number; return_amount: number; net_revenue: number;
  ad_spend: number; product_cost: number; overhead: number; profit: number;
}
interface PnLResponse { year: string; months: MonthData[]; totals: PnLTotals; }
interface OverheadCost {
  id: string; store_id: string; name: string; category: string;
  amount: number; recurring: "monthly" | "yearly"; active: number;
}
interface Draft { name: string; category: string; amount: string; recurring: "monthly" | "yearly"; }

const EMPTY: Draft = { name: "", category: "subscription", amount: "", recurring: "monthly" };

function fmt(n: number) {
  return "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hasData(m: MonthData) { return m.orders > 0 || m.gross_revenue !== 0 || m.net_revenue !== 0; }

const NOW_MONTH = new Date().getMonth() + 1;
const NOW_YEAR  = new Date().getFullYear();

export default function PnLPage() {
  const { stores } = useStores();
  const [store, setStore] = useState("ceofo");
  const [year, setYear]   = useState(2026);
  const [tab, setTab]     = useState<"overview" | "costs">("overview");

  useEffect(() => {
    if (stores.length > 0 && !stores.find(s => s.id === store)) setStore(stores[0].id);
  }, [stores]);

  // P&L data
  const [data, setData]       = useState<PnLResponse | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true); setData(null);
    fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
      .then(r => r.json()).then((d: PnLResponse) => setData(d))
      .catch(() => {}).finally(() => setLoading(false));
  }, [store, year]);

  // Overhead data
  const [costs, setCosts]     = useState<OverheadCost[]>([]);
  const [cLoading, setCLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft]     = useState<Draft>(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    setCLoading(true);
    fetch(`${API}/api/overhead?store_id=${store}`, { cache: "no-store" })
      .then(r => r.json()).then((d: { costs: OverheadCost[] }) => setCosts(d.costs ?? []))
      .catch(() => {}).finally(() => setCLoading(false));
  }, [store]);

  // Collapsible months
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(k: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  const totals = data?.totals;
  const months = data?.months ?? [];
  const totalMargin = totals && totals.net_revenue > 0
    ? Math.round((totals.profit / totals.net_revenue) * 100) : 0;
  const totalOverhead = totals?.overhead ?? 0;

  const chartData = months.map((m, i) => ({ name: MONTH_NAMES[i], profit: m.profit, active: hasData(m) }));

  function refreshPnL() {
    fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
      .then(r => r.json()).then((d: PnLResponse) => setData(d)).catch(() => {});
  }

  async function addCost() {
    if (!draft.name || !draft.amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/overhead`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: store, name: draft.name, category: draft.category, amount: parseFloat(draft.amount), recurring: draft.recurring }),
      });
      const d = await r.json();
      if (d.ok) { setCosts(p => [...p, d.cost]); setDraft(EMPTY); setShowAdd(false); refreshPnL(); }
    } finally { setSaving(false); }
  }

  async function saveCost(id: string) {
    if (!editDraft.name || !editDraft.amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/overhead/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDraft.name, category: editDraft.category, amount: parseFloat(editDraft.amount), recurring: editDraft.recurring }),
      });
      const d = await r.json();
      if (d.ok) { setCosts(p => p.map(c => c.id === id ? d.cost : c)); setEditId(null); refreshPnL(); }
    } finally { setSaving(false); }
  }

  async function deleteCost(id: string) {
    await fetch(`${API}/api/overhead/${id}`, { method: "DELETE" });
    setCosts(p => p.filter(c => c.id !== id));
    refreshPnL();
  }

  function startEdit(c: OverheadCost) {
    setEditId(c.id);
    setEditDraft({ name: c.name, category: c.category, amount: String(c.amount), recurring: c.recurring });
  }

  return (
    <div className="p-6 space-y-5 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" /> Profit &amp; Loss
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Monthly overview of revenue, costs and profit</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[2024, 2025, 2026].map(y => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${year === y ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                {y}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {stores.map(s => (
              <button key={s.id} onClick={() => setStore(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${store === s.id ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Net Revenue",    value: totals ? fmt(totals.net_revenue)  : "—", color: "text-emerald-400", sub: "After returns" },
          { label: "Ad Spend",    value: totals ? fmt(totals.ad_spend)      : "—", color: "text-red-400",     sub: "Total ad spend" },
          { label: "Product Costs",  value: totals ? fmt(totals.product_cost)  : "—", color: "text-amber-400",   sub: "COGS" },
          { label: "Fixed Costs",   value: fmt(totalOverhead),                       color: "text-purple-400",  sub: `${costs.filter(c => c.active).length} active costs` },
          { label: "Net Profit",    value: totals ? fmt(totals.profit)        : "—",
            color: !totals ? "text-zinc-400" : totals.profit >= 0 ? "text-emerald-400" : "text-red-400",
            sub: totals ? `${totalMargin}% margin` : "Margin %",
            highlight: totals ? (totals.profit >= 0 ? "bg-emerald-950/30 border-emerald-500/20" : "bg-red-950/30 border-red-500/20") : "" },
        ].map(card => (
          <div key={card.label} className={`border rounded-2xl p-4 ${card.highlight ?? "bg-white/3 border-white/5"}`}>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{card.label}</p>
            <p className={`text-2xl font-black ${card.color}`}>{loading ? "—" : card.value}</p>
            <p className="text-[11px] text-zinc-600 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        <button onClick={() => setTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "overview" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          <TrendingUp size={13} /> Monthly overview
        </button>
        <button onClick={() => setTab("costs")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "costs" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
          <Receipt size={13} /> Fixed Costs
          {costs.length > 0 && (
            <span className="bg-purple-500/30 text-purple-300 text-[10px] rounded-full px-1.5 font-bold">{costs.length}</span>
          )}
        </button>
      </div>

      {/* ── TAB: Monthly overview ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Chart */}
          <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-widest">Profit trend {year}</p>
            {loading ? (
              <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#111117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12, color: "#e4e4e7" }}
                    formatter={(v: number) => [fmt(v), "Profit"]}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {chartData.map((e, i) => (
                      <Cell key={i} fill={!e.active ? "rgba(255,255,255,0.05)" : e.profit >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Collapsible month rows */}
          <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-4 py-2.5 border-b border-white/5">
              {["Month", "Orders", "Net Revenue", "Profit", "Margin"].map((h, i) => (
                <span key={h} className={`text-[10px] text-zinc-600 uppercase tracking-widest font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="p-8 text-center text-zinc-600 text-sm">Loading…</div>
            ) : (
              <div className="divide-y divide-white/5">
                {months.map((m, i) => {
                  const isCurrent = year === NOW_YEAR && i + 1 === NOW_MONTH;
                  const active    = hasData(m);
                  const isOpen    = expanded.has(m.month);

                  return (
                    <div key={m.month}>
                      <button
                        onClick={() => active && toggle(m.month)}
                        className={`w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-4 py-3 transition-all ${
                          isCurrent ? "bg-blue-950/20 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"
                        } ${active ? "hover:bg-white/3 cursor-pointer" : "cursor-default"}`}
                      >
                        {/* Month name */}
                        <div className="flex items-center gap-2">
                          {active
                            ? <ChevronDown size={12} className={`text-zinc-500 shrink-0 transition-transform duration-150 ${isOpen ? "" : "-rotate-90"}`} />
                            : <span className="w-3 shrink-0" />
                          }
                          <span className={`text-sm font-semibold ${isCurrent ? "text-blue-300" : active ? "text-zinc-200" : "text-zinc-700"}`}>
                            {MONTH_NAMES[i]}
                          </span>
                          {isCurrent && <span className="text-[9px] bg-blue-500/20 text-blue-400 rounded px-1.5 py-0.5 font-bold">NOW</span>}
                        </div>
                        {/* Orders */}
                        <span className={`text-sm text-right tabular-nums ${active ? "text-zinc-300" : "text-zinc-700"}`}>
                          {active ? m.orders : "—"}
                        </span>
                        {/* Net revenue */}
                        <span className={`text-sm text-right tabular-nums font-medium ${active ? "text-zinc-200" : "text-zinc-700"}`}>
                          {active ? fmt(m.net_revenue) : "—"}
                        </span>
                        {/* Profit */}
                        <span className={`text-sm text-right tabular-nums font-bold ${!active ? "text-zinc-700" : m.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {active ? fmt(m.profit) : "—"}
                        </span>
                        {/* Margin */}
                        <span className={`text-sm text-right tabular-nums ${!active ? "text-zinc-700" : m.margin >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                          {active ? `${m.margin}%` : "—"}
                        </span>
                      </button>

                      {/* Expanded breakdown */}
                      {isOpen && active && (
                        <div className="mx-4 mb-2 rounded-xl bg-black/20 border border-white/5 overflow-hidden">
                          {[
                            { label: "Gross Revenue",    value: fmt(m.gross_revenue),                                 color: "text-zinc-300" },
                            { label: "Returns",          value: m.return_amount > 0 ? `−${fmt(m.return_amount)}` : "—", color: "text-red-400" },
                            { label: "Ad Spend", value: m.ad_spend > 0 ? `−${fmt(m.ad_spend)}` : "—",      color: "text-red-400" },
                            { label: "Product Costs",   value: m.product_cost > 0 ? `−${fmt(m.product_cost)}` : "—", color: "text-amber-400" },
                            { label: "Fixed Costs",    value: m.overhead > 0 ? `−${fmt(m.overhead)}` : "—",        color: "text-purple-400" },
                          ].map((row, ri) => (
                            <div key={row.label} className={`flex items-center justify-between px-4 py-2 ${ri < 4 ? "border-b border-white/5" : ""}`}>
                              <span className="text-xs text-zinc-500">{row.label}</span>
                              <span className={`text-xs font-semibold tabular-nums ${row.color}`}>{row.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totals */}
            {totals && !loading && (
              <div className="border-t border-white/10 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-4 py-3 bg-white/2">
                <span className="text-xs font-bold text-zinc-300 pl-5">Total {year}</span>
                <span className="text-xs font-bold text-zinc-300 text-right tabular-nums">{totals.orders}</span>
                <span className="text-xs font-bold text-zinc-200 text-right tabular-nums">{fmt(totals.net_revenue)}</span>
                <span className={`text-xs font-bold text-right tabular-nums ${totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(totals.profit)}
                </span>
                <span className={`text-xs font-bold text-right tabular-nums ${totalMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalMargin}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Fixed Costs ── */}
      {tab === "costs" && (
        <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <p className="text-sm font-bold text-white">Fixed Costs</p>
              <p className="text-xs text-zinc-500 mt-0.5">Abonnementen, salarissen en overige vaste lasten</p>
            </div>
            <button
              onClick={() => { setShowAdd(true); setEditId(null); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all"
            >
              <Plus size={13} /> Add cost
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="px-5 py-4 border-b border-white/5 bg-blue-950/10">
              <p className="text-xs font-semibold text-blue-300 mb-3">Nieuwe kost</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <input
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                  placeholder="Name (e.g. Shopify)"
                  value={draft.name}
                  onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                />
                <select
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50"
                  value={draft.category}
                  onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input
                  type="number"
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                  placeholder="Amount in €"
                  value={draft.amount}
                  onChange={e => setDraft(p => ({ ...p, amount: e.target.value }))}
                />
                <select
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50"
                  value={draft.recurring}
                  onChange={e => setDraft(p => ({ ...p, recurring: e.target.value as "monthly" | "yearly" }))}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly (÷12)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={addCost} disabled={saving || !draft.name || !draft.amount}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
                  {saving ? "Saving…" : "Add"}
                </button>
                <button onClick={() => { setShowAdd(false); setDraft(EMPTY); }}
                  className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-xs rounded-lg transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cost rows */}
          {cLoading ? (
            <div className="p-10 text-center text-zinc-600 text-sm">Loading…</div>
          ) : costs.length === 0 && !showAdd ? (
            <div className="p-10 text-center space-y-2">
              <Receipt size={32} className="text-zinc-700 mx-auto" />
              <p className="text-zinc-500 text-sm">No fixed costs yet</p>
              <p className="text-zinc-700 text-xs">Click &quot;Add cost&quot; to get started</p>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] px-5 py-2 border-b border-white/5">
                {["Name","Category","Amount","Frequency",""].map((h, i) => (
                  <span key={i} className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-white/5">
                {costs.map(c => (
                  <div key={c.id} className="px-5 py-3">
                    {editId === c.id ? (
                      /* Edit row */
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                            value={editDraft.name} onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} />
                          <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none"
                            value={editDraft.category} onChange={e => setEditDraft(p => ({ ...p, category: e.target.value }))}>
                            {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                          </select>
                          <input type="number" className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                            value={editDraft.amount} onChange={e => setEditDraft(p => ({ ...p, amount: e.target.value }))} />
                          <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none"
                            value={editDraft.recurring} onChange={e => setEditDraft(p => ({ ...p, recurring: e.target.value as "monthly" | "yearly" }))}>
                            <option value="monthly">Per maand</option>
                            <option value="yearly">Per jaar (÷12)</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveCost(c.id)} disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-all">
                            <Check size={11} /> {saving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditId(null)}
                            className="flex items-center gap-1 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs rounded-lg transition-all">
                            <X size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View row */
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] items-center">
                        <span className="text-sm font-medium text-zinc-200">{c.name}</span>
                        <span className="text-xs text-zinc-500 bg-white/5 rounded-lg px-2 py-1 w-fit">
                          {CATEGORIES.find(x => x.value === c.category)?.label ?? c.category}
                        </span>
                        <span className="text-sm font-semibold text-purple-400 tabular-nums">{fmt(c.amount)}</span>
                        <div className="text-xs text-zinc-500">
                          <span>{c.recurring === "yearly" ? "Yearly" : "Monthly"}</span>
                          {c.recurring === "yearly" && (
                            <span className="block text-zinc-700">= {fmt(c.amount / 12)}/mo</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => startEdit(c)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteCost(c.id)}
                            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between bg-white/2">
                <span className="text-xs text-zinc-500">{costs.length} kost{costs.length !== 1 ? "en" : ""}</span>
                <div className="text-right">
                  <span className="text-xs text-zinc-500">Monthly total: </span>
                  <span className="text-sm font-bold text-purple-400 tabular-nums">
                    {fmt(costs.reduce((s, c) => s + (c.recurring === "yearly" ? c.amount / 12 : c.amount), 0))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
