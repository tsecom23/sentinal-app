"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

interface Insight {
  product_title: string;
  sold: number;
  revenue: number;
  net_revenue: number;
  unit_cost: number;
  total_cost: number;
  ad_spend: number;
  profit: number;
  margin: number;
  roas: number | null;
  return_amount: number;
  label: string;
  severity: string;
  recommendation: string;
}

type SortLabel = "ALL" | "KILL" | "SCALE" | "FIX MARGIN" | "SET COST" | "OPTIMIZE" | "MONITOR" | "DEAD";

const LABEL_STYLES: Record<string, string> = {
  KILL:       "bg-red-500/15 text-red-400 border border-red-500/30",
  SCALE:      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  "FIX MARGIN": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  OPTIMIZE:   "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  MONITOR:    "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
  "SET COST": "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  DEAD:       "bg-red-500/15 text-red-400 border border-red-500/30",
};

function fmt(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LabelBadge({ label }: { label: string }) {
  const cls = LABEL_STYLES[label] ?? "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30";
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function InsightCard({
  item,
  bgClass,
}: {
  item: Insight;
  bgClass: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 space-y-2.5 ${bgClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-sm leading-snug line-clamp-2 flex-1">
          {item.product_title}
        </p>
        <LabelBadge label={item.label} />
      </div>
      <p className="text-zinc-400 text-xs leading-relaxed">{item.recommendation}</p>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Verkocht</p>
          <p className="text-xs font-bold text-zinc-200">{item.sold}x</p>
        </div>
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Revenue</p>
          <p className="text-xs font-bold text-zinc-200">€{fmt(item.net_revenue)}</p>
        </div>
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Marge</p>
          <p className={`text-xs font-bold ${item.margin >= 30 ? "text-emerald-400" : item.margin >= 10 ? "text-amber-400" : "text-red-400"}`}>
            {item.margin.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Ad spend</p>
          <p className={`text-xs font-bold ${item.ad_spend > 0 ? "text-red-300" : "text-zinc-600"}`}>
            {item.ad_spend > 0 ? `€${fmt(item.ad_spend)}` : "—"}
          </p>
        </div>
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">ROAS</p>
          <p className={`text-xs font-bold ${item.roas === null ? "text-zinc-600" : item.roas >= 3 ? "text-emerald-400" : item.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
            {item.roas !== null ? `${item.roas.toFixed(2)}x` : "—"}
          </p>
        </div>
        <div className="bg-white/4 rounded-lg px-2 py-1.5">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Winst</p>
          <p className={`text-xs font-bold ${item.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            €{fmt(item.profit)}
          </p>
        </div>
      </div>
    </div>
  );
}

function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-32 rounded-2xl bg-white/4 animate-pulse" />
      ))}
    </div>
  );
}

export default function AIRecommendationsPage() {
  const { stores } = useStores();
  const [storeId, setStoreId] = useState("martaline");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortLabel, setSortLabel] = useState<SortLabel>("ALL");

  async function load(store: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/insights/products?store_id=${store}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { insights?: Insight[] };
      setInsights(json.insights ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(storeId);
  }, [storeId]);

  const kills = insights.filter((i) => i.label === "KILL");
  const scales = insights.filter((i) => i.label === "SCALE");
  const needFix = insights.filter((i) =>
    ["KILL", "FIX MARGIN", "SET COST", "DEAD"].includes(i.label)
  );

  const SORT_LABELS: SortLabel[] = ["ALL", "KILL", "SCALE", "FIX MARGIN", "SET COST", "OPTIMIZE", "MONITOR", "DEAD"];
  const sorted =
    sortLabel === "ALL"
      ? insights
      : insights.filter((i) => i.label === sortLabel);

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Bot size={22} className="text-purple-400" />
            AI Recommendations
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Rule-based AI signals for every product
          </p>
        </div>
        {/* Store selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                storeId === s.id
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total insights", value: insights.length, color: "" },
          { label: "Scale candidates", value: scales.length, color: "text-emerald-400" },
          { label: "Kill signals", value: kills.length, color: "text-red-400" },
          { label: "Need fixing", value: needFix.length, color: "text-amber-400" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-white/3 border border-white/5 p-4">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
              {c.label}
            </p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonCards count={4} />
          <SkeletonCards count={4} />
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-2xl bg-white/3 border border-white/5 p-12 text-center text-zinc-600">
          No insights found for this store.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Kill signals */}
          {kills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                🔴 Kill signals
                <span className="text-xs font-normal text-zinc-600">
                  ({kills.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {kills.map((item) => (
                  <InsightCard
                    key={item.product_title + "-kill"}
                    item={item}
                    bgClass="bg-red-950/20 border-red-500/30"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Scale opportunities */}
          {scales.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                🚀 Scale opportunities
                <span className="text-xs font-normal text-zinc-600">
                  ({scales.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scales.map((item) => (
                  <InsightCard
                    key={item.product_title + "-scale"}
                    item={item}
                    bgClass="bg-emerald-950/20 border-emerald-500/30"
                  />
                ))}
              </div>
            </section>
          )}

          {/* All recommendations */}
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-bold text-zinc-300">
                All recommendations
                <span className="text-xs font-normal text-zinc-600 ml-2">
                  ({sorted.length})
                </span>
              </h2>
              {/* Label filter */}
              <div className="flex flex-wrap gap-1">
                {SORT_LABELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setSortLabel(l)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      sortLabel === l
                        ? "bg-white/10 text-white"
                        : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {sorted.length === 0 ? (
              <div className="rounded-2xl bg-white/3 border border-white/5 p-8 text-center text-zinc-600 text-sm">
                No products with label "{sortLabel}".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sorted.map((item) => (
                  <InsightCard
                    key={item.product_title + "-all"}
                    item={item}
                    bgClass="bg-white/3 border-white/5"
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
