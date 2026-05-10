"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Check, ChevronLeft, Search, TrendingUp, X } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

type Product = {
  product_title: string;
  total_sold: number;
  total_revenue: number;
  cost: number;
  updated_at: string | null;
};

const STORES = [
  { key: "ceofo", name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

export default function ProductInsightsPage() {
  const [storeId, setStoreId] = useState("martaline");
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [editingCosts, setEditingCosts] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"revenue" | "margin" | "sold">("revenue");
  // suppress unused ref warning
  const _ref = useRef(null);
  void _ref;

  async function load() {
    setLoading(true);
    const res = await fetch(`${API}/api/product-costs?store_id=${storeId}`, { cache: "no-store" });
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [storeId]);

  useEffect(() => {
    let list = [...products];
    if (search) list = list.filter(p => p.product_title.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      if (sortBy === "revenue") return b.total_revenue - a.total_revenue;
      if (sortBy === "sold") return b.total_sold - a.total_sold;
      const costA = editingCosts[a.product_title] !== undefined ? parseFloat(editingCosts[a.product_title].replace(",", ".")) || 0 : a.cost;
      const costB = editingCosts[b.product_title] !== undefined ? parseFloat(editingCosts[b.product_title].replace(",", ".")) || 0 : b.cost;
      const mA = a.total_revenue > 0 && costA > 0 ? ((a.total_revenue - costA * a.total_sold) / a.total_revenue) * 100 : 999;
      const mB = b.total_revenue > 0 && costB > 0 ? ((b.total_revenue - costB * b.total_sold) / b.total_revenue) * 100 : 999;
      return mA - mB;
    });
    setFiltered(list);
  }, [products, search, sortBy, editingCosts]);

  function setCostInput(title: string, val: string) {
    setEditingCosts(prev => ({ ...prev, [title]: val }));
  }

  async function saveCost(product_title: string) {
    const raw = editingCosts[product_title];
    if (raw === undefined) return;
    const cost = parseFloat(raw.replace(",", ".")) || 0;
    setSaving(product_title);
    await fetch(`${API}/api/product-costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: storeId, product_title, cost }),
    });
    setProducts(prev => prev.map(p => p.product_title === product_title ? { ...p, cost, updated_at: new Date().toISOString() } : p));
    setEditingCosts(prev => { const n = { ...prev }; delete n[product_title]; return n; });
    setSaving(null);
    setSaved(product_title);
    setTimeout(() => setSaved(null), 2000);
  }

  async function saveAll() {
    const changed = Object.entries(editingCosts).filter(([, v]) => v !== "");
    if (changed.length === 0) return;
    setBulkSaving(true);
    const items = changed.map(([product_title, raw]) => ({
      store_id: storeId,
      product_title,
      cost: parseFloat(raw.replace(",", ".")) || 0,
    }));
    await fetch(`${API}/api/product-costs/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    await load();
    setEditingCosts({});
    setBulkSaving(false);
  }

  const totalRevenue = filtered.reduce((s, p) => s + p.total_revenue, 0);
  const totalCost = filtered.reduce((s, p) => s + p.cost * p.total_sold, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 && totalCost > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const pendingChanges = Object.keys(editingCosts).length;

  return (
    <div className="min-h-screen bg-[#07070b] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="h-9 w-9 rounded-xl bg-[#111118] border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
            <ChevronLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-black">Product Insights</h1>
            <p className="text-sm text-zinc-500">Vul inkooprijs in — marge & winst updaten automatisch</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <select
              value={storeId}
              onChange={e => { setStoreId(e.target.value); setEditingCosts({}); }}
              className="bg-[#111118] border border-white/8 rounded-xl px-3 py-2 text-sm text-white"
            >
              {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            {pendingChanges > 0 && (
              <button onClick={saveAll} disabled={bulkSaving} className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold flex items-center gap-2 transition">
                {bulkSaving ? "Opslaan..." : `Sla alles op (${pendingChanges})`}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {[
            { label: "Totale omzet", value: `€${totalRevenue.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` },
            { label: "Totale inkoopkosten", value: totalCost > 0 ? `€${totalCost.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` : "—", dim: totalCost === 0 },
            { label: "Netto winst", value: totalCost > 0 ? `€${totalProfit.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` : "—", color: totalProfit > 0 ? "text-emerald-400" : totalProfit < 0 ? "text-red-400" : "", dim: totalCost === 0 },
            { label: "Gem. marge", value: avgMargin > 0 ? `${avgMargin.toFixed(1)}%` : "—", dim: totalCost === 0 },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-[#111118] border border-white/8 p-4">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">{s.label}</p>
              <p className={`text-xl font-black ${s.color ?? ""} ${s.dim ? "opacity-30" : ""}`}>{s.value}</p>
              {s.dim && <p className="text-[10px] text-zinc-700 mt-1">Vul inkooprijs in</p>}
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek product..."
              className="w-full bg-[#111118] border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-indigo-500/50"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"><X size={13} /></button>}
          </div>
          <div className="flex gap-1 bg-[#111118] border border-white/8 rounded-xl p-1">
            {([["revenue", "Omzet"], ["sold", "Verkopen"], ["margin", "Laagste marge"]] as const).map(([s, l]) => (
              <button key={s} onClick={() => setSortBy(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${sortBy === s ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <p className="text-xs text-zinc-600">{filtered.length} producten</p>
        </div>

        {/* Table */}
        <div className="rounded-3xl bg-[#111118] border border-white/8 overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_90px_110px_100px_140px_44px] border-b border-white/5">
            {["Product", "Verkopen", "Omzet", "Inkoop/stuk", "Tot. inkoop", "Marge & winst", ""].map(h => (
              <div key={h} className="px-4 py-3 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{h}</div>
            ))}
          </div>

          {loading ? (
            <div className="p-8 space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-zinc-700">
              <Box size={28} className="mb-2 opacity-40" />
              <p className="text-sm">{search ? "Geen producten gevonden" : "Nog geen verkopen"}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map(p => {
                const inputVal = editingCosts[p.product_title];
                const currentCost = inputVal !== undefined
                  ? (parseFloat(inputVal.replace(",", ".")) || 0)
                  : p.cost;
                const totalCostItem = currentCost * p.total_sold;
                const profit = p.total_revenue - totalCostItem;
                const margin = p.total_revenue > 0 && currentCost > 0 ? (profit / p.total_revenue) * 100 : null;
                const isEditing = inputVal !== undefined;
                const isSaved = saved === p.product_title;
                const isSaving = saving === p.product_title;
                const marginColor = margin === null ? "" : margin >= 60 ? "text-emerald-400" : margin >= 40 ? "text-yellow-400" : margin > 0 ? "text-orange-400" : "text-red-400";

                return (
                  <div key={p.product_title} className={`grid grid-cols-[1fr_70px_90px_110px_100px_140px_44px] items-center hover:bg-white/2 transition ${isEditing ? "bg-indigo-600/4" : ""}`}>
                    <div className="px-4 py-3 min-w-0">
                      <p className="text-sm font-medium truncate">{p.product_title}</p>
                      {p.cost > 0 && !isEditing && <p className="text-[10px] text-zinc-600 mt-0.5">inkoop €{p.cost.toFixed(2)}</p>}
                    </div>
                    <div className="px-4 py-3 text-sm text-zinc-400">{p.total_sold}x</div>
                    <div className="px-4 py-3 text-sm font-semibold">€{p.total_revenue.toFixed(2)}</div>

                    <div className="px-3 py-3">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-600">€</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={inputVal ?? (p.cost > 0 ? p.cost.toFixed(2) : "")}
                          onChange={e => setCostInput(p.product_title, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveCost(p.product_title); }}
                          placeholder="0.00"
                          className="w-full bg-white/6 border border-white/8 rounded-lg pl-6 pr-2 py-1.5 text-xs text-white placeholder-zinc-700 outline-none focus:border-indigo-500/50 focus:bg-indigo-600/8"
                        />
                      </div>
                    </div>

                    <div className="px-4 py-3 text-sm text-zinc-500">
                      {currentCost > 0 ? `€${totalCostItem.toFixed(2)}` : <span className="text-zinc-700">—</span>}
                    </div>

                    <div className="px-4 py-3">
                      {margin !== null ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <TrendingUp size={11} className={marginColor} />
                            <span className={`text-sm font-bold ${marginColor}`}>{margin.toFixed(1)}%</span>
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-0.5">€{profit.toFixed(2)} winst</p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-700">Vul inkoop in →</span>
                      )}
                    </div>

                    <div className="px-2 py-3 flex justify-center">
                      {isSaved ? (
                        <div className="w-7 h-7 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                          <Check size={12} className="text-emerald-400" />
                        </div>
                      ) : isEditing ? (
                        <button onClick={() => saveCost(p.product_title)} disabled={isSaving} className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition">
                          {isSaving ? <span className="text-[9px]">...</span> : <Check size={12} />}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-[11px] text-zinc-700 mt-4 text-center">Druk op Enter of ✓ om per product op te slaan · "Sla alles op" voor bulk · Marge update live</p>
      </div>
    </div>
  );
}
