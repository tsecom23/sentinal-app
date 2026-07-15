"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Lightbulb,
  Target, TrendingUp, XCircle, Zap,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";

const API = "https://sentinel-api.tssheets1.workers.dev";
const STORES = [
  { key: "ceofo",     name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

interface Product {
  product_title: string;
  sold: number;
  revenue: number;
  net_revenue: number;
  cost: number;
  gross_margin: number | null;
  profit: number | null;
  return_count: number;
  return_amount: number;
  return_rate: number;
  ad_spend: number;
  ad_clicks: number;
  ad_impressions: number;
  roas: number | null;
}

type Signal = "kill" | "scale" | "opportunity" | "monitor" | "neutral";

function classify(p: Product): Signal {
  const spend = p.ad_spend ?? 0;
  const orders = p.sold ?? 0;
  const roas = p.roas;
  const returnRate = p.return_rate ?? 0;

  // 🔴 KILL: geld verbranden zonder resultaat
  if (spend > 8 && orders === 0) return "kill";
  if (spend > 20 && roas !== null && roas < 1) return "kill";

  // 🟢 SCHAAL: bewezen winstgevend
  if (roas !== null && roas >= 3 && returnRate < 20) return "scale";
  if (roas !== null && roas >= 2.5 && (p.gross_margin ?? 0) >= 40) return "scale";

  // 💡 KANS: verkoopt al maar geen of minimale advertentie
  if (spend < 2 && orders >= 2) return "opportunity";
  if (spend === 0 && orders >= 1 && (p.gross_margin === null || (p.gross_margin ?? 0) > 20)) return "opportunity";

  // 🟡 MONITOR: actief maar matig
  if (spend > 0 && roas !== null && roas >= 1 && roas < 3) return "monitor";
  if (spend > 0 && orders > 0) return "monitor";

  return "neutral";
}

const SIGNALS: Record<Signal, {
  label: string; icon: React.ReactNode;
  bg: string; border: string; dot: string; textColor: string;
  tip: string;
}> = {
  kill: {
    label: "🔴 Pause Now",
    icon: <XCircle size={16} className="text-red-400" />,
    bg: "bg-red-50", border: "border-red-500/30", dot: "bg-red-500",
    textColor: "text-red-700",
    tip: "Pause this product in Google Ads → Campaigns → Shopping → product groups. Stop the bleed immediately.",
  },
  scale: {
    label: "🟢 Scale Up",
    icon: <TrendingUp size={16} className="text-emerald-400" />,
    bg: "bg-emerald-50", border: "border-emerald-500/25", dot: "bg-emerald-400",
    textColor: "text-emerald-700",
    tip: "Increase the daily budget or raise the bid for this product. Every extra euro has proven returns.",
  },
  opportunity: {
    label: "💡 Opportunity — add to Shopping",
    icon: <Lightbulb size={16} className="text-yellow-400" />,
    bg: "bg-yellow-50", border: "border-yellow-500/20", dot: "bg-yellow-400",
    textColor: "text-yellow-700",
    tip: "This product already sells (organic or direct) but gets little to no ad budget. Add it to your Shopping campaign or raise the bid.",
  },
  monitor: {
    label: "🟡 Monitor & Optimise",
    icon: <AlertTriangle size={16} className="text-amber-400" />,
    bg: "bg-amber-50", border: "border-amber-500/20", dot: "bg-amber-400",
    textColor: "text-amber-700",
    tip: "ROAS is mediocre. Try: a better product title (more keywords), a higher quality image, or lower your CPC bid.",
  },
  neutral: {
    label: "⚪ Neutral",
    icon: <CheckCircle2 size={16} className="text-gray-400" />,
    bg: "bg-black/3", border: "border-black/5", dot: "bg-zinc-600",
    textColor: "text-gray-500",
    tip: "No clear signal. Enter purchase cost to activate margin calculation.",
  },
};

function f2(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Section {
  signal: Signal;
  products: Product[];
}

export default function ScaleCommandPage() {
  const [storeId, setStoreId]     = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("30d"));
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/products/stats?store_id=${storeId}&${toQueryString(dateRange)}`,
        { cache: "no-store" }
      );
      const d = await res.json() as { products?: Product[] };
      setProducts(d.products ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [storeId, dateRange]);

  // Classify and group
  const sections: Section[] = (["kill", "scale", "opportunity", "monitor"] as Signal[]).map(signal => ({
    signal,
    products: products
      .filter(p => classify(p) === signal)
      .sort((a, b) => {
        if (signal === "kill")        return b.ad_spend - a.ad_spend;
        if (signal === "scale")       return (b.roas ?? 0) - (a.roas ?? 0);
        if (signal === "opportunity") return b.revenue - a.revenue;
        return b.ad_spend - a.ad_spend;
      }),
  }));

  const killWaste   = sections.find(s => s.signal === "kill")?.products.reduce((s, p) => s + p.ad_spend, 0) ?? 0;
  const scaleRevenue = sections.find(s => s.signal === "scale")?.products.reduce((s, p) => s + p.revenue, 0) ?? 0;
  const oppOrders   = sections.find(s => s.signal === "opportunity")?.products.reduce((s, p) => s + p.sold, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Target size={22} className="text-blue-400" /> Scale Command
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            What should you pause, scale, or add to your feed right now?
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-black/5 rounded-xl p-1">
            {STORES.map(s => (
              <button key={s.key} onClick={() => setStoreId(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${storeId === s.key ? "bg-blue-600 text-gray-900" : "text-gray-500 hover:text-gray-900"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Impact summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-red-50 border border-red-500/25 p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={14} className="text-red-400" />
              <p className="text-xs font-bold text-red-700 uppercase tracking-widest">Waste to stop</p>
            </div>
            <p className="text-2xl font-black text-red-700">
              {killWaste > 0 ? `€${f2(killWaste)}` : "None"}
            </p>
            <p className="text-[11px] text-red-900 mt-1">
              {sections.find(s => s.signal === "kill")?.products.length ?? 0} products burning money with no orders
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50 border border-emerald-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-emerald-400" />
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Proven to scale</p>
            </div>
            <p className="text-2xl font-black text-emerald-700">
              {scaleRevenue > 0 ? `€${f2(scaleRevenue)}` : "None"}
            </p>
            <p className="text-[11px] text-emerald-900 mt-1">
              {sections.find(s => s.signal === "scale")?.products.length ?? 0} products with ROAS ≥ 3x
            </p>
          </div>

          <div className="rounded-2xl bg-yellow-50 border border-yellow-500/15 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} className="text-yellow-400" />
              <p className="text-xs font-bold text-yellow-700 uppercase tracking-widest">Untapped opportunities</p>
            </div>
            <p className="text-2xl font-black text-yellow-700">
              {oppOrders > 0 ? `${oppOrders} sales` : "None"}
            </p>
            <p className="text-[11px] text-yellow-900 mt-1">
              {sections.find(s => s.signal === "opportunity")?.products.length ?? 0} sales without any ad spend
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-black/4 animate-pulse" />)}
        </div>
      )}

      {/* Sections */}
      {!loading && sections.filter(s => s.products.length > 0).map(({ signal, products: prods }) => {
        const cfg = SIGNALS[signal];
        return (
          <div key={signal} className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4">
              {cfg.icon}
              <h2 className={`text-sm font-black uppercase tracking-widest ${cfg.textColor}`}>
                {cfg.label}
              </h2>
              <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${cfg.bg} border ${cfg.border} ${cfg.textColor}`}>
                {prods.length} product{prods.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Action tip */}
            <div className="flex items-start gap-2 mb-4 bg-black/20 rounded-xl px-3 py-2.5">
              <Zap size={12} className={`${cfg.textColor} mt-0.5 shrink-0`} />
              <p className={`text-[11px] leading-relaxed ${cfg.textColor} opacity-80`}>{cfg.tip}</p>
            </div>

            {/* Product cards */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {prods.map(p => (
                <div key={p.product_title}
                  className="rounded-xl bg-black/20 border border-black/5 p-3 space-y-2">

                  {/* Title */}
                  <p className="text-xs font-semibold leading-snug line-clamp-2 text-gray-900">
                    {p.product_title}
                  </p>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {/* Spend */}
                    {p.ad_spend > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Ad spend</p>
                        <p className="text-xs font-bold text-red-700">€{f2(p.ad_spend)}</p>
                      </div>
                    )}

                    {/* ROAS */}
                    {p.roas !== null && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">ROAS</p>
                        <p className={`text-xs font-bold ${p.roas >= 3 ? "text-emerald-400" : p.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                          {p.roas.toFixed(2)}x
                        </p>
                      </div>
                    )}

                    {/* Orders */}
                    <div>
                      <p className="text-[9px] text-gray-400 uppercase">Orders</p>
                      <p className="text-xs font-bold">{p.sold}</p>
                    </div>

                    {/* Revenue */}
                    {p.revenue > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Revenue</p>
                        <p className="text-xs font-bold">€{f2(p.revenue)}</p>
                      </div>
                    )}

                    {/* Margin */}
                    {p.gross_margin !== null && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Margin</p>
                        <p className={`text-xs font-bold ${(p.gross_margin ?? 0) >= 40 ? "text-emerald-400" : (p.gross_margin ?? 0) >= 20 ? "text-amber-400" : "text-red-400"}`}>
                          {(p.gross_margin ?? 0).toFixed(1)}%
                        </p>
                      </div>
                    )}

                    {/* Return rate */}
                    {p.return_rate > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Return rate</p>
                        <p className={`text-xs font-bold ${p.return_rate > 15 ? "text-red-400" : "text-gray-500"}`}>
                          {p.return_rate.toFixed(0)}%
                        </p>
                      </div>
                    )}

                    {/* Clicks */}
                    {p.ad_clicks > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Clicks</p>
                        <p className="text-xs font-bold text-gray-500">{p.ad_clicks.toLocaleString()}</p>
                      </div>
                    )}

                    {/* Profit */}
                    {p.profit !== null && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase">Profit</p>
                        <p className={`text-xs font-bold ${(p.profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          €{f2(p.profit ?? 0)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && sections.every(s => s.products.length === 0) && (
        <div className="rounded-2xl bg-black/3 border border-black/5 p-14 text-center text-gray-400">
          <Target size={36} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium">No product data in this period</p>
          <p className="text-xs text-gray-400 mt-1">
            Make sure orders are imported and the Google Ads Script is active
          </p>
        </div>
      )}

      {/* Legend */}
      {!loading && products.length > 0 && (
        <div className="rounded-xl bg-black/3 border border-black/5 p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-3">How classification works</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["kill",        "Spend > €8, 0 orders  →  pause immediately"],
              ["scale",       "ROAS ≥ 3x, return rate < 20%  →  increase budget"],
              ["opportunity", "Already selling, spend < €2  →  add to Shopping"],
              ["monitor",     "ROAS 1–3x  →  optimise title & bid"],
            ] as [Signal, string][]).map(([sig, desc]) => {
              const cfg = SIGNALS[sig];
              return (
                <div key={sig} className="flex items-start gap-2">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
