"use client";

import { useEffect, useState } from "react";
import { BarChart3, Box, Camera, LogOut, Moon, RotateCcw, Settings, Tag } from "lucide-react";

const API_URL = "https://sentinel-api.tssheets1.workers.dev";

type Insight = {
  product_title: string;
  variant_title: string;
  sold: number;
  revenue: number;
  unit_cost: number;
  total_cost: number;
  profit: number;
  margin: number;
  label: string;
  severity: string;
  recommendation: string;
};

export default function AIRecommendationsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);

  async function loadInsights() {
    const res = await fetch(`${API_URL}/api/insights/products`, {
      cache: "no-store",
    });

    const json = (await res.json()) as { insights: Insight[] };
    setInsights(json.insights || []);
  }

  useEffect(() => {
    loadInsights();
  }, []);

  const scale = insights.filter((i) => i.label === "SCALE");
  const problems = insights.filter((i) =>
    ["KILL", "FIX COST", "FIX MARGIN"].includes(i.label)
  );

  return (
    <div className="flex min-h-screen bg-[#0b0b0f] text-white">
      <aside className="w-[280px] bg-[#111114] p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-10">Sentinel</h1>

          <nav className="space-y-3 text-zinc-400">
            <a href="/">
              <Nav label="Overview" icon={<Box size={18} />} />
            </a>

            <a href="/google-ads">
              <Nav label="Google Ads" icon={<BarChart3 size={18} />} />
            </a>

            <a href="/product-insights">
              <Nav label="Product Insights" icon={<Box size={18} />} />
            </a>

            <Nav active label="AI Recommendations" icon={<BarChart3 size={18} />} />

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
        <div className="mb-10">
          <p className="text-zinc-500">Sentinel</p>
          <h1 className="text-4xl font-bold">AI Product Recommendations</h1>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card title="Insights" value={insights.length.toString()} />
          <Card title="Scale Candidates" value={scale.length.toString()} />
          <Card title="Needs Fixing" value={problems.length.toString()} />
          <Card title="Engine" value="Rule AI" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Panel title="Scale Opportunities">
            {scale.length === 0 ? (
              <Empty text="No scale candidates yet." />
            ) : (
              scale.map((item) => <InsightRow key={`${item.product_title}-${item.variant_title}`} item={item} />)
            )}
          </Panel>

          <Panel title="Problems To Fix">
            {problems.length === 0 ? (
              <Empty text="No urgent product issues." />
            ) : (
              problems.map((item) => <InsightRow key={`${item.product_title}-${item.variant_title}`} item={item} />)
            )}
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="All Recommendations">
            {insights.map((item) => (
              <InsightRow key={`${item.product_title}-${item.variant_title}-all`} item={item} />
            ))}
          </Panel>
        </div>
      </main>
    </div>
  );
}

function InsightRow({ item }: { item: Insight }) {
  const labelClass =
    item.label === "SCALE"
      ? "bg-emerald-500/10 text-emerald-400"
      : item.label === "KILL" || item.label === "FIX COST"
      ? "bg-red-500/10 text-red-400"
      : "bg-yellow-500/10 text-yellow-400";

  return (
    <div className="border-b border-zinc-800 pb-5">
      <div className="flex justify-between gap-4">
        <div>
          <p className="font-semibold text-lg">{item.product_title}</p>
          <p className="text-sm text-zinc-500">
            {item.variant_title || "Default"} · {item.sold} sold · {item.margin}% margin
          </p>
        </div>

        <span className={`h-fit px-3 py-1 rounded-full text-xs font-bold ${labelClass}`}>
          {item.label}
        </span>
      </div>

      <p className="text-zinc-400 mt-3">{item.recommendation}</p>

      <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
        <Mini label="Revenue" value={`€${Number(item.revenue).toLocaleString("nl-NL")}`} />
        <Mini label="Profit" value={`€${Number(item.profit).toLocaleString("nl-NL")}`} />
        <Mini label="Cost" value={`€${Number(item.total_cost).toLocaleString("nl-NL")}`} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#15151c] p-6 rounded-2xl">
      <p className="text-zinc-500">{title}</p>
      <h2 className="text-3xl font-bold mt-2">{value}</h2>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#15151c] rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-6">{title}</h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0f0f14] rounded-xl p-3">
      <p className="text-zinc-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-zinc-500">{text}</p>;
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