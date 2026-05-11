"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Plus, Pencil, Trash2, X, Check, ChevronDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CATEGORIES = [
  { value: "subscription", label: "Subscription" },
  { value: "salary",       label: "Salary" },
  { value: "other",        label: "Other" },
];

interface MonthData {
  month: string;
  orders: number;
  gross_revenue: number;
  return_amount: number;
  net_revenue: number;
  ad_spend: number;
  product_cost: number;
  overhead: number;
  profit: number;
  margin: number;
}

interface PnLTotals {
  orders: number;
  gross_revenue: number;
  return_amount: number;
  net_revenue: number;
  ad_spend: number;
  product_cost: number;
  overhead: number;
  profit: number;
}

interface PnLResponse {
  year: string;
  months: MonthData[];
  totals: PnLTotals;
}

interface OverheadCost {
  id: string;
  store_id: string;
  name: string;
  category: string;
  amount: number;
  recurring: "monthly" | "yearly";
  active: number;
}

interface DraftCost {
  name: string;
  category: string;
  amount: string;
  recurring: "monthly" | "yearly";
}

const EMPTY_DRAFT: DraftCost = { name: "", category: "subscription", amount: "", recurring: "monthly" };

function fmt(n: number): string {
  return "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hasData(m: MonthData): boolean {
  return m.orders > 0 || m.gross_revenue !== 0 || m.net_revenue !== 0;
}

const currentMonth = new Date().getMonth() + 1;
const currentYear  = new Date().getFullYear();

export default function PnLPage() {
  const { stores } = useStores();
  const [store, setStore]   = useState("ceofo");
  const [year, setYear]     = useState(2026);

  // Set default store to first one once loaded
  useEffect(() => {
    if (stores.length > 0 && !stores.find(s => s.id === store)) {
      setStore(stores[0].id);
    }
  }, [stores]);
  const [data, setData]     = useState<PnLResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Overhead state
  const [costs, setCosts]         = useState<OverheadCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(false);
  const [showAddForm, setShowAddForm]   = useState(false);
  const [draft, setDraft]               = useState<DraftCost>(EMPTY_DRAFT);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editDraft, setEditDraft]       = useState<DraftCost>(EMPTY_DRAFT);
  const [saving, setSaving]             = useState(false);

  // Load P&L data
  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: PnLResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [store, year]);

  // Load overhead costs
  useEffect(() => {
    setCostsLoading(true);
    fetch(`${API}/api/overhead?store_id=${store}`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: { costs: OverheadCost[] }) => setCosts(d.costs ?? []))
      .catch(() => {})
      .finally(() => setCostsLoading(false));
  }, [store]);

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  function toggleMonth(key: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const totals = data?.totals;
  const months = data?.months ?? [];

  const totalMargin = totals && totals.net_revenue > 0
    ? Math.round((totals.profit / totals.net_revenue) * 100)
    : 0;

  const chartData = months.map((m, i) => ({
    name: MONTH_NAMES[i],
    profit: m.profit,
    active: hasData(m),
  }));

  async function addCost() {
    if (!draft.name || !draft.amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/overhead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: store,
          name: draft.name,
          category: draft.category,
          amount: parseFloat(draft.amount),
          recurring: draft.recurring,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setCosts(prev => [...prev, d.cost]);
        setDraft(EMPTY_DRAFT);
        setShowAddForm(false);
        // Refresh P&L to update profit numbers
        fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
          .then(r2 => r2.json()).then((pnl: PnLResponse) => setData(pnl)).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveCost(id: string) {
    if (!editDraft.name || !editDraft.amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/overhead/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name,
          category: editDraft.category,
          amount: parseFloat(editDraft.amount),
          recurring: editDraft.recurring,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setCosts(prev => prev.map(c => c.id === id ? d.cost : c));
        setEditingId(null);
        fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
          .then(r2 => r2.json()).then((pnl: PnLResponse) => setData(pnl)).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteCost(id: string) {
    await fetch(`${API}/api/overhead/${id}`, { method: "DELETE" });
    setCosts(prev => prev.filter(c => c.id !== id));
    fetch(`${API}/api/pnl?store_id=${store}&year=${year}`, { cache: "no-store" })
      .then(r => r.json()).then((pnl: PnLResponse) => setData(pnl)).catch(() => {});
  }

  function startEdit(c: OverheadCost) {
    setEditingId(c.id);
    setEditDraft({ name: c.name, category: c.category, amount: String(c.amount), recurring: c.recurring });
  }

  const totalOverhead = totals?.overhead ?? 0;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" /> Profit &amp; Loss
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Monthly revenue, costs and profit overview</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {[2024, 2025, 2026].map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  year === y ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {stores.map(s => (
              <button
                key={s.id}
                onClick={() => setStore(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  store === s.id ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Net Revenue</p>
          <p className="text-2xl font-black text-emerald-400">
            {loading ? "—" : totals ? fmt(totals.net_revenue) : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">After returns</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Ad Spend</p>
          <p className="text-2xl font-black text-red-400">
            {loading ? "—" : totals ? fmt(totals.ad_spend) : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">Total advertising</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Product Costs</p>
          <p className="text-2xl font-black text-amber-400">
            {loading ? "—" : totals ? fmt(totals.product_cost) : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">COGS</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Overhead</p>
          <p className="text-2xl font-black text-purple-400">
            {loading ? "—" : fmt(totalOverhead)}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">{costs.filter(c => c.active).length} active costs</p>
        </div>

        <div className={`border rounded-2xl p-4 ${
          !totals ? "bg-white/3 border-white/5"
          : totals.profit >= 0
            ? "bg-emerald-950/30 border-emerald-500/20"
            : "bg-red-950/30 border-red-500/20"
        }`}>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Net Profit</p>
          <p className={`text-2xl font-black ${
            !totals ? "text-zinc-400"
            : totals.profit >= 0 ? "text-emerald-400" : "text-red-400"
          }`}>
            {loading ? "—" : totals ? fmt(totals.profit) : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">
            {totals ? `${totalMargin}% margin` : "Margin %"}
          </p>
        </div>
      </div>

      {/* Overhead cost manager */}
      <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Overhead Costs</p>
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null); }}
            className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-all"
          >
            <Plus size={13} /> Add cost
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="px-4 py-3 border-b border-white/5 bg-blue-950/10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
              <input
                className="col-span-2 md:col-span-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                placeholder="Name (e.g. Shopify)"
                value={draft.name}
                onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              />
              <select
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/50"
                value={draft.category}
                onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input
                type="number"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                placeholder="Amount €"
                value={draft.amount}
                onChange={e => setDraft(p => ({ ...p, amount: e.target.value }))}
              />
              <select
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/50"
                value={draft.recurring}
                onChange={e => setDraft(p => ({ ...p, recurring: e.target.value as "monthly" | "yearly" }))}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly (÷12)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addCost}
                disabled={saving || !draft.name || !draft.amount}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
              >
                {saving ? "Saving…" : "Add"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setDraft(EMPTY_DRAFT); }}
                className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs rounded-lg transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Cost list */}
        {costsLoading ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">Loading…</div>
        ) : costs.length === 0 && !showAddForm ? (
          <div className="px-4 py-6 text-center text-zinc-700 text-sm">No overhead costs yet — click Add cost to get started</div>
        ) : (
          <div className="divide-y divide-white/5">
            {costs.map(c => (
              <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                {editingId === c.id ? (
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input
                      className="col-span-2 md:col-span-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      value={editDraft.name}
                      onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))}
                    />
                    <select
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-zinc-300 focus:outline-none"
                      value={editDraft.category}
                      onChange={e => setEditDraft(p => ({ ...p, category: e.target.value }))}
                    >
                      {CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                    </select>
                    <input
                      type="number"
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white focus:outline-none"
                      value={editDraft.amount}
                      onChange={e => setEditDraft(p => ({ ...p, amount: e.target.value }))}
                    />
                    <select
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-zinc-300 focus:outline-none"
                      value={editDraft.recurring}
                      onChange={e => setEditDraft(p => ({ ...p, recurring: e.target.value as "monthly" | "yearly" }))}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly (÷12)</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-medium text-zinc-200">{c.name}</span>
                    <span className="text-[10px] text-zinc-600 bg-white/5 rounded px-1.5 py-0.5">
                      {CATEGORIES.find(x => x.value === c.category)?.label ?? c.category}
                    </span>
                    <span className="text-xs text-purple-400 font-semibold">{fmt(c.amount)}</span>
                    <span className="text-[10px] text-zinc-600">{c.recurring === "yearly" ? "/ year (÷12)" : "/ month"}</span>
                    {c.recurring === "yearly" && (
                      <span className="text-[10px] text-zinc-500">= {fmt(c.amount / 12)}/mo</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  {editingId === c.id ? (
                    <>
                      <button onClick={() => saveCost(c.id)} disabled={saving} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-all">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/5 transition-all">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteCost(c.id)} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profit trend chart */}
      <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-widest">Profit Trend</p>
        {loading ? (
          <div className="h-[200px] flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "#111117",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "#e4e4e7",
                }}
                formatter={(v: number) => [fmt(v), "Profit"]}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      !entry.active
                        ? "rgba(255,255,255,0.05)"
                        : entry.profit >= 0
                          ? "#10b981"
                          : "#ef4444"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Monthly breakdown — collapsible */}
      <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_80px_120px_100px_80px] gap-2 px-4 py-2.5 border-b border-white/5">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Month</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold text-right">Orders</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold text-right">Net Revenue</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold text-right">Profit</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold text-right">Margin</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-zinc-600 text-sm">Loading…</div>
        ) : (
          <div className="divide-y divide-white/5">
            {months.map((m, i) => {
              const monthNum = i + 1;
              const isCurrentMonth = year === currentYear && monthNum === currentMonth;
              const active = hasData(m);
              const key = m.month;
              const expanded = expandedMonths.has(key);

              return (
                <div key={key}>
                  {/* Summary row — always visible */}
                  <button
                    onClick={() => active && toggleMonth(key)}
                    className={`w-full grid grid-cols-[1fr_80px_120px_100px_80px] gap-2 px-4 py-3 text-left transition-all ${
                      isCurrentMonth ? "bg-blue-950/20 border-l-2 border-blue-500" : "border-l-2 border-transparent"
                    } ${active ? "hover:bg-white/3 cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex items-center gap-2">
                      {active && (
                        <ChevronDown
                          size={12}
                          className={`text-zinc-600 shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
                        />
                      )}
                      <span className={`text-sm font-semibold ${isCurrentMonth ? "text-blue-300" : active ? "text-zinc-200" : "text-zinc-700"}`}>
                        {MONTH_NAMES[i]}
                      </span>
                      {isCurrentMonth && (
                        <span className="text-[9px] bg-blue-500/20 text-blue-400 rounded px-1.5 py-0.5 font-bold uppercase tracking-wide">Now</span>
                      )}
                    </div>
                    <span className={`text-sm text-right ${active ? "text-zinc-300" : "text-zinc-700"}`}>
                      {active ? m.orders : "—"}
                    </span>
                    <span className={`text-sm font-medium text-right ${active ? "text-zinc-200" : "text-zinc-700"}`}>
                      {active ? fmt(m.net_revenue) : "—"}
                    </span>
                    <span className={`text-sm font-bold text-right ${
                      !active ? "text-zinc-700" : m.profit >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {active ? fmt(m.profit) : "—"}
                    </span>
                    <span className={`text-sm text-right ${
                      !active ? "text-zinc-700" : m.margin >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {active ? `${m.margin}%` : "—"}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {expanded && active && (
                    <div className="mx-4 mb-3 rounded-xl bg-white/3 border border-white/5 divide-y divide-white/5">
                      {[
                        { label: "Gross Revenue", value: fmt(m.gross_revenue), color: "text-zinc-300" },
                        { label: "Returns",        value: m.return_amount > 0 ? fmt(m.return_amount) : "—", color: "text-red-400" },
                        { label: "Ad Spend",       value: m.ad_spend > 0 ? fmt(m.ad_spend) : "—",         color: "text-red-400" },
                        { label: "Product Cost",   value: m.product_cost > 0 ? fmt(m.product_cost) : "—", color: "text-amber-400" },
                        { label: "Overhead",       value: m.overhead > 0 ? fmt(m.overhead) : "—",         color: "text-purple-400" },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between px-4 py-2">
                          <span className="text-xs text-zinc-500">{row.label}</span>
                          <span className={`text-xs font-medium ${row.color}`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Totals footer */}
        {totals && !loading && (
          <div className="border-t border-white/10 grid grid-cols-[1fr_80px_120px_100px_80px] gap-2 px-4 py-3 bg-white/2">
            <span className="text-xs font-bold text-zinc-300 pl-5">Total {year}</span>
            <span className="text-xs font-bold text-zinc-300 text-right">{totals.orders}</span>
            <span className="text-xs font-bold text-zinc-200 text-right">{fmt(totals.net_revenue)}</span>
            <span className={`text-xs font-bold text-right ${totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.profit)}
            </span>
            <span className={`text-xs font-bold text-right ${totalMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalMargin}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
