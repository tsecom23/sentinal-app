"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Box,
  CheckCircle,
  ChevronRight,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "../../utils/supabase/client";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type DashboardProps = {
  activeStoreId?: string;
};

type Range = "today" | "yesterday" | "30d";

type StoreType = {
  id: string;
  store_name: string;
  shopify_domain: string;
  store_key: string;
};

type DashboardData = {
  revenue: number;
  orders: number;
  profit?: number;
  adSpend?: number;
  productCost?: number;
  roas?: number;
  aov?: number;
  cvr?: number;
  sessions?: number;
  revenueTrend?: { day: string; revenue: number }[];
};

type ProductAlert = {
  id: string;
  product_title: string;
  message: string;
  alert_type: string;
  severity: string;
  created_at: string;
};

type TopProduct = {
  product_title: string;
  variant_title?: string;
  sold: number;
  revenue: number;
  profit: number;
};

export default function Dashboard({ activeStoreId }: DashboardProps) {
  const supabase = createClient();

  const [stores, setStores] = useState<StoreType[]>([]);
  const [storeId, setStoreId] = useState(activeStoreId || "ceofo");
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [error, setError] = useState("");

  async function loadStores() {
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, shopify_domain, store_key")
      .order("created_at", { ascending: false });
    setStores(data || []);
  }

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const query = `store_id=${storeId}&range=${range}`;

      const [overviewRes, alertsRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/overview?${query}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/product-alerts?store_id=${storeId}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/products/top?${query}`, { cache: "no-store" }),
      ]);

      const [overviewJson, alertsJson, productsJson] = await Promise.all([
        overviewRes.json(),
        alertsRes.json(),
        productsRes.json(),
      ]);

      setData(overviewJson);
      setAlerts(alertsJson.alerts || []);
      setProducts(productsJson.products || []);
    } catch (err) {
      console.error(err);
      setError("Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  async function scanAlerts() {
    setScanning(true);
    await fetch(`${API_URL}/api/alerts/scan-products?store_id=${storeId}`, { cache: "no-store" });
    await loadData();
    setScanning(false);
  }

  useEffect(() => { loadStores(); }, []);
  useEffect(() => { if (activeStoreId) setStoreId(activeStoreId); }, [activeStoreId]);
  useEffect(() => { loadData(); }, [storeId, range]);

  const activeStore = stores.find((s) => s.store_key === storeId);

  const revenue = Number(data?.revenue || 0);
  const orders = Number(data?.orders || 0);
  const adSpend = Number(data?.adSpend || 0);
  const productCost = Number(data?.productCost || 0);
  const profit = Number(data?.profit ?? revenue - adSpend - productCost);
  const aov = Number(data?.aov || (orders > 0 ? revenue / orders : 0));
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const chartData =
    data?.revenueTrend && data.revenueTrend.length > 0
      ? data.revenueTrend
      : [{ day: "—", revenue: 0 }];

  function changeStore(newStoreId: string) {
    setStoreId(newStoreId);
    window.history.pushState({}, "", `/?store_id=${newStoreId}`);
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-[280px] min-h-screen bg-[#0d0d13] border-r border-white/5 p-6 flex flex-col">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-indigo-600 flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">Sentinel</h1>
                <p className="text-xs text-zinc-500">AI Commerce OS</p>
              </div>
            </div>
          </div>

          <nav className="space-y-1 flex-1">
            <Nav active icon={<Activity size={16} />} label="Overview" />
            <Nav icon={<Store size={16} />} label="Stores" href="/stores" />
            <Nav icon={<Box size={16} />} label="Product Insights" href="/product-insights" />
            <Nav icon={<Bot size={16} />} label="AI Recommendations" href="/ai-recommendations" />
            <Nav icon={<MessageCircle size={16} />} label="AI Chat" href="/ai-chat" />
            <Nav icon={<BarChart3 size={16} />} label="Google Ads" href="/google-ads" />
            <Nav icon={<Target size={16} />} label="Scale Command" />
          </nav>

          <div className="mt-6 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 p-4">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm mb-1">
              <Zap size={14} />
              AI Status
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Monitoring margins, stock risk and scaling signals.
            </p>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Active store</p>
              <div className="flex items-center gap-3">
                <select
                  value={storeId}
                  onChange={(e) => changeStore(e.target.value)}
                  className="bg-[#111118] border border-white/8 rounded-2xl px-4 py-2.5 text-white text-sm min-w-[240px] cursor-pointer"
                >
                  {stores.length === 0 && <option value={storeId}>{storeId}</option>}
                  {stores.map((s) => (
                    <option key={s.id} value={s.store_key}>{s.store_name}</option>
                  ))}
                </select>
                <a
                  href="/stores"
                  className="h-10 px-4 rounded-2xl bg-[#111118] border border-white/8 flex items-center text-sm text-zinc-400 hover:text-white transition"
                >
                  Manage
                </a>
              </div>
              <p className="text-xs text-zinc-600 mt-2">{activeStore?.shopify_domain || "—"}</p>
            </div>

            <div className="flex items-center gap-2">
              {(["today", "yesterday", "30d"] as Range[]).map((r) => (
                <RangeButton
                  key={r}
                  label={r === "30d" ? "30 Days" : r === "today" ? "Today" : "Yesterday"}
                  active={range === r}
                  onClick={() => setRange(r)}
                />
              ))}
              <button
                onClick={loadData}
                className="h-10 px-3 rounded-2xl bg-[#111118] border border-white/8 hover:bg-[#171722] flex items-center gap-2 text-zinc-400 hover:text-white transition"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={scanAlerts}
                className="h-10 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm flex items-center gap-2 transition"
              >
                <Bell size={14} />
                {scanning ? "Scanning..." : "Scan Alerts"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Stat
              label="Revenue"
              value={`€${revenue.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`}
              loading={loading}
            />
            <Stat
              label="Orders"
              value={orders.toString()}
              loading={loading}
            />
            <Stat
              label="Profit"
              value={`€${profit.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`}
              sub={revenue > 0 ? `${margin.toFixed(1)}% margin` : undefined}
              loading={loading}
            />
            <Stat
              label="Avg. Order Value"
              value={`€${aov.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`}
              loading={loading}
            />
          </div>

          {/* Revenue Chart */}
          <div className="rounded-3xl bg-[#111118] border border-white/8 p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={16} className="text-indigo-400" />
              <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">
                Revenue Overview
              </h3>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: -20 }}>
                  <XAxis dataKey="day" stroke="#3f3f46" tick={{ fill: "#52525b", fontSize: 11 }} />
                  <YAxis stroke="#3f3f46" tick={{ fill: "#52525b", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#818cf8" }}
                    formatter={(v: number) => [`€${v.toFixed(2)}`, "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#grad)"
                    fillOpacity={1}
                  />
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom grid: Top Products + Alerts */}
          <div className="grid grid-cols-5 gap-6">
            {/* Top Products */}
            <div className="col-span-3 rounded-3xl bg-[#111118] border border-white/8 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Box size={16} className="text-indigo-400" />
                <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">
                  Top Products
                </h3>
                <span className="ml-auto text-xs text-zinc-600">{range === "30d" ? "30 days" : range}</span>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 rounded-xl bg-white/4 animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
                  <Box size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No sales in this period</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.slice(0, 8).map((p, i) => {
                    const maxRev = products[0]?.revenue || 1;
                    const pct = (p.revenue / maxRev) * 100;
                    return (
                      <div key={i} className="group relative rounded-2xl px-4 py-3 hover:bg-white/4 transition">
                        <div
                          className="absolute inset-y-0 left-0 rounded-2xl bg-indigo-600/8 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center gap-3">
                          <span className="text-xs text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.product_title}</p>
                            {p.variant_title && (
                              <p className="text-xs text-zinc-500 truncate">{p.variant_title}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">€{p.revenue.toFixed(2)}</p>
                            <p className="text-xs text-zinc-500">{p.sold}x sold</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Alerts */}
            <div className="col-span-2 rounded-3xl bg-[#111118] border border-white/8 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Bell size={16} className="text-indigo-400" />
                <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">
                  Alerts
                </h3>
                {alerts.length > 0 && (
                  <span className="ml-auto text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-white/4 animate-pulse" />
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
                  <CheckCircle size={28} className="mb-2 text-emerald-600 opacity-60" />
                  <p className="text-sm">All clear</p>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
                  {alerts.slice(0, 20).map((a) => (
                    <div key={a.id} className="rounded-2xl bg-white/4 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          size={13}
                          className={`mt-0.5 shrink-0 ${
                            a.severity === "high" ? "text-red-400" : "text-amber-400"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium leading-tight truncate">
                            {a.product_title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 leading-tight">
                            {a.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Nav({
  label, icon, active, href,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition text-sm ${
        active
          ? "bg-indigo-600 text-white"
          : "text-zinc-500 hover:bg-white/5 hover:text-white"
      }`}
    >
      <div className="flex items-center gap-3">{icon}{label}</div>
      {href && <ChevronRight size={13} className="opacity-40" />}
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

function RangeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 px-4 rounded-2xl text-sm font-semibold transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-[#111118] border border-white/8 text-zinc-500 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="rounded-3xl bg-[#111118] border border-white/8 p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">{label}</p>
      {loading ? (
        <div className="h-8 w-24 rounded-lg bg-white/6 animate-pulse" />
      ) : (
        <>
          <h3 className="text-2xl font-black tracking-tight">{value}</h3>
          {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
        </>
      )}
    </div>
  );
}
