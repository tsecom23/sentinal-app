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

type TopProduct = {
  product_title: string;
  variant_title: string;
  sold: number;
  revenue: number;
  unit_cost: number;
  total_cost: number;
  profit: number;
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

  const [data, setData] = useState<DashboardData | null>(null);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  async function loadData() {
    try {
      setError("");

      const storesRes = await fetch(`${API_URL}/api/stores`, {
        cache: "no-store",
      });
      const storesJson = (await storesRes.json()) as { stores: Store[] };
      setStores(storesJson.stores || []);

      const dashboardRes = await fetch(
        `${API_URL}/api/dashboard/overview?store_id=${activeStore}`,
        { cache: "no-store" }
      );
      const dashboardJson = (await dashboardRes.json()) as DashboardData;
      setData(dashboardJson);

      const productsRes = await fetch(
        `${API_URL}/api/products/top?store_id=${activeStore}`,
        { cache: "no-store" }
      );
      const productsJson = (await productsRes.json()) as {
        products: TopProduct[];
      };
      setProducts(productsJson.products || []);

      const alertsRes = await fetch(
        `${API_URL}/api/product-alerts?store_id=${activeStore}`,
        { cache: "no-store" }
      );
      const alertsJson = (await alertsRes.json()) as {
        alerts: ProductAlert[];
      };
      setAlerts(alertsJson.alerts || []);
    } catch (err) {
      console.error(err);
      setError("Kan Worker API niet bereiken");
    }
  }

  async function scanAlerts() {
    await fetch(`${API_URL}/api/alerts/scan-products?store_id=${activeStore}`, {
      cache: "no-store",
    });

    await loadData();
  }

  useEffect(() => {
    loadData();
  }, [activeStore]);

  async function updateCost(product: TopProduct, cost: string) {
    const key = `${product.product_title}-${product.variant_title}`;
    setSaving(key);

    await fetch(`${API_URL}/api/product-cost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_title: product.product_title,
        variant_title: product.variant_title || "",
        cost: Number(cost || 0),
        store_id: activeStore,
      }),
    });

    await loadData();
    setSaving("");
  }

  const revenue = data?.revenue ?? 0;
  const netRevenue = data?.netRevenue ?? revenue;
  const orders = data?.orders ?? 0;
  const adSpend = data?.adSpend ?? 0;
  const productCost = data?.productCost ?? 0;
  const profit = data?.profit ?? revenue - adSpend - productCost;
  const roas = data?.roas ?? 0;
  const sessions = data?.sessions ?? 0;
  const aov = data?.aov ?? 0;
  const cvr = data?.cvr ?? 0;

  const chartData =
    data?.revenueTrend && data.revenueTrend.length > 0
      ? data.revenueTrend
      : [{ day: "No data", revenue: 0 }];

  return (
    <div className="flex min-h-screen bg-[#0b0b0f] text-white">
      <aside className="w-[280px] bg-[#111114] p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-10">Sentinel</h1>

          <nav className="space-y-3 text-zinc-400">
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

            <div className="ml-4 border-l border-zinc-800 pl-4 mt-4 space-y-2">
              <Nav small label="Price Negotiation" icon={<Tag size={16} />} />
              <Nav small label="Quality Control" icon={<Camera size={16} />} />
            </div>

            <Nav label="Returns & Disputes" icon={<RotateCcw size={18} />} />
          </nav>
        </div>

        <div className="space-y-4 text-zinc-400">
          <Nav label="Dark Mode" icon={<Moon size={18} />} />
          <Nav label="Settings" icon={<Settings size={18} />} />
          <Nav label="Log out" icon={<LogOut size={18} />} />
        </div>
      </aside>

      <main className="flex-1 p-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>

            <select
              value={activeStore}
              onChange={(e) => setActiveStore(e.target.value)}
              className="mt-3 bg-[#15151c] border border-zinc-800 rounded-lg px-4 py-2 text-sm"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 items-center">
            <button className="text-zinc-400">Today</button>
            <button className="text-zinc-400">Yesterday</button>
            <button className="bg-indigo-600 px-4 py-2 rounded-lg font-semibold">
              Last 30 days
            </button>
            <button
              onClick={scanAlerts}
              className="bg-zinc-800 px-4 py-2 rounded-lg font-semibold"
            >
              Scan Alerts
            </button>
            <button
              onClick={loadData}
              className="bg-zinc-800 px-4 py-2 rounded-lg font-semibold"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 text-red-400 p-5 rounded-xl mb-6">
            {error}
          </div>
        )}

        {!data ? (
          <div className="bg-[#15151c] p-8 rounded-2xl">Data laden...</div>
        ) : (
          <>
            <div className="bg-[#15151c] p-8 rounded-2xl mb-6">
              <p className="text-zinc-400">All Stores · Revenue</p>

              <div className="flex items-end gap-4 mt-2">
                <h2 className="text-5xl font-black">
                  €{revenue.toLocaleString("nl-NL")}
                </h2>

                <p className="text-zinc-500">
                  Net: €{netRevenue.toLocaleString("nl-NL")} · Profit: €
                  {profit.toLocaleString("nl-NL")}
                </p>
              </div>

              <p className="text-emerald-500 mt-3">
                Profit = revenue - ad spend - product costs
              </p>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-6">
              <Card label="Orders" value={orders.toString()} />
              <Card label="Ad Spend" value={`€${adSpend}`} />
              <Card label="Product Cost" value={`€${productCost}`} />
              <Card label="ROAS" value={`${roas}x`} />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-[#15151c] p-6 rounded-2xl">
                <h3 className="font-bold mb-4">Revenue Trend</h3>

                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="day" stroke="#666" />
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

              <div className="space-y-4">
                <Panel title="Profit Summary">
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <MiniStat
                      label="Revenue"
                      value={`€${revenue.toLocaleString("nl-NL")}`}
                    />
                    <MiniStat
                      label="Profit"
                      value={`€${profit.toLocaleString("nl-NL")}`}
                    />
                    <MiniStat label="AOV" value={`€${aov}`} />
                    <MiniStat label="CVR" value={`${cvr}%`} />
                  </div>
                </Panel>

                <Panel title="Traffic">
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <MiniStat label="Sessions / Clicks" value={`${sessions}`} />
                    <MiniStat label="Orders" value={`${orders}`} />
                  </div>
                </Panel>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mt-6">
              <Panel title="Product Alerts">
                <div className="mt-4 space-y-4">
                  {alerts.length === 0 ? (
                    <div className="text-zinc-500">
                      Geen product alerts gevonden.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="border-b border-zinc-800 pb-4"
                      >
                        <div className="flex justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <Bell size={16} className="text-indigo-400" />
                              <p className="font-semibold">
                                {alert.product_title}
                              </p>
                            </div>

                            <p className="text-sm text-zinc-400 mt-2">
                              {alert.message}
                            </p>

                            <p className="text-xs text-zinc-600 mt-2">
                              {alert.alert_type} ·{" "}
                              {new Date(alert.created_at).toLocaleString(
                                "nl-NL"
                              )}
                            </p>
                          </div>

                          <span
                            className={`h-fit px-3 py-1 rounded-full text-xs font-bold ${
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
              </Panel>

              <Panel title="Top Products">
                <div className="mt-4 space-y-4">
                  {products.map((product) => {
                    const key = `${product.product_title}-${product.variant_title}`;

                    return (
                      <div
                        key={key}
                        className="border-b border-zinc-800 pb-4"
                      >
                        <div className="flex justify-between">
                          <div>
                            <p className="font-semibold">
                              {product.product_title}
                            </p>
                            <p className="text-sm text-zinc-500">
                              {product.variant_title || "Default"} ·{" "}
                              {product.sold} sold
                            </p>
                          </div>

                          <div className="text-right text-emerald-500 font-bold">
                            €{Number(product.profit).toFixed(2)}
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <input
                            type="number"
                            placeholder="Cost per unit"
                            defaultValue={product.unit_cost || 0}
                            className="w-full rounded-lg bg-[#0f0f14] border border-zinc-800 px-3 py-2 text-sm"
                            id={`cost-${key}`}
                          />

                          <button
                            className="bg-indigo-600 px-4 rounded-lg"
                            onClick={() => {
                              const input = document.getElementById(
                                `cost-${key}`
                              ) as HTMLInputElement;

                              updateCost(product, input.value);
                            }}
                          >
                            {saving === key ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
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
  small,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer ${
        active ? "bg-indigo-600 text-white" : "hover:bg-zinc-800"
      } ${small ? "text-sm" : ""}`}
    >
      {icon}
      {label}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#15151c] p-6 rounded-xl">
      <p className="text-zinc-400">{label}</p>
      <h2 className="text-2xl font-bold mt-2">{value}</h2>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#0f0f14] p-3">
      <p className="text-zinc-500">{label}</p>
      <p className="font-bold">{value}</p>
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
    <div className="bg-[#15151c] p-5 rounded-xl">
      <h4 className="font-semibold">{title}</h4>
      {children}
    </div>
  );
}