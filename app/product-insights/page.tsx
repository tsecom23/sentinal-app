"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowUpDown, Check, CheckCircle2,
  RotateCcw, Search, TrendingUp, X, XCircle,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";

const API = "https://sentinel-api.tssheets1.workers.dev";
const STORES = [
  { key: "ceofo",     name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

type Product = {
  product_title: string;
  sold: number;
  revenue: number;
  net_revenue: number;
  cost: number;
  cost_updated_at: string | null;
  total_cost: number;
  gross_margin: number | null;
  profit: number | null;
  return_count: number;
  return_amount: number;
  return_rate: number;
  ad_spend: number;
  ad_clicks: number;
  ad_impressions: number;
  roas: number | null;
};

type SortKey =
  | "revenue" | "net_revenue" | "sold" | "gross_margin"
  | "profit" | "return_rate" | "ad_spend" | "roas";

function f2(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(p: Product) {
  if (p.return_rate > 20)
    return <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold"><XCircle size={11} /> High returns</span>;
  if (p.ad_spend > 20 && (p.roas ?? 0) < 1.5)
    return <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold"><XCircle size={11} /> Kill signal</span>;
  if ((p.gross_margin ?? 100) > 0 && (p.gross_margin ?? 100) < 20)
    return <span className="flex items-center gap-1 text-amber-400 text-[10px] font-semibold"><AlertTriangle size={11} /> Low margin</span>;
  if ((p.gross_margin ?? 0) >= 50)
    return <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold"><CheckCircle2 size={11} /> Top</span>;
  return null;
}

function rowBg(p: Product) {
  if (p.return_rate > 20 || (p.ad_spend > 20 && (p.roas ?? 0) < 1.5)) return "border-l-2 border-red-500 bg-red-950/20";
  if ((p.gross_margin ?? 100) > 0 && (p.gross_margin ?? 100) < 20) return "border-l-2 border-amber-500 bg-amber-950/10";
  if ((p.gross_margin ?? 0) >= 50) return "border-l-2 border-emerald-600 bg-emerald-950/10";
  return "";
}

export default function ProductInsightsPage() {
  const [storeId, setStoreId]   = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("all"));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" });

  // Cost editing
  const [editCosts, setEditCosts]   = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const dq = toQueryString(dateRange);
      const res = await fetch(`${API}/api/products/stats?store_id=${storeId}&${dq}`, { cache: "no-store" });
      const d = await res.json() as { products?: Product[] };
      setProducts(d.products ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [storeId, dateRange]);

  async function saveCost(title: string) {
    const raw = editCosts[title];
    if (raw === undefined) return;
    const cost = parseFloat(raw.replace(",", ".")) || 0;
    setSaving(title);
    await fetch(`${API}/api/product-costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: storeId, product_title: title, cost }),
    });
    setProducts(prev => prev.map(p => p.product_title === title ? {
      ...p,
      cost,
      total_cost: cost * p.sold,
      gross_margin: p.net_revenue > 0 && cost > 0 ? ((p.net_revenue - cost * p.sold) / p.net_revenue) * 100 : null,
      profit: cost > 0 ? p.net_revenue - cost * p.sold - p.ad_spend : null,
      cost_updated_at: new Date().toISOString(),
    } : p));
    setEditCosts(prev => { const n = { ...prev }; delete n[title]; return n; });
    setSaving(null);
    setSaved(title);
    setTimeout(() => setSaved(null), 2000);
  }

  async function saveAll() {
    const changed = Object.entries(editCosts).filter(([, v]) => v !== "");
    if (!changed.length) return;
    setBulkSaving(true);
    const items = changed.map(([product_title, raw]) => ({
      store_id: storeId,
      product_title,
      cost: parseFloat(raw.replace(",", ".")) || 0,
    }));
    await fetch(`${API}/api/product-costs/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    await load();
    setEditCosts({});
    setBulkSaving(false);
  }

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });
  }

  function SortBtn({ k }: { k: SortKey }) {
    const active = sort.key === k;
    return (
      <button onClick={() => toggleSort(k)} className={`ml-1 transition-opacity ${active ? "opacity-100 text-blue-400" : "opacity-30 hover:opacity-70"}`}>
        <ArrowUpDown size={10} />
      </button>
    );
  }

  const filtered = [...products]
    .filter(p => !search || p.product_title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = (a[sort.key] ?? -999) as number;
      const vb = (b[sort.key] ?? -999) as number;
      return sort.dir === "desc" ? vb - va : va - vb;
    });

  // Summary totals
  const totalRevenue  = filtered.reduce((s, p) => s + p.revenue, 0);
  const totalNet      = filtered.reduce((s, p) => s + p.net_revenue, 0);
  const totalReturns  = filtered.reduce((s, p) => s + p.return_amount, 0);
  const totalAdSpend  = filtered.reduce((s, p) => s + p.ad_spend, 0);
  const totalCost     = filtered.reduce((s, p) => s + p.total_cost, 0);
  const totalProfit   = totalNet - totalCost - totalAdSpend;
  const avgMargin     = totalNet > 0 && totalCost > 0 ? ((totalNet - totalCost) / totalNet) * 100 : 0;
  const pendingChanges = Object.keys(editCosts).length;

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <TrendingUp size={22} className="text-blue-400" /> Product Stats
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">All stats per product — revenue, returns, margin, ad spend</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingChanges > 0 && (
            <button onClick={saveAll} disabled={bulkSaving} className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition flex items-center gap-1.5">
              {bulkSaving ? "Saving..." : `Save cost (${pendingChanges})`}
            </button>
          )}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {/* Store */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {STORES.map(s => (
              <button key={s.key} onClick={() => { setStoreId(s.key); setEditCosts({}); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${storeId === s.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Gross revenue",  value: `€${f2(totalRevenue)}`,   color: "" },
          { label: "Returns",        value: totalReturns > 0 ? `-€${f2(totalReturns)}` : "€0,00", color: totalReturns > 0 ? "text-red-400" : "" },
          { label: "Net revenue",    value: `€${f2(totalNet)}`,       color: "" },
          { label: "Total cost",     value: totalCost > 0 ? `€${f2(totalCost)}` : "—", color: "" },
          { label: "Ad spend",       value: totalAdSpend > 0 ? `€${f2(totalAdSpend)}` : "—", color: "" },
          { label: avgMargin > 0 ? `Margin ${avgMargin.toFixed(1)}%` : "Profit",
            value: totalCost > 0 ? `€${f2(totalProfit)}` : "—",
            color: totalProfit > 0 ? "text-emerald-400" : totalProfit < 0 ? "text-red-400" : "" },
        ].map(c => (
          <div key={c.label} className="rounded-2xl bg-white/3 border border-white/5 p-4">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..."
            className="w-full bg-white/4 border border-white/8 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"><X size={12} /></button>}
        </div>
        <p className="text-xs text-zinc-600">{filtered.length} products</p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/4 animate-pulse" />)}</div>
      ) : (
        <div className="rounded-2xl bg-white/3 border border-white/5 overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500">
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Units sold <SortBtn k="sold" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Revenue <SortBtn k="revenue" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Returns <SortBtn k="return_rate" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Net revenue <SortBtn k="net_revenue" />
                </th>
                <th className="text-center px-3 py-3 font-medium whitespace-nowrap">Cost/unit</th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Margin <SortBtn k="gross_margin" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Profit <SortBtn k="profit" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  Ad spend <SortBtn k="ad_spend" />
                </th>
                <th className="text-right px-3 py-3 font-medium whitespace-nowrap">
                  ROAS <SortBtn k="roas" />
                </th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-zinc-600">No products in this period</td></tr>
              ) : filtered.map(p => {
                const inputVal   = editCosts[p.product_title];
                const costNow    = inputVal !== undefined ? parseFloat(inputVal.replace(",", ".")) || 0 : p.cost;
                const isEditing  = inputVal !== undefined;
                const isSaved    = saved === p.product_title;
                const isSaving   = saving === p.product_title;

                // Live-compute margin & profit if editing cost
                const liveMargin = p.net_revenue > 0 && costNow > 0
                  ? ((p.net_revenue - costNow * p.sold) / p.net_revenue) * 100
                  : p.gross_margin;
                const liveProfit = costNow > 0
                  ? p.net_revenue - costNow * p.sold - p.ad_spend
                  : p.profit;

                const marginColor = liveMargin === null ? "text-zinc-600" :
                  liveMargin >= 50 ? "text-emerald-400" :
                  liveMargin >= 30 ? "text-yellow-400" :
                  liveMargin >= 0  ? "text-orange-400" : "text-red-400";

                return (
                  <tr key={p.product_title}
                    className={`border-b border-white/5 hover:bg-white/4 transition-colors ${rowBg(p)} ${isEditing ? "bg-blue-950/20" : ""}`}>

                    {/* Product title */}
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="font-medium text-[11px] leading-snug line-clamp-2">{p.product_title}</p>
                    </td>

                    {/* Sold */}
                    <td className="px-3 py-3 text-right text-zinc-300">{p.sold}x</td>

                    {/* Gross revenue */}
                    <td className="px-3 py-3 text-right font-semibold">€{f2(p.revenue)}</td>

                    {/* Returns */}
                    <td className="px-3 py-3 text-right">
                      {p.return_count > 0 ? (
                        <div>
                          <span className={`font-semibold ${p.return_rate > 20 ? "text-red-400" : p.return_rate > 10 ? "text-amber-400" : "text-zinc-400"}`}>
                            {p.return_count}x
                          </span>
                          <span className="text-zinc-600 ml-1">({p.return_rate.toFixed(0)}%)</span>
                          <div className="text-zinc-600 text-[10px]">−€{f2(p.return_amount)}</div>
                        </div>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>

                    {/* Net revenue */}
                    <td className="px-3 py-3 text-right font-semibold text-blue-300">
                      {p.return_count > 0 ? `€${f2(p.net_revenue)}` : <span className="text-zinc-400">€{f2(p.revenue)}</span>}
                    </td>

                    {/* Cost input */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px]">€</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={inputVal ?? (p.cost > 0 ? p.cost.toFixed(2) : "")}
                            onChange={e => setEditCosts(prev => ({ ...prev, [p.product_title]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && saveCost(p.product_title)}
                            placeholder="0.00"
                            className="w-20 bg-white/6 border border-white/8 rounded-lg pl-5 pr-2 py-1 text-[11px] text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
                          />
                        </div>
                        {isSaved ? (
                          <div className="w-6 h-6 rounded-lg bg-emerald-600/20 flex items-center justify-center shrink-0">
                            <Check size={10} className="text-emerald-400" />
                          </div>
                        ) : isEditing ? (
                          <button onClick={() => saveCost(p.product_title)} disabled={isSaving}
                            className="w-6 h-6 rounded-lg bg-blue-600 hover:bg-blue-500 flex items-center justify-center shrink-0 transition">
                            {isSaving ? <span className="text-[8px]">…</span> : <Check size={10} />}
                          </button>
                        ) : null}
                      </div>
                    </td>

                    {/* Margin */}
                    <td className="px-3 py-3 text-right">
                      {liveMargin !== null ? (
                        <span className={`font-bold ${marginColor}`}>{liveMargin.toFixed(1)}%</span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>

                    {/* Profit */}
                    <td className="px-3 py-3 text-right">
                      {liveProfit !== null ? (
                        <span className={`font-semibold ${liveProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          €{f2(liveProfit)}
                        </span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>

                    {/* Ad spend */}
                    <td className="px-3 py-3 text-right">
                      {p.ad_spend > 0 ? (
                        <span className="text-red-300">€{f2(p.ad_spend)}</span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>

                    {/* ROAS */}
                    <td className="px-3 py-3 text-right">
                      {p.roas !== null ? (
                        <span className={`font-bold ${p.roas >= 3 ? "text-emerald-400" : p.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                          {p.roas.toFixed(2)}x
                        </span>
                      ) : <span className="text-zinc-700">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">{statusBadge(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-zinc-700 pb-4">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-600" /> Margin ≥50%</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500" /> Low margin &lt;20%</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> Kill signal or high returns</span>
        <span className="flex items-center gap-1.5"><RotateCcw size={10} /> Enter cost → margin &amp; profit update live</span>
      </div>
    </div>
  );
}
