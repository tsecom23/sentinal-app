"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, PackageX, Skull, Trash2 } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

const STORES = [
  { key: "ceofo", name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

type DeadProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  created_at: string;
  days_online: number;
  total_sold: number;
  image_url: string;
};

export default function DeadStockPage() {
  const [storeId, setStoreId] = useState("ceofo");
  const [products, setProducts] = useState<DeadProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archived, setArchived] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const res = await fetch(`${API}/api/products/dead?store_id=${storeId}`, { cache: "no-store" });
    const data = await res.json();
    setProducts((data.products || []).filter((p: DeadProduct) => !archived.has(p.id)));
    setLoading(false);
  }

  async function archive(product: DeadProduct) {
    setArchiving(product.id);
    await fetch(`${API}/api/products/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: product.id, store_id: storeId }),
    });
    setArchived(prev => new Set([...prev, product.id]));
    setProducts(prev => prev.filter(p => p.id !== product.id));
    setArchiving(null);
  }

  useEffect(() => { load(); }, [storeId]);

  const totalDaysWasted = products.reduce((s, p) => s + p.days_online, 0);

  return (
    <div className="min-h-screen bg-[#07070b] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="h-9 w-9 rounded-xl bg-[#111118] border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
            <ChevronLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Skull size={20} className="text-red-400" /> Dead Stock
            </h1>
            <p className="text-sm text-zinc-500">Producten 90+ dagen online zonder één verkoop</p>
          </div>
          <div className="ml-auto">
            <select
              value={storeId}
              onChange={e => { setStoreId(e.target.value); setArchived(new Set()); }}
              className="bg-[#111118] border border-white/8 rounded-xl px-3 py-2 text-sm text-white"
            >
              {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Dead Stock Producten</p>
            <p className="text-2xl font-black text-red-400">{products.length}</p>
            <p className="text-xs text-zinc-600 mt-1">Geen enkele verkoop ooit</p>
          </div>
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Gemiddeld online</p>
            <p className="text-2xl font-black text-amber-400">
              {products.length > 0 ? Math.round(products.reduce((s, p) => s + p.days_online, 0) / products.length) : 0} dagen
            </p>
            <p className="text-xs text-zinc-600 mt-1">Per product</p>
          </div>
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Gearchiveerd</p>
            <p className="text-2xl font-black text-emerald-400">{archived.size}</p>
            <p className="text-xs text-zinc-600 mt-1">In deze sessie</p>
          </div>
        </div>

        {/* Product list */}
        <div className="rounded-3xl bg-[#111118] border border-white/8 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/4 animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="p-16 flex flex-col items-center text-zinc-700">
              <PackageX size={36} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">Geen dead stock gevonden</p>
              <p className="text-xs text-zinc-700 mt-1">Alle producten 90+ dagen oud hebben minstens één verkoop</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Product", "Leverancier", "Online sinds", "Dagen online", "Actie"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/2 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-8 w-8 rounded-lg object-cover bg-white/5 shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-white/5 shrink-0 flex items-center justify-center">
                            <PackageX size={12} className="text-zinc-700" />
                          </div>
                        )}
                        <p className="font-medium truncate max-w-[240px]">{p.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-500">{p.vendor || "—"}</td>
                    <td className="px-5 py-3 text-xs text-zinc-500">{p.created_at.slice(0, 10)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold ${p.days_online >= 180 ? "text-red-400" : p.days_online >= 120 ? "text-amber-400" : "text-zinc-400"}`}>
                        {p.days_online}d
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => archive(p)}
                        disabled={archiving === p.id}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-red-600/15 text-red-400 hover:bg-red-600/25 transition font-semibold disabled:opacity-50"
                      >
                        <Trash2 size={11} />
                        {archiving === p.id ? "..." : "Kill"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {products.length > 0 && (
          <p className="text-[11px] text-zinc-700 mt-4 text-center">
            "Kill" archiveert het product in de database — verwijder het ook in Shopify Admin voor maximale opruiming.
          </p>
        )}
      </div>
    </div>
  );
}
