"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Box,
  Camera,
  LogOut,
  Moon,
  RotateCcw,
  Send,
  Settings,
  Sun,
  Tag,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type Store = {
  id: string;
  name: string;
  shopify_domain: string;
  created_at: string;
};

type DashboardData = {
  revenue: number;
  netRevenue: number;
  orders: number;
  sessions: number;
  cvr: number;
  aov: number;
  adSpend: number;
  productCost: number;
  profit: number;
  roas: number;
  revenueTrend: { day: string; revenue: number }[];
};

type ProductAlert = {
  id: string;
  product_title: string;
  alert_type: string;
  message: string;
  severity: string;
  created_at: string;
};

export default function Dashboard() {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState("ceofo");

  const [range, setRange] = useState("30d");

  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);

  const [loading, setLoading] = useState(false);

  const [darkMode, setDarkMode] = useState(true);

  async function loadData() {
    try {
      setLoading(true);

      const storesRes = await fetch(`${API_URL}/api/stores`, {
        cache: "no-store",
      });

      const storesJson = await storesRes.json();

      setStores(storesJson.stores || []);

      const dashboardRes = await fetch(
        `${API_URL}/api/dashboard/overview?store_id=${activeStore}&range=${range}`,
        {
          cache: "no-store",
        }
      );

      const dashboardJson = await dashboardRes.json();

      setData(dashboardJson);

      const alertsRes = await fetch(
        `${API_URL}/api/product-alerts?store_id=${activeStore}`,
        {
          cache: "no-store",
        }
      );

      const alertsJson = await alertsRes.json();

      setAlerts(alertsJson.alerts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function scanAlerts() {
    setLoading(true);

    await fetch(
      `${API_URL}/api/alerts/scan-products?store_id=${activeStore}`,
      {
        cache: "no-store",
      }
    );

    await loadData();

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [activeStore, range]);

  const revenue = data?.revenue || 0;
  const profit = data?.profit || 0;
  const orders = data?.orders || 0;
  const aov = data?.aov || 0;
  const roas = data?.roas || 0;

  const chartData =
    data?.revenueTrend && data.revenueTrend.length > 0
      ? data.revenueTrend
      : [{ day: "No data", revenue: 0 }];

  return (
    <div
      className={`flex min-h-screen ${
        darkMode
          ? "bg-[#0b0b0f] text-white"
          : "bg-[#f4f4f5] text-black"
      }`}
    >
      <aside
        className={`w-[280px] p-6 flex flex-col justify-between ${
          darkMode ? "bg-[#111114]" : "bg-white border-r"
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold mb-10">Sentinel</h1>

          <nav className="space-y-3">
            <Nav active label="Overview" icon={<Box size={18} />} />

            <a href="/google-ads">
              <Nav label="Google Ads" icon={<BarChart3 size={18} />} />
            </a>

            <a href="/product-insights">
              <Nav label="Product Insights" icon={<Box size={18} />} />
            </a>

            <a href="/ai-recommendations">
              <Nav label="AI Recommendations" icon={<BarChart3 size={18} />} />
            </a>

            <a href="/ai-chat">
              <Nav label="AI Chat" icon={<Send size={18} />} />
            </a>

            <button
              onClick={() =>
                alert("Price Negotiation module coming soon.")
              }
              className="w-full"
            >
              <Nav
                label="Price Negotiation"
                icon={<Tag size={18} />}
              />
            </button>

            <button
              onClick={() =>
                alert("Quality Control module coming soon.")
              }
              className="w-full"
            >
              <Nav
                label="Quality Control"
                icon={<Camera size={18} />}
              />
            </button>

            <button
              onClick={() =>
                alert("Returns & Disputes module coming soon.")
              }
              className="w-full"
            >
              <Nav
                label="Returns & Disputes"
                icon={<RotateCcw size={18} />}
              />
            </button>
          </nav>
        </div>

        <div className="space-y-3">
          <button
            className="w-full"
            onClick={() => setDarkMode(!darkMode)}
          >
            <Nav
              label={darkMode ? "Light Mode" : "Dark Mode"}
              icon={darkMode ? <Sun size={18} /> : <Moon size={18} />}
            />
          </button>

          <button
            className="w-full"
            onClick={() => alert("Settings coming soon")}
          >
            <Nav label="Settings" icon={<Settings size={18} />} />
          </button>

          <button
            className="w-full"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            <Nav label="Log out" icon={<LogOut size={18} />} />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>

            <select
              value={activeStore}
              onChange={(e) => setActiveStore(e.target.value)}
              className={`mt-3 rounded-lg px-4 py-2 text-sm ${
                darkMode
                  ? "bg-[#15151c] border border-zinc-800"
                  : "bg-white border"
              }`}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={() => setRange("today")}
              className={`px-4 py-2 rounded-lg ${
                range === "today"
                  ? "bg-indigo-600 text-white"
                  : darkMode
                  ? "bg-zinc-800"
                  : "bg-white border"
              }`}
            >
              Today
            </button>

            <button
              onClick={() => setRange("yesterday")}
              className={`px-4 py-2 rounded-lg ${
                range === "yesterday"
                  ? "bg-indigo-600 text-white"
                  : darkMode
                  ? "bg-zinc-800"
                  : "bg-white border"
              }`}
            >
              Yesterday
            </button>

            <button
              onClick={() => setRange("30d")}
              className={`px-4 py-2 rounded-lg ${
                range === "30d"
                  ? "bg-indigo-600 text-white"
                  : darkMode
                  ? "bg-zinc-800"
                  : "bg-white border"
              }`}
            >
              Last 30 days
            </button>

            <button
              onClick={scanAlerts}
              className="bg-orange-500 text-white px-4 py-2 rounded-lg"
            >
              Scan Alerts
            </button>

            <button
              onClick={loadData}
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <>
            <div
              className={`p-8 rounded-2xl mb-6 ${
                darkMode ? "bg-[#15151c]" : "bg-white border"
              }`}
            >
              <p className="text-zinc-400">Revenue</p>

              <div className="flex items-end gap-4 mt-2">
                <h2 className="text-5xl font-black">
                  €{revenue.toLocaleString("nl-NL")}
                </h2>

                <p className="text-zinc-500">
                  Profit: €{profit.toLocaleString("nl-NL")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-6">
              <Card label="Orders" value={orders.toString()} />
              <Card label="AOV" value={`€${aov}`} />
              <Card label="ROAS" value={`${roas}x`} />
              <Card label="Store" value={activeStore.toUpperCase()} />
            </div>

            <div
              className={`p-6 rounded-2xl ${
                darkMode ? "bg-[#15151c]" : "bg-white border"
              }`}
            >
              <h3 className="font-bold mb-4">Revenue Trend</h3>

              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <XAxis dataKey="day" />
                    <Tooltip />

                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6">
              <div
                className={`p-6 rounded-2xl ${
                  darkMode ? "bg-[#15151c]" : "bg-white border"
                }`}
              >
                <h3 className="font-bold mb-6">Product Alerts</h3>

                <div className="space-y-4">
                  {alerts.length === 0 ? (
                    <div className="text-zinc-500">
                      No alerts found.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="border-b border-zinc-800 pb-4"
                      >
                        <div className="flex justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Bell size={16} />
                              <p className="font-semibold">
                                {alert.product_title}
                              </p>
                            </div>

                            <p className="text-sm text-zinc-400 mt-2">
                              {alert.message}
                            </p>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold h-fit ${
                              alert.severity === "high"
                                ? "bg-red-500/10 text-red-400"
                                : alert.severity === "medium"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : "bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Nav({
  label,
  icon,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer ${
        active
          ? "bg-indigo-600 text-white"
          : "hover:bg-zinc-800 text-zinc-400"
      }`}
    >
      {icon}
      {label}
    </div>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#15151c] p-6 rounded-xl">
      <p className="text-zinc-400">{label}</p>
      <h2 className="text-2xl font-bold mt-2">{value}</h2>
    </div>
  );
}