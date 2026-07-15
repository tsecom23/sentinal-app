"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Package, AlertTriangle, Plus, X, Edit2 } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

type StockItem = {
  id: number;
  product_title: string;
  purchased_qty: number;
  low_stock_alert: number;
  notes: string | null;
  linked_titles: string[];
  units_sold: number;
  remaining: number;
};

export default function StockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch(`${API}/api/stock`, { cache: "no-store" }).then(x => x.json());
    setStock(r.stock ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalRemaining = stock.reduce((s, i) => s + i.remaining, 0);
  const totalSold = stock.reduce((s, i) => s + i.units_sold, 0);
  const lowStock = stock.filter(i => i.remaining <= i.low_stock_alert && i.remaining > 0);
  const outOfStock = stock.filter(i => i.remaining <= 0);

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900 p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="h-9 w-9 rounded-xl bg-gray-50 border border-black/8 flex items-center justify-center text-gray-500 hover:text-gray-900 transition">
            <ChevronLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-black">Voorraad</h1>
            <p className="text-sm text-gray-500">Airco's — Martaline + Melvoire gecombineerd</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="ml-auto h-9 px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-500 text-sm font-semibold flex items-center gap-2 transition">
            <Plus size={14} /> Product toevoegen
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          <div className="rounded-2xl bg-gray-50 border border-black/8 p-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Totaal resterend</p>
            <p className="text-2xl font-black">{totalRemaining}</p>
            <p className="text-xs text-gray-400 mt-1">units op voorraad</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-black/8 p-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Verkocht</p>
            <p className="text-2xl font-black text-blue-500">{totalSold}</p>
            <p className="text-xs text-gray-400 mt-1">totaal alle producten</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-black/8 p-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Bijna op</p>
            <p className="text-2xl font-black text-amber-400">{lowStock.length}</p>
            <p className="text-xs text-gray-400 mt-1">onder alert grens</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-black/8 p-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Uitverkocht</p>
            <p className="text-2xl font-black text-red-400">{outOfStock.length}</p>
            <p className="text-xs text-gray-400 mt-1">producten op 0</p>
          </div>
        </div>

        {/* Stock table */}
        <div className="rounded-3xl bg-gray-50 border border-black/8 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Laden...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  {["Product", "Ingekocht", "Verkocht", "Resterend", "Status", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.map(item => {
                  const pct = item.purchased_qty > 0 ? (item.remaining / item.purchased_qty) * 100 : 0;
                  const isLow = item.remaining <= item.low_stock_alert && item.remaining > 0;
                  const isEmpty = item.remaining <= 0;
                  return (
                    <tr key={item.id} className="border-b border-black/5 hover:bg-black/[0.02] transition">
                      <td className="px-5 py-4 max-w-[280px]">
                        <p className="font-semibold text-sm">{item.product_title}</p>
                        {item.linked_titles?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.linked_titles.map((t, i) => (
                              <p key={i} className="text-[11px] text-gray-400 leading-snug">– {t.length > 55 ? t.slice(0, 55) + "…" : t}</p>
                            ))}
                          </div>
                        )}
                        {item.notes && <p className="text-xs text-blue-400 mt-1">{item.notes}</p>}
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-500">{item.purchased_qty}</td>
                      <td className="px-5 py-4 font-semibold text-blue-500">{item.units_sold}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`text-xl font-black ${isEmpty ? "text-red-400" : isLow ? "text-amber-400" : "text-gray-900"}`}>
                            {item.remaining}
                          </span>
                          <div className="w-16 h-1.5 bg-black/8 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isEmpty ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {isEmpty ? (
                          <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-red-500/15 text-red-400">Uitverkocht</span>
                        ) : isLow ? (
                          <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-amber-500/15 text-amber-400 flex items-center gap-1 w-fit">
                            <AlertTriangle size={10} /> Bijna op
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-emerald-500/15 text-emerald-500">Op voorraad</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => setEditing(item)} className="text-gray-400 hover:text-gray-900 transition">
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white border border-black/10 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-lg">Adjust stock</h2>
              <button onClick={() => setEditing(null)}><X size={18} className="text-gray-400 hover:text-gray-900" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4 break-words">{editing.product_title}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 block">Purchased (total)</label>
                <input type="number" value={editing.purchased_qty}
                  onChange={e => setEditing(p => p ? { ...p, purchased_qty: parseInt(e.target.value) || 0 } : p)}
                  className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 block">Alert at (units)</label>
                <input type="number" value={editing.low_stock_alert}
                  onChange={e => setEditing(p => p ? { ...p, low_stock_alert: parseInt(e.target.value) || 0 } : p)}
                  className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 block">Note</label>
                <input type="text" value={editing.notes ?? ""}
                  onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)}
                  placeholder="E.g. batch 1, supplier X"
                  className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <button onClick={async () => {
              await fetch(`${API}/api/stock/${editing.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ purchased_qty: editing.purchased_qty, low_stock_alert: editing.low_stock_alert, notes: editing.notes }),
              });
              setEditing(null); load();
            }} className="mt-5 w-full h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-semibold text-sm transition">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && <AddStockModal onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddStockModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ product_title: "", purchased_qty: "", low_stock_alert: "5", notes: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`${API}/api/stock/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ ...form, purchased_qty: parseInt(form.purchased_qty) || 0, low_stock_alert: parseInt(form.low_stock_alert) || 5 }] }),
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white border border-black/10 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-lg flex items-center gap-2"><Package size={18} className="text-blue-400" /> New product</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Product title", key: "product_title", placeholder: "Exact same as in Shopify" },
            { label: "Purchased (units)", key: "purchased_qty", placeholder: "50" },
            { label: "Alert at (units)", key: "low_stock_alert", placeholder: "5" },
            { label: "Note", key: "notes", placeholder: "Optional" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 block">{f.label}</label>
              <input value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500/50" />
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="mt-5 w-full h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-semibold text-sm transition">
          {saving ? "Saving..." : "Add"}
        </button>
      </div>
    </div>
  );
}
