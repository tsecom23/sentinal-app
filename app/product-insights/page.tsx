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

type Product = {
  product_title: string;
  variant_title: string;
  sold: number;
  revenue: number;
  unit_cost: number;
  total_cost: number;
  profit: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function ProductInsightsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  async function loadProducts() {
    const res = await fetch(`${API_URL}/api/products/top`, {
      cache: "no-store",
    });

    const json = (await res.json()) as { products: Product[] };
    setProducts(json.products || []);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const highestProfit = [...products]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const lowestProfit = [...products]
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const missingCosts = products.filter((p) => !p.unit_cost);

  const totalRevenue = products.reduce(
    (acc, p) => acc + Number(p.revenue || 0),
    0
  );

  const totalProfit = products.reduce(
    (acc, p) => acc + Number(p.profit || 0),
    0
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

            <Nav label="Data Insights" icon={<BarChart3 size={18} />} />
            <Nav active label="Product Insights" icon={<Box size={18} />} />

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
          <h1 className="text-4xl font-bold">Product Insights</h1>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card title="Products" value={products.length.toString()} />
          <Card title="Revenue" value={`€${totalRevenue.toLocaleString("nl-NL")}`} />
          <Card title="Profit" value={`€${totalProfit.toLocaleString("nl-NL")}`} />
          <Card title="Missing Costs" value={missingCosts.length.toString()} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Panel title="Highest Profit Products">
            {highestProfit.map((product) => (
              <ProductRow
                key={`${product.product_title}-${product.variant_title}-high`}
                product={product}
              />
            ))}
          </Panel>

          <Panel title="Lowest Profit Products">
            {lowestProfit.map((product) => (
              <ProductRow
                key={`${product.product_title}-${product.variant_title}-low`}
                product={product}
              />
            ))}
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="Missing Product Costs">
            {missingCosts.length === 0 ? (
              <p className="text-emerald-500">
                All product costs are configured ✅
              </p>
            ) : (
              missingCosts.map((product) => (
                <div
                  key={`${product.product_title}-${product.variant_title}-missing`}
                  className="border-b border-zinc-800 py-4"
                >
                  <p className="font-semibold">{product.product_title}</p>
                  <p className="text-zinc-500 text-sm">
                    {product.variant_title || "Default"} · No cost configured
                  </p>
                </div>
              ))
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const slug = slugify(product.product_title);
  const profit = Number(product.profit || 0);
  const revenue = Number(product.revenue || 0);
  const cost = Number(product.total_cost || 0);

  return (
    <a
      href={`/product/${slug}`}
      className="block border-b border-zinc-800 pb-4 hover:bg-zinc-800/30 rounded-lg p-3 transition"
    >
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="font-semibold text-lg">{product.product_title}</p>
          <p className="text-sm text-zinc-500">
            {product.variant_title || "Default"}
          </p>
          <p className="text-sm text-zinc-500 mt-1">{product.sold} sold</p>
        </div>

        <div className="text-right">
          <p
            className={
              profit >= 0
                ? "text-emerald-500 font-bold text-lg"
                : "text-red-500 font-bold text-lg"
            }
          >
            €{profit.toLocaleString("nl-NL")}
          </p>

          <p className="text-sm text-zinc-500">
            Revenue €{revenue.toLocaleString("nl-NL")}
          </p>

          <p className="text-sm text-zinc-500">
            Cost €{cost.toLocaleString("nl-NL")}
          </p>
        </div>
      </div>
    </a>
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#15151c] rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-6">{title}</h3>
      <div className="space-y-4">{children}</div>
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