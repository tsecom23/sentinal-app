"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Box,
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
  const [storeId, setStoreId] = useState(
    activeStoreId || "ceofo"
  );

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

      const overviewRes = await fetch(
        `${API_URL}/api/dashboard/overview?${query}`,
        { cache: "no-store" }
      );

      const overviewJson = await overviewRes.json();
      setData(overviewJson);

      const alertsRes = await fetch(
        `${API_URL}/api/product-alerts?store_id=${storeId}`,
        { cache: "no-store" }
      );

      const alertsJson = await alertsRes.json();
      setAlerts(alertsJson.alerts || []);

      const productsRes = await fetch(
        `${API_URL}/api/products/top?${query}`,
        {
          cache: "no-store",
        }
      );

      const productsJson = await productsRes.json();
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

    await fetch(
      `${API_URL}/api/alerts/scan-products?store_id=${storeId}`,
      {
        cache: "no-store",
      }
    );

    await loadData();

    setScanning(false);
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (activeStoreId) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId]);

  useEffect(() => {
    loadData();
  }, [storeId, range]);

  const activeStore = stores.find(
    (store) => store.store_key === storeId
  );

  const revenue = Number(data?.revenue || 0);
  const orders = Number(data?.orders || 0);
  const adSpend = Number(data?.adSpend || 0);
  const productCost = Number(data?.productCost || 0);
  const profit = Number(
    data?.profit ?? revenue - adSpend - productCost
  );
  const roas = Number(data?.roas || 0);
  const aov = Number(
    data?.aov || (orders > 0 ? revenue / orders : 0)
  );
  const cvr = Number(data?.cvr || 0);

  const chartData =
    data?.revenueTrend && data.revenueTrend.length > 0
      ? data.revenueTrend
      : [{ day: "No data", revenue: 0 }];

  function changeStore(newStoreId: string) {
    setStoreId(newStoreId);

    window.history.pushState(
      {},
      "",
      `/?store_id=${newStoreId}`
    );
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="flex">
        <aside className="w-[300px] min-h-screen bg-[#0d0d13] border-r border-white/5 p-6">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-indigo-600 flex items-center justify-center">
                <Sparkles size={22} />
              </div>

              <div>
                <h1 className="text-2xl font-black tracking-tight">
                  Sentinel
                </h1>

                <p className="text-xs text-zinc-500">
                  AI Commerce OS
                </p>
              </div>
            </div>
          </div>

          <nav className="space-y-2">
            <Nav
              active
              icon={<Activity size={18} />}
              label="Overview"
            />

            <Nav
              icon={<Store size={18} />}
              label="Stores"
              href="/stores"
            />

            <Nav
              icon={<Box size={18} />}
              label="Product Insights"
              href="/product-insights"
            />

            <Nav
              icon={<Bot size={18} />}
              label="AI Recommendations"
              href="/ai-recommendations"
            />

            <Nav
              icon={<MessageCircle size={18} />}
              label="AI Chat"
              href="/ai-chat"
            />

            <Nav
              icon={<BarChart3 size={18} />}
              label="Google Ads"
              href="/google-ads"
            />

            <Nav
              icon={<Target size={18} />}
              label="Scale Command Center"
            />
          </nav>

          <div className="mt-10 rounded-3xl bg-gradient-to-br from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 p-5">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
              <Zap size={16} />
              AI Status
            </div>

            <p className="text-sm text-zinc-400">
              Monitoring products, margin risk and scaling
              signals.
            </p>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-sm text-zinc-500">
                Active store
              </p>

              <div className="flex items-center gap-3 mt-2">
                <select
                  value={storeId}
                  onChange={(e) =>
                    changeStore(e.target.value)
                  }
                  className="bg-[#111118] border border-white/10 rounded-2xl px-4 py-3 text-white min-w-[280px]"
                >
                  {stores.length === 0 && (
                    <option value={storeId}>
                      {storeId}
                    </option>
                  )}

                  {stores.map((store) => (
                    <option
                      key={store.id}
                      value={store.store_key}
                    >
                      {store.store_name}
                    </option>
                  ))}
                </select>

                <a
                  href="/stores"
                  className="h-11 px-4 rounded-2xl bg-[#111118] border border-white/10 flex items-center"
                >
                  Manage
                </a>
              </div>

              <p className="text-zinc-500 mt-3">
                {activeStore?.shopify_domain ||
                  "Store context active"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <RangeButton
                label="Today"
                active={range === "today"}
                onClick={() => setRange("today")}
              />

              <RangeButton
                label="Yesterday"
                active={range === "yesterday"}
                onClick={() => setRange("yesterday")}
              />

              <RangeButton
                label="30 Days"
                active={range === "30d"}
                onClick={() => setRange("30d")}
              />

              <button
                onClick={loadData}
                className="h-11 px-4 rounded-2xl bg-[#111118] border border-white/10 hover:bg-[#171722] flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Refresh
              </button>

              <button
                onClick={scanAlerts}
                className="h-11 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-semibold flex items-center gap-2"
              >
                <Bell size={16} />
                {scanning ? "Scanning..." : "Scan Alerts"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-6 mb-6">
            <Stat
              label="Revenue"
              value={`€${revenue.toLocaleString(
                "nl-NL"
              )}`}
            />

            <Stat
              label="Orders"
              value={orders.toString()}
            />

            <Stat
              label="Profit"
              value={`€${profit.toLocaleString(
                "nl-NL"
              )}`}
            />

            <Stat
              label="ROAS"
              value={`${roas.toFixed(2)}x`}
            />
          </div>

          <div className="rounded-3xl bg-[#111118] border border-white/8 p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={18} className="text-indigo-400" />
              <h3 className="text-xl font-black">
                Revenue Overview
              </h3>
            </div>

            <div className="h-80">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart data={chartData}>
                  <XAxis
                    dataKey="day"
                    stroke="#52525b"
                  />

                  <Tooltip />

                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.16}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Nav({
  label,
  icon,
  active,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-2xl transition ${
        active
          ? "bg-indigo-600 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>

      {href && <ChevronRight size={15} />}
    </div>
  );

  return href ? <a href={href}>{content}</a> : content;
}

function RangeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-11 px-4 rounded-2xl font-semibold ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-[#111118] border border-white/10 text-zinc-400"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl bg-[#111118] border border-white/8 p-6">
      <p className="text-zinc-500">{label}</p>

      <h3 className="text-3xl font-black mt-3">
        {value}
      </h3>
    </div>
  );
}