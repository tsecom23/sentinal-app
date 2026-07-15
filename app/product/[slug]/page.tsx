"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

export default function ProductDetailPage() {
  const params = useParams();
  const slug = String(params.slug || "");

  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    async function loadProduct() {
      const res = await fetch(`${API_URL}/api/products/top`, {
        cache: "no-store",
      });

      const json = (await res.json()) as { products: Product[] };

      const found = json.products.find(
        (item) => slugify(item.product_title) === slug
      );

      setProduct(found || null);
    }

    loadProduct();
  }, [slug]);

  if (!product) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] text-gray-900 p-10">
        <a href="/product-insights" className="text-gray-500">
          ← Back to Product Insights
        </a>

        <h1 className="text-3xl font-bold mt-8">Product not found</h1>
      </div>
    );
  }

  const revenue = Number(product.revenue || 0);
  const profit = Number(product.profit || 0);
  const totalCost = Number(product.total_cost || 0);

  const margin =
    revenue > 0
      ? Number(((profit / revenue) * 100).toFixed(1))
      : 0;

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900 p-10">
      <a
        href="/product-insights"
        className="text-gray-500 hover:text-gray-900"
      >
        ← Back to Product Insights
      </a>

      <div className="mt-8 mb-10">
        <p className="text-gray-500">Product Detail</p>

        <h1 className="text-4xl font-bold max-w-4xl">
          {product.product_title}
        </h1>

        <p className="text-gray-500 mt-2">
          {product.variant_title || "Default"}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card
          title="Revenue"
          value={`€${revenue.toLocaleString("nl-NL")}`}
        />

        <Card
          title="Profit"
          value={`€${profit.toLocaleString("nl-NL")}`}
        />

        <Card
          title="Product Cost"
          value={`€${totalCost.toLocaleString("nl-NL")}`}
        />

        <Card title="Margin" value={`${margin}%`} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Panel title="Performance">
          <Row label="Units sold" value={String(product.sold)} />

          <Row
            label="Revenue"
            value={`€${revenue.toLocaleString("nl-NL")}`}
          />

          <Row
            label="Product cost"
            value={`€${totalCost.toLocaleString("nl-NL")}`}
          />

          <Row
            label="Profit"
            value={`€${profit.toLocaleString("nl-NL")}`}
          />

          <Row label="Margin" value={`${margin}%`} />
        </Panel>

        <Panel title="Google Ads Recommendation">
          {margin >= 50 ? (
            <p className="text-emerald-500">
              ✅ Strong margin product. Good candidate
              to scale with Google Ads.
            </p>
          ) : margin >= 25 ? (
            <p className="text-yellow-400">
              ⚠️ Decent margin. Monitor Google Ads spend
              carefully before scaling.
            </p>
          ) : (
            <p className="text-red-400">
              ❌ Low margin. Improve pricing or reduce
              product cost before scaling with Google Ads.
            </p>
          )}
        </Panel>
      </div>
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
    <div className="bg-white p-6 rounded-2xl">
      <p className="text-gray-500">{title}</p>

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
    <div className="bg-white p-6 rounded-2xl">
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
      <span className="text-gray-500">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}