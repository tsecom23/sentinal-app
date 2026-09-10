"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowUpDown, Check, CheckCircle2,
  RotateCcw, Search, TrendingUp, X, XCircle,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

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
  | "profit" | "return_rate" | "ad_spend" | "roas"
  | "ad_clicks" | "ad_impressions" | "cpc" | "ctr";

function f2(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(p: Product) {
  if (p.return_rate > 20)
    return <span className="flex items-center gap-1 text-red-500 text-[10px] font-semibold"><XCircle size={11} /> High returns</span>;
  if (p.ad_spend > 20 && (p.roas ?? 0) < 1.5)
    return <span className="flex items-center gap-1 text-red-500 text-[10px] font-semibold"><XCircle size={11} /> Kill signal</span>;
  if ((p.gross_margin ?? 100) > 0 && (p.gross_margin ?? 100) < 20)
    return <span className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold"><AlertTriangle size={11} /> Low margin</span>;
  if ((p.gross_margin ?? 0) >= 50)
    return <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-semibold"><CheckCircle2 size={11} /> Top</span>;
  return null;
}

function rowBg(p: Product) {
  if (p.return_rate > 20 || (p.ad_spend > 20 && (p.roas ?? 0) < 1.5))
    return "border-l-2 border-l-red-400 bg-red-50";
  if ((p.gross_margin ?? 100) > 0 && (p.gross_margin ?? 100) < 20)
    return "border-l-2 border-l-amber-400 bg-amber-50";
  if ((p.gross_margin ?? 0) >= 50)
    return "border-l-2 border-l-emerald-500 bg-emerald-50";
  return "";
}

export default function ProductInsightsPage() {
  const { stores } = useStores();
  const [storeId, setStoreId]   = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("all"));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" });

  const [editCosts, setEditCosts]   = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [totalAdSpendAll, setTotalAdSpendAll]         = useState<number | null>(null);
  const [unattributedAdSpend, setUnattributedAdSpend] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const dq = toQueryString(dateRange);
      const res = await fetch(`${API}/api/products/stats?store_id=${storeId}&${dq}`, { cache: "no-store" });
      const d = await res.json() as { products?: Product[]; total_ad_spend?: number; unattributed_ad_spend?: number };
      setProducts(d.products ?? []);
      setTotalAdSpendAll(d.total_ad_spend ?? null);
      setUnattributedAdSpend(d.unattributed_ad_spend ?? null);
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
      <button onClick={() => toggleSort(k)} className={`ml-1 transition-opacity ${active ? "opacity-100 text-blue-500" : "opacity-30 hover:opacity-60"}`}>
        <ArrowUpDown size={10} />
      </button>
    );
  }

  function cpc(p: Product)  { return p.ad_clicks > 0       ? p.ad_spend / p.ad_clicks            : 0; }
  function ctr(p: Product)  { return p.ad_impressions > 0   ? (p.ad_clicks / p.ad_impressions) * 100 : 0; }

  const filtered = [...products]
    .filter(p => !search || p.product_title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const val = (p: Product) => {
        if (sort.key === "cpc") return cpc(p);
        if (sort.key === "ctr") return ctr(p);
        return (p[sort.key as keyof Product] ?? -999) as number;
      };
      return sort.dir === "desc" ? val(b) - val(a) : val(a) - val(b);
    });

  const totalRevenue    = filtered.reduce((s, p) => s + p.revenue, 0);
  const totalNet        = filtered.reduce((s, p) => s + p.net_revenue, 0);
  const totalAdSpend    = filtered.reduce((s, p) => s + p.ad_spend, 0);
  const totalCost       = filtered.reduce((s, p) => s + p.total_cost, 0);
  const totalClicks     = filtered.reduce((s, p) => s + p.ad_clicks, 0);
  const totalImpressions= filtered.reduce((s, p) => s + p.ad_impressions, 0);
  const totalProfit     = totalNet - totalCost - totalAdSpend;
  const netMargin       = totalNet > 0 && totalCost > 0 ? (totalProfit / totalNet) * 100 : 0;
  const avgCpc          = totalClicks > 0 ? totalAdSpend / totalClicks : 0;
  const avgCtr          = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalRoas       = totalAdSpend > 0 ? totalNet / totalAdSpend : null;
  const pendingChanges  = Object.keys(editCosts).length;

  const kpiCards = [
    { label: "Gross revenue",    value: `€${f2(totalRevenue)}`,   color: "text-gray-800" },
    { label: "Net revenue",      value: `€${f2(totalNet)}`,       color: "text-blue-600" },
    { label: "Total cost",       value: totalCost > 0 ? `€${f2(totalCost)}` : "—", color: "text-amber-600" },
    {
      label: totalAdSpendAll !== null && totalAdSpendAll > totalAdSpend + 0.01
        ? `Ad spend (Shopping €${f2(totalAdSpend)} + Search €${f2(totalAdSpendAll - totalAdSpend)})`
        : "Ad spend (Google)",
      value: totalAdSpendAll !== null && totalAdSpendAll > 0 ? `€${f2(totalAdSpendAll)}` : totalAdSpend > 0 ? `€${f2(totalAdSpend)}` : "—",
      color: "text-red-500",
    },
    { label: totalRoas !== null ? `ROAS (Google)` : "ROAS",
      value: totalRoas !== null ? `${totalRoas.toFixed(2)}x` : "—",
      color: totalRoas === null ? "text-gray-400" : totalRoas >= 3 ? "text-emerald-600" : totalRoas >= 1.5 ? "text-amber-600" : "text-red-500" },
    { label: "CPC avg",          value: avgCpc > 0 ? `€${avgCpc.toFixed(2)}` : "—", color: "text-gray-700" },
    { label: "CTR avg",          value: avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—", color: "text-gray-700" },
    { label: netMargin !== 0 ? `Net margin ${netMargin.toFixed(1)}%` : "Net Profit",
      value: totalCost > 0 ? `€${f2(totalProfit)}` : "—",
      color: totalProfit > 0 ? "text-emerald-600" : totalProfit < 0 ? "text-red-500" : "text-gray-400" },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#f6f7f9]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-gray-900">
            <TrendingUp size={22} className="text-blue-500" /> Product Stats
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">All stats per product — revenue, returns, margin, ad spend</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {pendingChanges > 0 && (
            <button onClick={saveAll} disabled={bulkSaving}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center gap-1.5">
              {bulkSaving ? "Saving..." : `Save cost (${pendingChanges})`}
            </button>
          )}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {stores.map(s => (
              <button key={s.id} onClick={() => { setStoreId(s.id); setEditCosts({}); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${storeId === s.id ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
        {kpiCards.map(c => (
          <div key={c.label} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2 leading-tight">{c.label}</p>
            <p className={`text-lg font-black ${c.color}`}>{loading ? "—" : c.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X size={12} /></button>}
        </div>
        <p className="text-xs text-gray-400">{filtered.length} products</p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold">Product</th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Units <SortBtn k="sold" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Revenue <SortBtn k="revenue" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Returns <SortBtn k="return_rate" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Net rev <SortBtn k="net_revenue" />
                </th>
                <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">Cost/unit</th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Margin <SortBtn k="gross_margin" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Profit <SortBtn k="profit" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Ad spend (G) <SortBtn k="ad_spend" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  ROAS (G) <SortBtn k="roas" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Clicks <SortBtn k="ad_clicks" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  Impr. <SortBtn k="ad_impressions" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  CPC <SortBtn k="cpc" />
                </th>
                <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">
                  CTR <SortBtn k="ctr" />
                </th>
                <th className="text-left px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={15} className="text-center py-12 text-gray-400">No products in this period</td></tr>
              ) : filtered.map(p => {
                const inputVal   = editCosts[p.product_title];
                const costNow    = inputVal !== undefined ? parseFloat(inputVal.replace(",", ".")) || 0 : p.cost;
                const isEditing  = inputVal !== undefined;
                const isSaved    = saved === p.product_title;
                const isSaving   = saving === p.product_title;

                const liveMargin = p.net_revenue > 0 && costNow > 0
                  ? ((p.net_revenue - costNow * p.sold) / p.net_revenue) * 100
                  : p.gross_margin;
                const liveProfit = costNow > 0
                  ? p.net_revenue - costNow * p.sold - p.ad_spend
                  : p.profit;

                const marginColor = liveMargin === null ? "text-gray-300" :
                  liveMargin >= 50 ? "text-emerald-600" :
                  liveMargin >= 30 ? "text-yellow-600" :
                  liveMargin >= 0  ? "text-orange-500" : "text-red-500";

                return (
                  <tr key={p.product_title}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${rowBg(p)} ${isEditing ? "bg-blue-50" : ""}`}>

                    {/* Product title */}
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="font-medium text-[11px] leading-snug line-clamp-2 text-gray-800">{p.product_title}</p>
                    </td>

                    {/* Sold */}
                    <td className="px-3 py-3 text-right text-gray-700 font-medium">{p.sold}x</td>

                    {/* Gross revenue */}
                    <td className="px-3 py-3 text-right font-semibold text-gray-800">€{f2(p.revenue)}</td>

                    {/* Returns */}
                    <td className="px-3 py-3 text-right">
                      {p.return_count > 0 ? (
                        <div>
                          <span className={`font-semibold ${p.return_rate > 20 ? "text-red-500" : p.return_rate > 10 ? "text-amber-600" : "text-gray-600"}`}>
                            {p.return_count}x
                          </span>
                          <span className="text-gray-400 ml-1">({p.return_rate.toFixed(0)}%)</span>
                          <div className="text-gray-400 text-[10px]">−€{f2(p.return_amount)}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Net revenue */}
                    <td className="px-3 py-3 text-right font-semibold text-blue-600">
                      {p.return_count > 0 ? `€${f2(p.net_revenue)}` : <span className="text-gray-600">€{f2(p.revenue)}</span>}
                    </td>

                    {/* Cost input */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">€</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={inputVal ?? (p.cost > 0 ? p.cost.toFixed(2) : "")}
                            onChange={e => setEditCosts(prev => ({ ...prev, [p.product_title]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && saveCost(p.product_title)}
                            placeholder="0.00"
                            className="w-20 bg-white border border-gray-200 rounded-lg pl-5 pr-2 py-1 text-[11px] text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400"
                          />
                        </div>
                        {isSaved ? (
                          <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                            <Check size={10} className="text-emerald-600" />
                          </div>
                        ) : isEditing ? (
                          <button onClick={() => saveCost(p.product_title)} disabled={isSaving}
                            className="w-6 h-6 rounded-lg bg-blue-600 hover:bg-blue-500 flex items-center justify-center shrink-0 transition">
                            {isSaving ? <span className="text-[8px] text-white">…</span> : <Check size={10} className="text-white" />}
                          </button>
                        ) : null}
                      </div>
                    </td>

                    {/* Margin */}
                    <td className="px-3 py-3 text-right">
                      {liveMargin !== null ? (
                        <span className={`font-bold ${marginColor}`}>{liveMargin.toFixed(1)}%</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Profit */}
                    <td className="px-3 py-3 text-right">
                      {liveProfit !== null ? (
                        <span className={`font-semibold ${liveProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          €{f2(liveProfit)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Ad spend */}
                    <td className="px-3 py-3 text-right">
                      {p.ad_spend > 0 ? (
                        <span className="text-red-500 font-medium">€{f2(p.ad_spend)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* ROAS */}
                    <td className="px-3 py-3 text-right">
                      {p.roas !== null ? (
                        <span className={`font-bold ${p.roas >= 3 ? "text-emerald-600" : p.roas >= 1.5 ? "text-amber-600" : "text-red-500"}`}>
                          {p.roas.toFixed(2)}x
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Clicks */}
                    <td className="px-3 py-3 text-right text-gray-600">
                      {p.ad_clicks > 0 ? p.ad_clicks.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Impressions */}
                    <td className="px-3 py-3 text-right text-gray-600">
                      {p.ad_impressions > 0 ? p.ad_impressions.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>

                    {/* CPC */}
                    <td className="px-3 py-3 text-right">
                      {p.ad_clicks > 0 ? (
                        <span className="text-gray-700">€{cpc(p).toFixed(2)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* CTR */}
                    <td className="px-3 py-3 text-right">
                      {p.ad_impressions > 0 ? (
                        <span className={`${ctr(p) >= 2 ? "text-emerald-600" : ctr(p) >= 1 ? "text-amber-600" : "text-gray-500"}`}>
                          {ctr(p).toFixed(2)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">{statusBadge(p)}</td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals row */}
            {filtered.length > 0 && !loading && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3 text-xs text-gray-500">{filtered.length} products</td>
                  <td className="px-3 py-3 text-right text-xs">{filtered.reduce((s, p) => s + p.sold, 0)}x</td>
                  <td className="px-3 py-3 text-right text-xs">€{f2(totalRevenue)}</td>
                  <td className="px-3 py-3 text-right text-xs text-red-500">
                    {filtered.reduce((s, p) => s + p.return_count, 0) > 0 ? `${filtered.reduce((s, p) => s + p.return_count, 0)}x` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-blue-600">€{f2(totalNet)}</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-right text-xs">
                    {netMargin !== 0 ? <span className={netMargin >= 0 ? "text-emerald-600" : "text-red-500"}>{netMargin.toFixed(1)}%</span> : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-xs">
                    {totalCost > 0 ? <span className={totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}>€{f2(totalProfit)}</span> : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-red-500">
                    {totalAdSpend > 0 ? `€${f2(totalAdSpend)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-xs">
                    {totalRoas !== null ? <span className={totalRoas >= 3 ? "text-emerald-600" : totalRoas >= 1.5 ? "text-amber-600" : "text-red-500"}>{totalRoas.toFixed(2)}x</span> : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600">{totalClicks > 0 ? totalClicks.toLocaleString() : "—"}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600">{totalImpressions > 0 ? totalImpressions.toLocaleString() : "—"}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600">{avgCpc > 0 ? `€${avgCpc.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600">{avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—"}</td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-400 pb-4">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> Margin ≥50%</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400" /> Low margin &lt;20%</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-red-400" /> Kill signal / high returns</span>
        <span className="flex items-center gap-1.5"><RotateCcw size={10} /> Enter cost → live margin update</span>
      </div>
    </div>
  );
}
