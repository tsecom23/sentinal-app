"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Box, CheckCircle,
  RefreshCw, RotateCcw, ShieldAlert, TrendingUp,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "../../utils/supabase/client";

const API = "https://sentinel-api.tssheets1.workers.dev";

type Range = "today" | "yesterday" | "30d";
type StoreType = { id: string; store_name: string; shopify_domain: string; store_key: string };

type Overview = {
  revenue: number; netRevenue: number; orders: number;
  adSpend: number; productCost: number; profit: number;
  aov: number; roas: number; returnAmount: number; returnCount: number;
  returnRate: number; disputeAmount: number; disputeCount: number;
  cpc: number; ctr: number; clicks: number; impressions: number;
  revenueTrend: { day: string; revenue: number }[];
};

type ProductAlert = { id: string; product_title: string; message: string; severity: string };
type TopProduct = { product_title: string; variant_title?: string; sold: number; revenue: number; profit: number };
type MilestoneData = { totalThisMonth: number; next: number | null; reached: number[] };

export default function Dashboard({ activeStoreId }: { activeStoreId?: string }) {
  const supabase = createClient();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [storeId, setStoreId] = useState(activeStoreId || "ceofo");
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [milestones, setMilestones] = useState<MilestoneData | null>(null);
  const [error, setError] = useState("");

  async function loadStores() {
    const { data } = await supabase.from("stores")
      .select("id, store_name, shopify_domain, store_key")
      .order("created_at", { ascending: false });
    setStores(data || []);
  }

  async function loadData() {
    try {
      setLoading(true); setError("");
      const q = `store_id=${storeId}&range=${range}`;
      const [ov, al, pr, ms] = await Promise.all([
        fetch(`${API}/api/dashboard/overview?${q}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/product-alerts?store_id=${storeId}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/products/top?${q}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/milestones?store_id=${storeId}`, { cache: "no-store" }).then(r => r.json()).catch(() => null),
      ]);
      setOverview(ov);
      setAlerts(al.alerts || []);
      setProducts(pr.products || []);
      if (ms && !ms.error) setMilestones(ms);
    } catch (e) {
      console.error(e); setError("Could not load dashboard data.");
    } finally { setLoading(false); }
  }

  async function scanAlerts() {
    setScanning(true);
    await fetch(`${API}/api/alerts/scan-products?store_id=${storeId}`, { cache: "no-store" });
    await loadData();
    setScanning(false);
  }

  useEffect(() => { loadStores(); }, []);
  useEffect(() => { if (activeStoreId) setStoreId(activeStoreId); }, [activeStoreId]);
  useEffect(() => { loadData(); }, [storeId, range]);

  const activeStore = stores.find(s => s.store_key === storeId);
  const ov = overview;
  const revenue = ov?.revenue ?? 0;
  const orders = ov?.orders ?? 0;
  const profit = ov?.profit ?? 0;
  const aov = ov?.aov ?? 0;
  const roas = ov?.roas ?? 0;
  const adSpend = ov?.adSpend ?? 0;
  const returnAmount = ov?.returnAmount ?? 0;
  const returnCount = ov?.returnCount ?? 0;
  const disputeAmount = ov?.disputeAmount ?? 0;
  const disputeCount = ov?.disputeCount ?? 0;
  const cpc = ov?.cpc ?? 0;
  const ctr = ov?.ctr ?? 0;
  const clicks = ov?.clicks ?? 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const chartData = ov?.revenueTrend?.length ? ov.revenueTrend : [{ day: "—", revenue: 0 }];

  const MILESTONES_LIST = [5, 10, 20, 50, 100, 200, 500, 1000];
  const thisMonth = milestones?.totalThisMonth ?? 0;
  const nextMilestone = milestones?.next ?? MILESTONES_LIST[0];
  const milestoneProgress = nextMilestone > 0 ? Math.min((thisMonth / nextMilestone) * 100, 100) : 100;

  function changeStore(id: string) {
    setStoreId(id);
    window.history.pushState({}, "", `/?store_id=${id}`);
  }

  return (
    <div className="p-7 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Active store</p>
          <div className="flex items-center gap-2">
            <select
              value={storeId}
              onChange={e => changeStore(e.target.value)}
              className="bg-[#111118] border border-white/8 rounded-xl px-3 py-2 text-sm text-white min-w-[200px] cursor-pointer"
            >
              {stores.length === 0 && <option value={storeId}>{storeId}</option>}
              {stores.map(s => <option key={s.id} value={s.store_key}>{s.store_name}</option>)}
            </select>
            <a href="/stores" className="h-9 px-3 rounded-xl bg-[#111118] border border-white/8 text-xs text-zinc-500 hover:text-white transition flex items-center">Manage</a>
          </div>
          <p className="text-[11px] text-zinc-700 mt-1.5">{activeStore?.shopify_domain || "—"}</p>
        </div>

        <div className="flex items-center gap-2">
          {(["today", "yesterday", "30d"] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`h-9 px-4 rounded-xl text-xs font-semibold transition ${range === r ? "bg-indigo-600 text-white" : "bg-[#111118] border border-white/8 text-zinc-500 hover:text-white"}`}>
              {r === "30d" ? "30 Days" : r === "today" ? "Today" : "Yesterday"}
            </button>
          ))}
          <button onClick={loadData} className="h-9 w-9 rounded-xl bg-[#111118] border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={scanAlerts} className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1.5 transition">
            <Bell size={13} />{scanning ? "Scanning..." : "Scan Alerts"}
          </button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-xs">{error}</div>}

      {/* Milestone bar */}
      {milestones && (
        <div className="rounded-2xl bg-[#111118] border border-white/8 p-4 mb-5 flex items-center gap-5">
          <div className="shrink-0">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">This month</p>
            <p className="text-xl font-black mt-0.5">{thisMonth} <span className="text-sm font-normal text-zinc-500">orders</span></p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] text-zinc-600 mb-1.5">
              <span>{thisMonth} orders</span>
              <span>Next: {nextMilestone}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${milestoneProgress}%` }} />
            </div>
          </div>
          <div className="shrink-0 flex gap-1.5">
            {MILESTONES_LIST.slice(0, 6).map(m => (
              <div key={m} className={`text-[10px] px-2 py-1 rounded-lg font-semibold ${thisMonth >= m ? "bg-indigo-600/20 text-indigo-400" : "bg-white/4 text-zinc-700"}`}>{m}</div>
            ))}
          </div>
        </div>
      )}

      {/* Stats row 1 */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <StatCard label="Revenue" value={`€${fmt(revenue)}`} sub={`AOV €${fmt(aov)}`} loading={loading} />
        <StatCard label="Orders" value={orders.toString()} sub={range === "30d" ? "Last 30 days" : range} loading={loading} />
        <StatCard label="Profit" value={`€${fmt(profit)}`} sub={`${margin.toFixed(1)}% margin`} trend={profit > 0 ? "up" : profit < 0 ? "down" : undefined} loading={loading} />
        <StatCard label="ROAS" value={adSpend > 0 ? `${roas.toFixed(2)}x` : "—"} sub={adSpend > 0 ? `€${fmt(adSpend)} spend` : "Ads not connected"} loading={loading} />
      </div>

      {/* Stats row 2 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Ad Spend" value={adSpend > 0 ? `€${fmt(adSpend)}` : "—"} sub={cpc > 0 ? `CPC €${cpc.toFixed(2)}` : "No data"} loading={loading} />
        <StatCard label="CTR / Clicks" value={ctr > 0 ? `${ctr.toFixed(2)}%` : "—"} sub={clicks > 0 ? `${clicks.toLocaleString()} clicks` : "No data"} loading={loading} />
        <StatCard label="Returns" value={returnCount > 0 ? `${returnCount}x` : "0"} sub={returnCount > 0 ? `€${fmt(returnAmount)}` : "No returns"} trend={returnCount > 0 ? "down" : undefined} loading={loading} />
        <StatCard label="Disputes" value={disputeCount > 0 ? `${disputeCount}x` : "0"} sub={disputeCount > 0 ? `€${fmt(disputeAmount)} open` : "No disputes"} trend={disputeCount > 0 ? "down" : undefined} loading={loading} />
      </div>

      {/* Chart */}
      <div className="rounded-3xl bg-[#111118] border border-white/8 p-6 mb-5">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={15} className="text-indigo-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Revenue Trend</h3>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
              <XAxis dataKey="day" stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
              <YAxis stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#0d0d13", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "#71717a" }} itemStyle={{ color: "#818cf8" }}
                formatter={(v: number) => [`€${v.toFixed(2)}`, "Revenue"]}
              />
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-5 gap-5">
        {/* Top Products */}
        <div className="col-span-3 rounded-3xl bg-[#111118] border border-white/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Box size={14} className="text-indigo-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Top Products</h3>
            <span className="ml-auto text-[10px] text-zinc-700">{range === "30d" ? "30 days" : range}</span>
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-white/4 animate-pulse" />)}</div>
          ) : products.length === 0 ? (
            <Empty icon={<Box size={24} />} label="No sales in this period" />
          ) : (
            <div className="space-y-1">
              {products.slice(0, 8).map((p, i) => {
                const pct = (p.revenue / (products[0]?.revenue || 1)) * 100;
                const m = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                return (
                  <div key={i} className="relative group rounded-xl px-3 py-2.5 hover:bg-white/4 transition">
                    <div className="absolute inset-y-0 left-0 rounded-xl bg-indigo-600/8" style={{ width: `${pct}%` }} />
                    <div className="relative flex items-center gap-3">
                      <span className="text-[10px] text-zinc-700 w-4 text-right shrink-0 font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.product_title}</p>
                        {p.variant_title && <p className="text-[10px] text-zinc-600 truncate">{p.variant_title}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold">€{fmt(p.revenue)}</p>
                        <p className="text-[10px] text-zinc-600">{p.sold}x · {m.toFixed(0)}% margin</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="col-span-2 rounded-3xl bg-[#111118] border border-white/8 p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={14} className="text-indigo-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Alerts</h3>
            {alerts.length > 0 && <span className="ml-auto text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-semibold">{alerts.length}</span>}
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" />)}</div>
          ) : alerts.length === 0 ? (
            <Empty icon={<CheckCircle size={24} className="text-emerald-600" />} label="All clear" />
          ) : (
            <div className="space-y-1.5 overflow-y-auto flex-1">
              {alerts.slice(0, 15).map(a => (
                <div key={a.id} className="rounded-xl bg-white/4 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={11} className={`mt-0.5 shrink-0 ${a.severity === "high" ? "text-red-400" : "text-amber-400"}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate">{a.product_title}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{a.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-white/5 flex gap-2">
            <a href="/returns" className="flex-1 h-8 rounded-xl bg-white/4 hover:bg-white/8 transition flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 hover:text-white">
              <RotateCcw size={12} /> Returns
            </a>
            <a href="/product-insights" className="flex-1 h-8 rounded-xl bg-white/4 hover:bg-white/8 transition flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 hover:text-white">
              <Box size={12} /> Products
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, trend, loading }: { label: string; value: string; sub?: string; trend?: "up" | "down"; loading?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#111118] border border-white/8 p-4">
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2.5">{label}</p>
      {loading ? <div className="h-7 w-20 rounded-lg bg-white/6 animate-pulse mb-1" /> : (
        <div className="flex items-center gap-1.5">
          <h3 className="text-xl font-black tracking-tight">{value}</h3>
          {trend === "up" && <ArrowUpRight size={14} className="text-emerald-400 shrink-0" />}
          {trend === "down" && <ArrowDownRight size={14} className="text-red-400 shrink-0" />}
        </div>
      )}
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Empty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-zinc-700">
      <div className="opacity-40 mb-2">{icon}</div>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
