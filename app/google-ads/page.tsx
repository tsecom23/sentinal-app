"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Box,
  Camera,
  LogOut,
  Moon,
  RotateCcw,
  Settings,
  Tag,
} from "lucide-react";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type DashboardData = {
  revenue: number;
  orders: number;
  sessions: number;
  cvr: number;
  aov: number;
  adSpend: number;
  productCost: number;
  profit: number;
  roas: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
};

export default function GoogleAdsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function loadData() {
    const res = await fetch(`${API_URL}/api/dashboard/overview`, {
      cache: "no-store",
    });

    const json = (await res.json()) as DashboardData;
    setData(json);
  }

  async function syncGoogleAds() {
    setSyncing(true);

    try {
      await fetch(`${API_URL}/api/ads/sync-google?t=${Date.now()}`);
      await loadData();
    } catch (err) {
      console.error(err);
    }

    setSyncing(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const revenue = data?.revenue ?? 0;
  const adSpend = data?.adSpend ?? 0;
  const profit = data?.profit ?? 0;
  const roas = data?.roas ?? 0;
  const clicks = data?.sessions ?? 0;
  const orders = data?.orders ?? 0;
  const cpa = orders > 0 ? adSpend / orders : 0;
  const cvr = data?.cvr ?? 0;

  return (
    <div className="flex min-h-screen bg-[#0b0b0f] text-white">
      <aside className="w-[280px] bg-[#111114] p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-10">Sentinel</h1>

          <nav className="space-y-3 text-zinc-400">
            <a href="/">
              <Nav label="Overview" icon={<Box size={18} />} />
            </a>

            <Nav
              active
              label="Google Ads"
              icon={<BarChart3 size={18} />}
            />

            <a href="/product-insights">
              <Nav
                label="Product Insights"
                icon={<Box size={18} />}
              />
            </a>

            <div className="ml-4 border-l border-zinc-800 pl-4 mt-4 space-y-2">
              <Nav
                small
                label="Price Negotiation"
                icon={<Tag size={16} />}
              />

              <Nav
                small
                label="Quality Control"
                icon={<Camera size={16} />}
              />
            </div>

            <Nav
              label="Returns & Disputes"
              icon={<RotateCcw size={18} />}
            />
          </nav>
        </div>

        <div className="space-y-4 text-zinc-400">
          <Nav label="Dark Mode" icon={<Moon size={18} />} />
          <Nav label="Settings" icon={<Settings size={18} />} />
          <Nav label="Log out" icon={<LogOut size={18} />} />
        </div>
      </aside>

      <main className="flex-1 p-10">
        <div className="flex justify-between items-center mb-10">
          <div>
            <p className="text-zinc-500">Sentinel</p>

            <h1 className="text-4xl font-bold">
              Google Ads Insights
            </h1>
          </div>

          <button
            onClick={syncGoogleAds}
            className="bg-blue-600 px-5 py-3 rounded-xl font-semibold hover:bg-blue-500 transition"
          >
            {syncing ? "Syncing..." : "Sync Google Ads"}
          </button>
        </div>

        {!data ? (
          <div className="bg-[#15151c] p-8 rounded-2xl">
            Data laden...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-6 mb-8">
              <Card
                title="Ad Spend"
                value={`€${adSpend.toLocaleString("nl-NL")}`}
              />

              <Card
                title="Revenue"
                value={`€${revenue.toLocaleString("nl-NL")}`}
              />

              <Card title="ROAS" value={`${roas}x`} />

              <Card
                title="Profit"
                value={`€${profit.toLocaleString("nl-NL")}`}
              />
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
              <Card
                title="Clicks"
                value={clicks.toLocaleString("nl-NL")}
              />

              <Card
                title="Orders"
                value={orders.toLocaleString("nl-NL")}
              />

              <Card
                title="CPA"
                value={`€${cpa.toFixed(2)}`}
              />

              <Card
                title="CVR"
                value={`${cvr}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Panel title="Google Ads Performance">
                <Row
                  label="Total spend"
                  value={`€${adSpend.toLocaleString("nl-NL")}`}
                />

                <Row
                  label="Revenue from store"
                  value={`€${revenue.toLocaleString("nl-NL")}`}
                />

                <Row
                  label="ROAS"
                  value={`${roas}x`}
                />

                <Row
                  label="CPA"
                  value={`€${cpa.toFixed(2)}`}
                />

                <Row
                  label="Orders"
                  value={orders.toString()}
                />
              </Panel>

              <Panel title="Scaling Recommendation">
                {adSpend === 0 ? (
                  <p className="text-yellow-400">
                    ⚠️ Google Ads is nog niet gekoppeld
                    of er is nog geen ad spend binnen.
                  </p>
                ) : roas >= 3 && profit > 0 ? (
                  <p className="text-emerald-500">
                    ✅ Strong performance. Google Ads
                    campaigns are profitable and can be
                    scaled carefully.
                  </p>
                ) : roas >= 1.5 ? (
                  <p className="text-yellow-400">
                    ⚠️ Break-even zone. Monitor CPA and
                    product margin before scaling Google
                    Ads spend.
                  </p>
                ) : (
                  <p className="text-red-400">
                    ❌ Weak performance. Reduce Google
                    Ads spend or improve landing
                    page/product economics.
                  </p>
                )}
              </Panel>
            </div>

            <div className="mt-6">
              <Panel title="Google Ads Status">
                <p className="text-zinc-400">
                  Deze pagina is volledig Google Ads
                  focused. Zodra je Google Ads developer
                  token is approved haalt Sentinel
                  automatisch spend, clicks, impressions,
                  CTR, CPC, conversions en ROAS op.
                </p>
              </Panel>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="bg-[#15151c] p-6 rounded-2xl">
      <p className="text-zinc-500">{title}</p>

      <h2 className="text-3xl font-bold mt-2">
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
    <div className="bg-[#15151c] p-6 rounded-2xl">
      <h3 className="text-xl font-bold mb-5">
        {title}
      </h3>

      {children}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between border-b border-zinc-800 py-3">
      <span className="text-zinc-500">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
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
        active
          ? "bg-blue-600 text-white"
          : "hover:bg-zinc-800"
      } ${small ? "text-sm" : ""}`}
    >
      {icon}
      {label}
    </div>
  );
}