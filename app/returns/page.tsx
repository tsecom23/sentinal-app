"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, ChevronLeft, Plus, RotateCcw, ShieldAlert, X } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

type Return = {
  id: string; order_id: string; store_id: string;
  product_title: string; variant_title: string;
  reason: string; amount: number; status: string; created_at: string;
};
type Dispute = {
  id: string; order_id: string; store_id: string;
  customer_email: string; amount: number; reason: string;
  status: string; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  approved: "bg-blue-500/15 text-blue-400",
  refunded: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-red-500/15 text-red-400",
  open: "bg-amber-500/15 text-amber-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  won: "bg-emerald-500/15 text-emerald-400",
  lost: "bg-red-500/15 text-red-400",
};

export default function ReturnsPage() {
  const [storeId] = useState("ceofo");
  const [tab, setTab] = useState<"returns" | "disputes">("returns");
  const [returns, setReturns] = useState<Return[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [stats, setStats] = useState<{ total: number; count: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    const [r, d] = await Promise.all([
      fetch(`${API}/api/returns?store_id=${storeId}`, { cache: "no-store" }).then(x => x.json()),
      fetch(`${API}/api/disputes?store_id=${storeId}`, { cache: "no-store" }).then(x => x.json()),
    ]);
    setReturns(r.returns || []);
    setStats(r.stats);
    setDisputes(d.disputes || []);
    setLoading(false);
  }

  async function updateReturn(id: string, status: string) {
    await fetch(`${API}/api/returns/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function updateDispute(id: string, status: string) {
    await fetch(`${API}/api/disputes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#07070b] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="h-9 w-9 rounded-xl bg-[#111118] border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
            <ChevronLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-black">Returns & Disputes</h1>
            <p className="text-sm text-zinc-500">Manage refunds, returns and customer disputes</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="ml-auto h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold flex items-center gap-2 transition">
            <Plus size={14} /> Add Return
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Total Returns</p>
            <p className="text-2xl font-black">{stats?.count ?? 0}</p>
            <p className="text-xs text-zinc-600 mt-1">€{(stats?.total ?? 0).toFixed(2)} returned</p>
          </div>
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Pending</p>
            <p className="text-2xl font-black text-amber-400">{stats?.pending ?? 0}</p>
            <p className="text-xs text-zinc-600 mt-1">Needs action</p>
          </div>
          <div className="rounded-2xl bg-[#111118] border border-white/8 p-5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Open Disputes</p>
            <p className="text-2xl font-black text-red-400">{disputes.filter(d => d.status === "open").length}</p>
            <p className="text-xs text-zinc-600 mt-1">€{disputes.filter(d => d.status === "open").reduce((s, d) => s + d.amount, 0).toFixed(2)} at risk</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#111118] border border-white/8 p-1 rounded-2xl w-fit">
          {(["returns", "disputes"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-xl text-sm font-semibold transition capitalize ${
              tab === t ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-white"
            }`}>{t}</button>
          ))}
        </div>

        {/* Returns list */}
        {tab === "returns" && (
          <div className="rounded-3xl bg-[#111118] border border-white/8 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-zinc-600 text-sm">Loading...</div>
            ) : returns.length === 0 ? (
              <div className="p-12 flex flex-col items-center text-zinc-700">
                <CheckCircle size={32} className="mb-2 text-emerald-700 opacity-50" />
                <p className="text-sm">No returns yet</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Order", "Product", "Reason", "Amount", "Status", "Date", "Action"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {returns.map(r => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/2 transition">
                      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{r.order_id}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium truncate max-w-[180px]">{r.product_title}</p>
                        {r.variant_title && <p className="text-xs text-zinc-600">{r.variant_title}</p>}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs max-w-[120px] truncate">{r.reason || "—"}</td>
                      <td className="px-5 py-3 font-semibold">€{r.amount.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[r.status] || "bg-white/8 text-zinc-400"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-600">{r.created_at.slice(0, 10)}</td>
                      <td className="px-5 py-3">
                        {r.status === "pending" && (
                          <div className="flex gap-1">
                            <button onClick={() => updateReturn(r.id, "refunded")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition">Refund</button>
                            <button onClick={() => updateReturn(r.id, "rejected")} className="text-[10px] px-2 py-1 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Disputes list */}
        {tab === "disputes" && (
          <div className="rounded-3xl bg-[#111118] border border-white/8 overflow-hidden">
            {disputes.length === 0 ? (
              <div className="p-12 flex flex-col items-center text-zinc-700">
                <ShieldAlert size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No disputes</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Order", "Customer", "Reason", "Amount", "Status", "Date", "Action"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {disputes.map(d => (
                    <tr key={d.id} className="border-b border-white/5 hover:bg-white/2 transition">
                      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{d.order_id}</td>
                      <td className="px-5 py-3 text-xs">{d.customer_email || "—"}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">{d.reason || "—"}</td>
                      <td className="px-5 py-3 font-semibold text-red-400">€{d.amount.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[d.status] || "bg-white/8 text-zinc-400"}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-600">{d.created_at.slice(0, 10)}</td>
                      <td className="px-5 py-3">
                        {d.status === "open" && (
                          <div className="flex gap-1">
                            <button onClick={() => updateDispute(d.id, "won")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition">Won</button>
                            <button onClick={() => updateDispute(d.id, "lost")} className="text-[10px] px-2 py-1 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition">Lost</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Add Return Modal */}
      {showAdd && <AddReturnModal storeId={storeId} onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddReturnModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [form, setForm] = useState({ order_id: "", product_title: "", variant_title: "", reason: "", amount: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`${API}/api/returns`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount || "0"), store_id: storeId }),
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0d0d13] border border-white/10 rounded-3xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-lg flex items-center gap-2"><RotateCcw size={18} className="text-indigo-400" /> New Return</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Order ID", key: "order_id", placeholder: "mrt-3992" },
            { label: "Product", key: "product_title", placeholder: "Product name" },
            { label: "Variant", key: "variant_title", placeholder: "Noir / M" },
            { label: "Reason", key: "reason", placeholder: "Wrong size, damaged, etc." },
            { label: "Amount (€)", key: "amount", placeholder: "34.95" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 block">{f.label}</label>
              <input
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-[#111118] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-indigo-500/50"
              />
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="mt-5 w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm transition">
          {saving ? "Saving..." : "Add Return"}
        </button>
      </div>
    </div>
  );
}
