"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, ChevronRight, Trophy } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";
const STORES = [
  { key: "ceofo",     name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

const MILESTONE_CFG: Record<number, {
  emoji: string; title: string; action: string;
  color: string; bg: string; border: string; badge: string;
}> = {
  5: {
    emoji: "🔥",
    title: "Product reached 5 sales",
    action: "Check COG and margins",
    color: "text-orange-400",
    bg: "bg-orange-950/30",
    border: "border-orange-500/40",
    badge: "bg-orange-500/20 text-orange-300",
  },
  20: {
    emoji: "🚀",
    title: "Product reached 20 sales",
    action: "Contact supplier for better pricing",
    color: "text-blue-400",
    bg: "bg-blue-950/30",
    border: "border-blue-500/40",
    badge: "bg-blue-500/20 text-blue-300",
  },
  40: {
    emoji: "💰",
    title: "Product reached 40 sales",
    action: "Renegotiate pricing with supplier",
    color: "text-emerald-400",
    bg: "bg-emerald-950/30",
    border: "border-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
};

interface Alert {
  id: string;
  product_title: string;
  milestone: number;
  reached_at: string;
  notified: number;
  total_sold: number;
  is_new: boolean;
}

interface Approaching {
  product_title: string;
  total_sold: number;
  next_milestone: number;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MilestonesPage() {
  const [store, setStore]           = useState("martaline");
  const [alerts, setAlerts]         = useState<Alert[]>([]);
  const [approaching, setApproaching] = useState<Approaching[]>([]);
  const [newCount, setNewCount]     = useState(0);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<"all" | "new">("new");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/product-milestones?store_id=${store}`, { cache: "no-store" });
      const d = await r.json() as { alerts: Alert[]; approaching: Approaching[]; newCount: number };
      setAlerts(d.alerts ?? []);
      setApproaching(d.approaching ?? []);
      setNewCount(d.newCount ?? 0);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [store]);

  async function markAllSeen() {
    await fetch(`${API}/api/product-milestones/ack?store_id=${store}`, { method: "POST" });
    setAlerts(prev => prev.map(a => ({ ...a, is_new: false, notified: 1 })));
    setNewCount(0);
  }

  const displayed = filter === "new" ? alerts.filter(a => a.is_new) : alerts;

  // Group by milestone level for summary
  const byMilestone = (m: number) => alerts.filter(a => a.milestone === m);

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Trophy size={22} className="text-yellow-400" /> Sales Milestones
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Alerts when a product hits 5 · 20 · 40 sales</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Store toggle */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {STORES.map(s => (
              <button key={s.key} onClick={() => setStore(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  store === s.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                }`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {([5, 20, 40] as const).map(m => {
          const cfg = MILESTONE_CFG[m];
          const count = byMilestone(m).length;
          return (
            <div key={m} className={`rounded-2xl border p-4 ${count > 0 ? cfg.bg + " " + cfg.border : "bg-white/3 border-white/5"}`}>
              <div className="text-2xl mb-1">{cfg.emoji}</div>
              <div className={`text-2xl font-black ${count > 0 ? cfg.color : "text-zinc-600"}`}>{count}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{count === 1 ? "product" : "products"} at {m} sales</div>
              <div className="text-zinc-600 text-[10px] mt-1 truncate">{cfg.action}</div>
            </div>
          );
        })}
      </div>

      {/* Filter + Mark seen */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setFilter("new")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === "new" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            <Bell size={11} />
            New
            {newCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {newCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === "all" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            All alerts
          </button>
        </div>
        {newCount > 0 && (
          <button
            onClick={markAllSeen}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <CheckCheck size={13} /> Mark all as seen
          </button>
        )}
      </div>

      {/* Alert feed */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/4 animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl bg-white/3 border border-white/5 p-12 text-center space-y-2">
          <BellOff size={32} className="mx-auto text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {filter === "new" ? "No new milestone alerts" : "No milestones reached yet"}
          </p>
          {filter === "new" && alerts.length > 0 && (
            <button onClick={() => setFilter("all")} className="text-xs text-blue-400 hover:text-blue-300">
              View all {alerts.length} alerts
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(alert => {
            const cfg = MILESTONE_CFG[alert.milestone] ?? MILESTONE_CFG[5];
            return (
              <div
                key={alert.id}
                className={`rounded-2xl border p-4 transition-all ${
                  alert.is_new
                    ? `${cfg.bg} ${cfg.border}`
                    : "bg-white/3 border-white/5 opacity-60"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Emoji */}
                  <div className="text-2xl shrink-0 mt-0.5">{cfg.emoji}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-sm font-bold ${cfg.color}`}>{cfg.title}</span>
                      {alert.is_new && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                          NEW
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {alert.milestone} sales
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-white truncate mb-1">
                      {alert.product_title}
                    </p>

                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <ChevronRight size={11} className="shrink-0" />
                      <span className="font-medium">Action:</span>
                      <span>{cfg.action}</span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-black ${cfg.color}`}>{alert.total_sold}</div>
                    <div className="text-zinc-600 text-[10px]">total sold</div>
                    {alert.reached_at && (
                      <div className="text-zinc-700 text-[10px] mt-1">{timeAgo(alert.reached_at)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approaching milestones */}
      {approaching.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            Approaching next milestone
          </h2>
          <div className="space-y-2">
            {approaching.map(p => {
              const cfg = MILESTONE_CFG[p.next_milestone] ?? MILESTONE_CFG[5];
              const pct = Math.round((p.total_sold / p.next_milestone) * 100);
              return (
                <div key={p.product_title} className="rounded-2xl bg-white/3 border border-white/5 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.product_title}</p>
                      <p className="text-xs text-zinc-500">
                        {p.total_sold} / {p.next_milestone} sales —{" "}
                        <span className={`font-semibold ${cfg.color}`}>
                          {p.next_milestone - p.total_sold} more to go
                        </span>
                      </p>
                    </div>
                    <div className={`text-sm font-bold ${cfg.color}`}>{pct}%</div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p.next_milestone === 5  ? "bg-orange-500" :
                        p.next_milestone === 20 ? "bg-blue-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && (
        <p className="text-zinc-700 text-xs text-center">
          {alerts.length} milestones recorded · data updates on page load
        </p>
      )}
    </div>
  );
}
