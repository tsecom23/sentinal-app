"use client";

import { useEffect, useState } from "react";

export default function Dashboard({
  activeStoreId,
}: {
  activeStoreId?: string;
}) {
  const [activeStore, setActiveStore] = useState(
    activeStoreId || "No Store Selected"
  );

  useEffect(() => {
    if (activeStoreId) {
      setActiveStore(activeStoreId);
    }
  }, [activeStoreId]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex">
        {/* SIDEBAR */}
        <aside className="w-72 min-h-screen bg-zinc-950 border-r border-zinc-900 p-6">
          <div className="mb-10">
            <h1 className="text-3xl font-bold">Sentinel</h1>
            <p className="text-zinc-500 text-sm mt-1">
              AI Commerce OS
            </p>
          </div>

          <nav className="space-y-2">
            <SidebarItem label="Dashboard" active />
            <SidebarItem label="Orders" />
            <SidebarItem label="Products" />
            <SidebarItem label="AI Recommendations" />
            <SidebarItem label="Google Ads" />
            <SidebarItem label="Returns & Disputes" />
            <SidebarItem label="Quality Control" />
            <SidebarItem label="Price Negotiation" />
            <SidebarItem label="Scan Alerts" />
            <SidebarItem label="Settings" />
          </nav>
        </aside>

        {/* MAIN */}
        <main className="flex-1 p-8">
          {/* TOPBAR */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <p className="text-zinc-500 text-sm">
                Active Store
              </p>

              <h2 className="text-3xl font-bold mt-1">
                {activeStore}
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <button className="bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
                Dark Mode
              </button>

              <a
                href="/stores"
                className="bg-indigo-600 px-5 py-2 rounded-xl font-semibold"
              >
                Manage Stores
              </a>
            </div>
          </div>

          {/* METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
            <Card label="Revenue Today" value="€0" />
            <Card label="Orders Today" value="0" />
            <Card label="Profit Today" value="€0" />
            <Card label="ROAS" value="0.00" />
          </div>

          {/* CHARTS */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <h3 className="text-xl font-bold mb-4">
                Revenue Overview
              </h3>

              <div className="h-64 bg-black rounded-xl border border-zinc-800 flex items-center justify-center text-zinc-600">
                Revenue Chart Coming Soon
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <h3 className="text-xl font-bold mb-4">
                AI Alerts
              </h3>

              <div className="space-y-4">
                <AlertItem
                  title="No alerts yet"
                  description="AI monitoring will appear here."
                />
              </div>
            </div>
          </div>

          {/* MODULES */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <ModuleCard
              title="Google Ads"
              description="Track campaigns, ROAS & spend."
            />

            <ModuleCard
              title="Product Insights"
              description="Winning products & scaling data."
            />

            <ModuleCard
              title="AI Recommendations"
              description="AI suggestions for scaling."
            />

            <ModuleCard
              title="Returns & Disputes"
              description="Track refunds and disputes."
            />

            <ModuleCard
              title="Quality Control"
              description="Supplier & product quality checks."
            />

            <ModuleCard
              title="Price Negotiation"
              description="Supplier negotiation system."
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`w-full text-left px-4 py-3 rounded-xl transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
      }`}
    >
      {label}
    </button>
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
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <p className="text-zinc-500 text-sm">{label}</p>

      <h2 className="text-3xl font-bold mt-3">
        {value}
      </h2>
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

      <p className="text-zinc-400 mb-5">
        {description}
      </p>

      <button className="bg-indigo-600 px-4 py-2 rounded-xl">
        Open Module
      </button>
    </div>
  );
}

function AlertItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-black border border-zinc-800 rounded-xl p-4">
      <h4 className="font-semibold mb-1">{title}</h4>

      <p className="text-zinc-500 text-sm">
        {description}
      </p>
    </div>
  );
}