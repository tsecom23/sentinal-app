"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Box,
  Camera,
  LogOut,
  Moon,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Store,
  Sun,
  Tag,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type DashboardProps = {
  activeStoreId?: string;
};

type DateRange = "today" | "yesterday" | "30d";

type DashboardData = {
  revenue: number;
  netRevenue?: number;
  orders: number;
  sessions?: number;
  cvr?: number;
  aov?: number;
  adSpend?: number;
  productCost?: number;
  profit?: number;
  roas?: number;
  revenueTrend?: { day: string; revenue: number }[];
};

type ProductAlert = {
  id: string;
  product_title: string;
  alert_type: string;
  message: string;
  severity: string;
  created_at: string;
};

type TopProduct = {
  product_title: string;
  variant_title?: string;
  sold: number;
  revenue: number;
  profit: number;
  unit_cost?: number;
};

export default function Dashboard({ activeStoreId }: DashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [error, setError] = useState("");

  const storeId = activeStoreId || "ceofo";

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

      const productsRes = await fetch(`${API_URL}/api/products/top?${query}`, {
        cache: "no-store",
      });

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

    try {
      await fetch(`${API_URL}/api/alerts/scan-products?store_id=${storeId}`, {
        cache: "no-store",
      });

      await loadData();
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [storeId, range]);

  const revenue = Number(data?.revenue || 0);
  const orders = Number(data?.orders || 0);
  const adSpend = Number(data?.adSpend || 0);
  const productCost = Number(data?.productCost || 0);
  const profit = Number(data?.profit ?? revenue - adSpend - productCost);
  const roas = Number(data?.roas || 0);
  const aov = Number(data?.aov || (orders > 0 ? revenue / orders : 0));
  const sessions = Number(data?.sessions || 0);
  const cvr = Number(data?.cvr || 0);

  const chartData =
    data?.revenueTrend && data.revenueTrend.length > 0
      ? data.revenueTrend
      : [{ day: "No data", revenue: 0 }];

  return (
    <div
      className={`min-h-screen ${
        darkMode ? "bg-[#08080c] text-white" : "bg-zinc-100 text-black"
      }`}
    >
      <div className="flex">
        <aside
          className={`w-72 min-h-screen p-6 border-r ${
            darkMode ? "bg-[#0f0f15] border-zinc-900" : "bg-white border-zinc-200"
          }`}
        >
          <div className="mb-10">
            <h1 className="text-3xl font-black">Sentinel</h1>
            <p className="text-zinc-500 text-sm mt-1">AI Commerce OS</p>
          </div>

          <nav className="space-y-2">
            <SidebarItem label="Dashboard" active icon={<Box size={18} />} />
            <SidebarItem label="Orders" icon={<BarChart3 size={18} />} />
            <SidebarItem label="Products" icon={<Store size={18} />} />
            <SidebarItem label="AI Recommendations" icon={<Zap size={18} />} />
            <SidebarItem label="Google Ads" icon={<BarChart3 size={18} />} />
            <SidebarItem label="Returns & Disputes" icon={<RotateCcw size={18} />} />
            <SidebarItem label="Quality Control" icon={<Camera size={18} />} />
            <SidebarItem label="Price Negotiation" icon={<Tag size={18} />} />

            <button onClick={scanAlerts} className="w-full">
              <SidebarItem
                label={scanning ? "Scanning..." : "Scan Alerts"}
                icon={<Bell size={18} />}
              />
            </button>

            <a href="/stores">
              <SidebarItem label="Stores" icon={<Store size={18} />} />
            </a>

            <SidebarItem label="Settings" icon={<Settings size={18} />} />
          </nav>

          <div className="mt-10 space-y-2">
            <button onClick={() => setDarkMode(!darkMode)} className="w-full">
              <SidebarItem
                label={darkMode ? "Light Mode" : "Dark Mode"}
                icon={darkMode ? <Sun size={18} /> : <Moon size={18} />}
              />
            </button>

            <SidebarItem label="Log out" icon={<LogOut size={18} />} />
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-zinc-500 text-sm">Active Store</p>
              <h2 className="text-3xl font-black mt-1 break-all">{storeId}</h2>
            </div>

            <div className="flex gap-3">
              <RangeButton label="Today" active={range === "today"} onClick={() => setRange("today")} />
              <RangeButton label="Yesterday" active={range === "yesterday"} onClick={() => setRange("yesterday")} />
              <RangeButton label="Last 30 days" active={range === "30d"} onClick={() => setRange("30d")} />

              <button
                onClick={loadData}
                className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Refresh
              </button>

              <a
                href="/stores"
                className="bg-indigo-600 px-5 py-2 rounded-xl font-semibold"
              >
                Manage Stores
              </a>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 text-zinc-500">Loading dashboard...</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <MetricCard label="Revenue" value={`€${revenue.toLocaleString("nl-NL")}`} />
            <MetricCard label="Orders" value={orders.toString()} />
            <MetricCard label="Profit" value={`€${profit.toLocaleString("nl-NL")}`} />
            <MetricCard label="ROAS" value={`${roas.toFixed(2)}x`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <MetricCard label="Ad Spend" value={`€${adSpend.toLocaleString("nl-NL")}`} small />
            <MetricCard label="Product Cost" value={`€${productCost.toLocaleString("nl-NL")}`} small />
            <MetricCard label="AOV" value={`€${aov.toFixed(2)}`} small />
            <MetricCard label="CVR" value={`${cvr}%`} small />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <Panel title="Revenue Overview">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <XAxis dataKey="day" stroke="#71717a" />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.18}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="AI Alerts">
              <div className="space-y-4">
                {alerts.length === 0 ? (
                  <AlertItem
                    title="No alerts yet"
                    description="AI monitoring will appear here after scanning."
                    severity="low"
                  />
                ) : (
                  alerts.slice(0, 5).map((alert) => (
                    <AlertItem
                      key={alert.id}
                      title={alert.product_title}
                      description={alert.message}
                      severity={alert.severity}
                    />
                  ))
                )}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <Panel title="Top Products">
              <div className="space-y-4">
                {products.length === 0 ? (
                  <p className="text-zinc-500">No product data for this range.</p>
                ) : (
                  products.slice(0, 8).map((product, index) => (
                    <div
                      key={`${product.product_title}-${index}`}
                      className="bg-black border border-zinc-800 rounded-xl p-4"
                    >
                      <div className="flex justify-between gap-4">
                        <div>
                          <h4 className="font-bold">{product.product_title}</h4>
                          <p className="text-sm text-zinc-500">
                            {product.variant_title || "Default"} · {product.sold} sold
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-emerald-400 font-bold">
                            €{Number(product.profit || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-zinc-500">profit</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Today’s Scale Actions">
              <div className="space-y-4">
                <ActionItem
                  title="Check early winners"
                  description="Products with 1-5 orders need more data before scaling."
                />
                <ActionItem
                  title="Fix missing costs"
                  description="Profit is unreliable when COGS is missing."
                />
                <ActionItem
                  title="Scan product alerts"
                  description="Run alert scan after new product imports."
                />
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <ModuleCard title="Google Ads" description="Track campaigns, CPA, ROAS and spend." />
            <ModuleCard title="Product Insights" description="Find winners, early signals and weak margins." />
            <ModuleCard title="AI Recommendations" description="Get daily scaling decisions from Sentinel AI." />
            <ModuleCard title="Returns & Disputes" description="Track refunds, dispute risk and loss impact." />
            <ModuleCard title="Quality Control" description="Monitor supplier and product quality issues." />
            <ModuleCard title="Price Negotiation" description="Find products where supplier costs should be negotiated." />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  active,
  icon,
}: {
  label: string;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </div>
  );
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
      className={`px-4 py-2 rounded-xl font-semibold ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-zinc-900 border border-zinc-800 text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <p className="text-zinc-500 text-sm">{label}</p>
      <h2 className={`${small ? "text-2xl" : "text-3xl"} font-black mt-3`}>
        {value}
      </h2>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-xl font-bold mb-5">{title}</h3>
      {children}
    </div>
  );
}

function AlertItem({
  title,
  description,
  severity,
}: {
  title: string;
  description: string;
  severity: string;
}) {
  return (
    <div className="bg-black border border-zinc-800 rounded-xl p-4">
      <div className="flex justify-between gap-4">
        <div>
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-zinc-500 text-sm">{description}</p>
        </div>

        <span
          className={`h-fit text-xs px-3 py-1 rounded-full font-bold ${
            severity === "high"
              ? "bg-red-500/10 text-red-400"
              : severity === "medium"
              ? "bg-yellow-500/10 text-yellow-400"
              : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {severity}
        </span>
      </div>
    </div>
  );
}

function ActionItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-black border border-zinc-800 rounded-xl p-4">
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-zinc-500 text-sm">{description}</p>
    </div>
  );
}

function ModuleCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-zinc-400 mb-5">{description}</p>
      <button className="bg-indigo-600 px-4 py-2 rounded-xl">Open Module</button>
    </div>
  );
}