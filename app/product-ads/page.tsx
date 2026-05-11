"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowUpDown, CheckCircle2, ExternalLink,
  Package, Search, TrendingDown, TrendingUp, XCircle, Zap,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";

const API = "https://sentinel-api.tssheets1.workers.dev";
const STORES = [
  { key: "ceofo",     name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

interface ProductAd {
  product_title: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  cpc: number;
  ctr: number;
  orders: number;
  revenue: number;
  roas: number;
}

type SortKey = keyof ProductAd;

function fmt(n: number) {
  return `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number) { return n.toLocaleString("en-GB"); }
function fmtPct(n: number) { return `${n.toFixed(2)}%`; }

type Action = { label: string; color: string; bg: string; icon: React.ReactNode; tip: string };

function getAction(p: ProductAd): Action {
  const convRate = p.clicks > 0 ? (p.orders / p.clicks) * 100 : 0;
  if (p.spend > 20 && p.orders === 0)
    return { label: "KILL", color: "text-red-300", bg: "bg-red-500/15 border-red-500/30", icon: <XCircle size={11} />, tip: "Spending with zero orders — pause immediately" };
  if (p.roas >= 5 && p.spend > 10)
    return { label: "SCALE", color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/30", icon: <TrendingUp size={11} />, tip: "High ROAS — increase budget 20–30%" };
  if (p.roas >= 3 && p.spend > 5)
    return { label: "TOP", color: "text-blue-300", bg: "bg-blue-500/15 border-blue-500/30", icon: <CheckCircle2 size={11} />, tip: "Solid performer — keep optimising" };
  if (p.ctr > 0 && p.ctr < 0.5 && p.impressions > 500)
    return { label: "FIX PHOTO", color: "text-purple-300", bg: "bg-purple-500/15 border-purple-500/30", icon: <ExternalLink size={11} />, tip: `CTR ${fmtPct(p.ctr)} is low — test new product photos or title` };
  if (convRate > 0 && convRate < 1 && p.clicks > 100)
    return { label: "FIX PRICE", color: "text-amber-300", bg: "bg-amber-500/15 border-amber-500/30", icon: <TrendingDown size={11} />, tip: `Conv rate ${convRate.toFixed(2)}% — test lower price or better offer` };
  if (p.roas > 0 && p.roas < 2 && p.spend > 10)
    return { label: "LOW ROAS", color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30", icon: <AlertTriangle size={11} />, tip: "ROAS under 2x — optimise or reduce budget" };
  if (p.spend > 0 && p.orders === 0)
    return { label: "WATCH", color: "text-amber-300", bg: "bg-amber-500/15 border-amber-500/30", icon: <AlertTriangle size={11} />, tip: "Spending but no orders yet — monitor closely" };
  return { label: "OK", color: "text-zinc-400", bg: "bg-white/5 border-white/10", icon: <span>·</span>, tip: "Performing within normal range" };
}

function roasColor(r: number) {
  if (r >= 5) return "text-emerald-400 font-bold";
  if (r >= 3) return "text-blue-400 font-semibold";
  if (r >= 1.5) return "text-amber-400";
  if (r > 0)  return "text-red-400";
  return "text-zinc-600";
}

function cpcColor(cpc: number) {
  if (cpc < 0.3) return "text-emerald-400";
  if (cpc < 0.7) return "text-zinc-300";
  if (cpc < 1.5) return "text-amber-400";
  return "text-red-400";
}

function ctrColor(ctr: number) {
  if (ctr >= 1.5) return "text-emerald-400";
  if (ctr >= 0.8) return "text-zinc-300";
  if (ctr >= 0.4) return "text-amber-400";
  return "text-red-400";
}

export default function ProductAdsPage() {
  const [store, setStore]         = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("30d"));
  const [products, setProducts]   = useState<ProductAd[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sort, setSort]           = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "spend", dir: "desc" });
  const [search, setSearch]       = useState("");
  const [actionFilter, setActionFilter] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/ads/products?store_id=${store}&${toQueryString(dateRange)}`)
      .then(r => r.json())
      .then((d: { products?: ProductAd[] }) => { setProducts(d.products ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [store, dateRange]);

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });
  }

  const withActions = products.map(p => ({ ...p, action: getAction(p) }));

  const filtered = withActions.filter(p => {
    const matchSearch = !search || p.product_title.toLowerCase().includes(search.toLowerCase());
    const matchAction = !actionFilter || p.action.label === actionFilter;
    return matchSearch && matchAction;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sort.key] as number;
    const vb = b[sort.key] as number;
    return sort.dir === "desc" ? vb - va : va - vb;
  });

  const totalSpend   = products.reduce((s, p) => s + p.spend,   0);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalClicks  = products.reduce((s, p) => s + p.clicks,  0);
  const totalOrders  = products.reduce((s, p) => s + p.orders,  0);
  const totalImpr    = products.reduce((s, p) => s + p.impressions, 0);
  const avgRoas      = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCtr       = totalImpr  > 0 ? (totalClicks / totalImpr) * 100 : 0;
  const avgCpc       = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const killSignals  = withActions.filter(p => p.action.label === "KILL").length;
  const scaleWinners = withActions.filter(p => p.action.label === "SCALE" || p.action.label === "TOP").length;

  const actionGroups = ["KILL", "LOW ROAS", "WATCH", "FIX PHOTO", "FIX PRICE", "OK", "TOP", "SCALE"];

  function SortBtn({ k }: { k: SortKey }) {
    const active = sort.key === k;
    return (
      <button onClick={() => toggleSort(k)} className={`ml-1 transition-opacity ${active ? "opacity-100 text-blue-400" : "opacity-40 hover:opacity-80"}`}>
        <ArrowUpDown size={10} />
      </button>
    );
  }

  return (
    <div className="p-6 space-y-5 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Package size={22} className="text-blue-400" /> Feed Optimisation
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Ad performance per product — CPC · CTR · ROAS · Actions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {STORES.map(s => (
              <button key={s.key} onClick={() => setStore(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${store === s.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total spend",   value: fmt(totalSpend),        sub: `${fmtN(totalClicks)} clicks`,     color: "text-red-400" },
          { label: "Total revenue", value: fmt(totalRevenue),      sub: `${totalOrders} conversions`,      color: "text-emerald-400" },
          { label: "Avg ROAS",      value: `${avgRoas.toFixed(2)}x`, sub: avgRoas >= 3 ? "✓ healthy" : avgRoas >= 2 ? "needs work" : "⚠ low", color: roasColor(avgRoas) },
          { label: "Avg CTR",       value: fmtPct(avgCtr),         sub: `CPC ${fmt(avgCpc)}`,              color: ctrColor(avgCtr) },
        ].map(c => (
          <div key={c.label} className="bg-white/3 border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-[11px] text-zinc-600 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Action alerts */}
      {!loading && products.length > 0 && (killSignals > 0 || scaleWinners > 0) && (
        <div className="flex gap-3">
          {killSignals > 0 && (
            <div className="flex-1 bg-red-950/30 border border-red-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
              <XCircle size={22} className="text-red-400 shrink-0" />
              <div>
                <p className="font-bold text-red-300 text-sm">{killSignals} kill signal{killSignals > 1 ? "s" : ""} — pause now</p>
                <p className="text-[11px] text-red-500 mt-0.5">Products spending budget with zero orders this period</p>
              </div>
              <button onClick={() => setActionFilter(actionFilter === "KILL" ? null : "KILL")}
                className={`ml-auto text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all ${actionFilter === "KILL" ? "bg-red-500 text-white" : "bg-red-500/20 text-red-300 hover:bg-red-500/30"}`}>
                {actionFilter === "KILL" ? "Show all" : "View only"}
              </button>
            </div>
          )}
          {scaleWinners > 0 && (
            <div className="flex-1 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl px-5 py-4 flex items-center gap-4">
              <TrendingUp size={22} className="text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-emerald-300 text-sm">{scaleWinners} winner{scaleWinners > 1 ? "s" : ""} — scale budget</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Strong ROAS — increase bids by 20–30%</p>
              </div>
              <button onClick={() => setActionFilter(actionFilter === "SCALE" ? null : "SCALE")}
                className={`ml-auto text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all ${actionFilter === "SCALE" ? "bg-emerald-500 text-white" : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"}`}>
                {actionFilter === "SCALE" ? "Show all" : "View only"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search + filter bar */}
      {!loading && products.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product…"
              className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/40" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {actionGroups.map(a => {
              const count = withActions.filter(p => p.action.label === a).length;
              if (count === 0) return null;
              return (
                <button key={a} onClick={() => setActionFilter(actionFilter === a ? null : a)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${actionFilter === a ? "bg-white/20 text-white border-white/30" : "bg-white/3 text-zinc-500 border-white/8 hover:border-white/20 hover:text-white"}`}>
                  {a} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            {actionFilter && (
              <button onClick={() => setActionFilter(null)} className="px-2.5 py-1 rounded-lg text-[10px] text-zinc-500 hover:text-white transition-colors">
                Clear ×
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-zinc-600 text-sm">Loading feed data…</div>
      )}

      {!loading && products.length === 0 && (
        <div className="rounded-2xl bg-white/3 border border-white/10 p-10 text-center space-y-4">
          <Package size={40} className="mx-auto text-zinc-600" />
          <h2 className="text-lg font-bold">No product-level ad data yet</h2>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Add the Google Ads Products Script to your account. It reads Shopping campaign data per product and sends it here automatically.
          </p>
          <div className="bg-[#111] rounded-xl p-4 text-left text-xs text-zinc-400 border border-white/8 max-w-lg mx-auto">
            <p className="text-zinc-300 font-semibold mb-2">Setup:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li><strong className="text-white">ads.google.com</strong> → Settings → Scripts → + New script</li>
              <li>Paste the TSecom Products Script</li>
              <li>Set <code className="text-blue-400">STORE_ID = &quot;{store}&quot;</code></li>
              <li>Authorise → Frequency: <strong className="text-white">Hourly</strong></li>
            </ol>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="text-left px-4 py-3 text-zinc-500 font-semibold">Product</th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Spend<SortBtn k="spend" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Impr.<SortBtn k="impressions" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Clicks<SortBtn k="clicks" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">CTR<SortBtn k="ctr" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">CPC<SortBtn k="cpc" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Orders<SortBtn k="orders" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Conv%</th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">Revenue<SortBtn k="revenue" /></th>
                  <th className="text-right px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">ROAS<SortBtn k="roas" /></th>
                  <th className="text-left px-3 py-3 text-zinc-500 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const convRate = p.clicks > 0 ? (p.orders / p.clicks) * 100 : 0;
                  const isKill = p.action.label === "KILL";
                  const isTop  = p.action.label === "SCALE" || p.action.label === "TOP";
                  return (
                    <tr key={i} className={`border-b border-white/5 transition-colors ${isKill ? "bg-red-950/20 hover:bg-red-950/30" : isTop ? "bg-emerald-950/10 hover:bg-emerald-950/20" : "hover:bg-white/3"}`}>
                      <td className="px-4 py-3 max-w-[240px]">
                        <span className="line-clamp-2 text-zinc-200 leading-snug font-medium">{p.product_title}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-red-300 font-semibold">{fmt(p.spend)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500">{fmtN(p.impressions)}</td>
                      <td className="px-3 py-3 text-right text-zinc-300">{fmtN(p.clicks)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${ctrColor(p.ctr)}`}>{fmtPct(p.ctr)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${cpcColor(p.cpc)}`}>{fmt(p.cpc)}</td>
                      <td className="px-3 py-3 text-right text-zinc-200 font-semibold">{p.orders}</td>
                      <td className={`px-3 py-3 text-right ${convRate >= 1.5 ? "text-emerald-400" : convRate >= 0.5 ? "text-zinc-400" : p.clicks > 50 ? "text-amber-400" : "text-zinc-600"}`}>
                        {p.clicks > 0 ? fmtPct(convRate) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-300 font-semibold">{p.revenue > 0 ? fmt(p.revenue) : "—"}</td>
                      <td className={`px-3 py-3 text-right text-base font-black ${roasColor(p.roas)}`}>
                        {p.roas > 0 ? `${p.roas.toFixed(2)}x` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span title={p.action.tip} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${p.action.bg} ${p.action.color}`}>
                          {p.action.icon} {p.action.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-600">
            <span>{sorted.length} of {products.length} products{actionFilter ? ` · filtered: ${actionFilter}` : ""}</span>
            <span className="flex items-center gap-1"><Zap size={10} /> Hover action badge for tip</span>
          </div>
        </div>
      )}
    </div>
  );
}
