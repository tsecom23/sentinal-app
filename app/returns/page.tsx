"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, CheckCircle, ChevronLeft, Plus, RotateCcw,
  ShieldAlert, X, Upload, RefreshCw, TrendingUp, TrendingDown,
  Minus, AlertCircle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend
} from "recharts";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

const CATEGORY_COLORS: Record<string, string> = {
  "Maat / Pasvorm":              "#3b82f6",
  "Productkwaliteit":            "#ef4444",
  "Defect / Beschadigd":         "#f97316",
  "Verkeerd product ontvangen":  "#8b5cf6",
  "Kleurverschil":               "#eab308",
  "Niet ontvangen":              "#06b6d4",
  "Leveringsvertraging":         "#10b981",
  "Niet zoals verwacht":         "#f43f5e",
  "Klant bedacht":               "#6b7280",
  "Ongeautoriseerde transactie": "#dc2626",
  "Dubbele bestelling":          "#0ea5e9",
  "Verpakking beschadigd":       "#a78bfa",
  "Materiaalprobleem":           "#fb923c",
  "Comfortprobleem":             "#4ade80",
  "Chargeback":                  "#dc2626",
  "Anders":                      "#9ca3af",
  "Onbekend":                    "#d1d5db",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-400",
  refunded: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-red-500/15 text-red-400",
  open:     "bg-amber-500/15 text-amber-500",
  resolved: "bg-emerald-500/15 text-emerald-500",
  won:      "bg-emerald-500/15 text-emerald-500",
  lost:     "bg-red-500/15 text-red-400",
};

const ACTION_SUGGESTIONS: Record<string, string> = {
  "Maat / Pasvorm":              "Maattabel controleren, modelmaten toevoegen aan productpagina",
  "Productkwaliteit":            "Leverancier aanspreken, steekproefinspectie verhogen",
  "Defect / Beschadigd":         "Verpakking aanpassen, leveringsproces controleren",
  "Verkeerd product ontvangen":  "Fulfilmentproces & barcodes controleren",
  "Kleurverschil":               "Productfoto's & kleuromschrijving verbeteren",
  "Niet ontvangen":              "Tracking & vervoerder analyseren",
  "Leveringsvertraging":         "Levertijden op productpagina bijwerken",
  "Niet zoals verwacht":         "Advertentie & productpagina vergelijken met klantverwachting",
  "Klant bedacht":               "Retourproces vereenvoudigen, check prijsstrategie",
  "Ongeautoriseerde transactie": "Fraudefilters & betaalverificatie verbeteren",
  "Dubbele bestelling":          "Betaalbevestiging duidelijker maken",
  "Verpakking beschadigd":       "Verpakkingstest uitvoeren, stevigere verpakking",
  "Materiaalprobleem":           "Materiaalkeuze herzien, productbeschrijving aanpassen",
  "Comfortprobleem":             "Productbeschrijving & pasvorm-informatie verbeteren",
  "Chargeback":                  "Bewijsvoering verbeteren, betaalomschrijving verduidelijken",
};

type Analytics = {
  totals: {
    returns: number; refund_total: number; pending: number;
    disputes: number; dispute_open: number; dispute_at_risk: number;
    chargebacks: number; chargeback_amount: number;
    won: number; lost: number; win_rate: number | null;
  };
  product_stats: Array<{
    product_title: string; return_count: number; refund_total: number; top_category: string;
  }>;
  reason_breakdown: Array<{ category: string; count: number; total_amount: number }>;
  weekly_trends: Array<{ week: string; count: number; amount: number }>;
};

type ReturnRow = {
  id: string; order_id: string; product_title: string; variant_title: string;
  reason: string; amount: number; status: string; created_at: string;
  reason_category: string; event_type: string; source_platform: string; country: string;
};
type DisputeRow = {
  id: string; order_id: string; customer_email: string; reason: string;
  amount: number; status: string; created_at: string;
  reason_category: string; dispute_type: string; source_platform: string;
};

type Tab = "overview" | "products" | "reasons" | "events";

export default function ReturnsPage() {
  const { stores } = useStores();
  const [storeId, setStoreId] = useState("martaline");
  const [tab, setTab] = useState<Tab>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<ReturnRow | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<DisputeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, d] = await Promise.all([
        fetch(`${API}/api/returns/analytics?store_id=${storeId}&days=${days}`).then(x => x.json()),
        fetch(`${API}/api/returns?store_id=${storeId}`).then(x => x.json()),
        fetch(`${API}/api/disputes?store_id=${storeId}`).then(x => x.json()),
      ]);
      setAnalytics(a);
      setReturns(r.returns ?? []);
      setDisputes(d.disputes ?? []);
    } finally {
      setLoading(false);
    }
  }, [storeId, days]);

  useEffect(() => { load(); }, [load]);

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

  async function reclassify() {
    await fetch(`${API}/api/returns/reclassify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: storeId }),
    });
    load();
  }

  const t = analytics?.totals;
  const totalIssues = (t?.returns ?? 0) + (t?.disputes ?? 0) + (t?.chargebacks ?? 0);
  const totalFinancial = (t?.refund_total ?? 0) + (t?.chargeback_amount ?? 0);
  const topProduct = analytics?.product_stats?.[0];
  const topReason = analytics?.reason_breakdown?.[0];

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#f6f7f9]/90 backdrop-blur-md border-b border-black/5 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <a href="/" className="h-9 w-9 rounded-xl bg-white border border-black/8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition shrink-0">
            <ChevronLeft size={16} />
          </a>
          <div className="flex-1">
            <h1 className="text-lg font-black leading-none">Returns & Chargebacks</h1>
            <p className="text-xs text-gray-400 mt-0.5">Returns, refunds, disputes en chargebacks</p>
          </div>

          {/* Store selector */}
          <div className="flex gap-1 bg-white border border-black/8 rounded-xl p-1">
            {stores.map(s => (
              <button key={s.id} onClick={() => setStoreId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${storeId === s.id ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"}`}>
                {s.name}
              </button>
            ))}
          </div>

          {/* Period */}
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="h-9 px-3 rounded-xl bg-white border border-black/8 text-sm text-gray-700 font-medium outline-none">
            <option value={30}>30 dagen</option>
            <option value={60}>60 dagen</option>
            <option value={90}>90 dagen</option>
            <option value={180}>180 dagen</option>
          </select>

          <button onClick={load} className="h-9 w-9 rounded-xl bg-white border border-black/8 flex items-center justify-center text-gray-400 hover:text-gray-900 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowImport(true)} className="h-9 px-3 rounded-xl bg-white border border-black/8 text-sm font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1.5 transition">
            <Upload size={13} /> Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-blue-500 transition">
            <Plus size={13} /> Toevoegen
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto mt-4 flex gap-1">
          {(["overview", "products", "reasons", "events"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition capitalize ${tab === t ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700 bg-white/70"}`}>
              {t === "overview" ? "Overzicht" : t === "products" ? "Producten" : t === "reasons" ? "Redenen" : "Alle Events"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-5 gap-4">
              <KpiCard label="Returns / Refunds" value={t?.returns ?? 0} sub={`€${(t?.refund_total ?? 0).toFixed(0)} terugbetaald`} color="blue" />
              <KpiCard label="Open disputes" value={t?.dispute_open ?? 0} sub={`€${(t?.dispute_at_risk ?? 0).toFixed(0)} at risk`} color="amber" />
              <KpiCard label="Chargebacks" value={t?.chargebacks ?? 0} sub={`€${(t?.chargeback_amount ?? 0).toFixed(0)} verlies`} color="red" />
              <KpiCard
                label="Win rate disputes"
                value={t?.win_rate != null ? `${t.win_rate}%` : "—"}
                sub={`${t?.won ?? 0} won · ${t?.lost ?? 0} lost`}
                color={t?.win_rate != null && t.win_rate >= 50 ? "green" : "red"}
              />
              <KpiCard label="Totale financiële impact" value={`€${totalFinancial.toFixed(0)}`} sub={`${totalIssues} events totaal`} color="purple" />
            </div>

            {/* Alert cards */}
            {(topProduct || topReason) && (
              <div className="grid grid-cols-2 gap-4">
                {topProduct && (
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-5">
                    <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={11} /> Meeste problemen
                    </p>
                    <p className="font-bold text-sm text-gray-900 line-clamp-2">{topProduct.product_title}</p>
                    <p className="text-xs text-gray-500 mt-1">{topProduct.return_count}x · €{topProduct.refund_total.toFixed(0)} · {topProduct.top_category}</p>
                  </div>
                )}
                {topReason && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
                    <p className="text-[10px] text-amber-500 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                      <AlertCircle size={11} /> Meest voorkomende reden
                    </p>
                    <p className="font-bold text-sm text-gray-900">{topReason.category}</p>
                    <p className="text-xs text-gray-500 mt-1">{topReason.count}x · €{topReason.total_amount.toFixed(0)} · {ACTION_SUGGESTIONS[topReason.category] ?? ""}</p>
                  </div>
                )}
              </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Reason distribution */}
              <div className="rounded-2xl bg-white border border-black/8 p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Verdeling redenen</p>
                {(analytics?.reason_breakdown?.length ?? 0) === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-300">Geen data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={analytics?.reason_breakdown ?? []} layout="vertical" margin={{ left: 0, right: 32 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={160} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
                        cursor={{ fill: "rgba(0,0,0,0.03)" }}
                        formatter={(v: number, _: string, p: any) => [`${v}x · €${p.payload.total_amount?.toFixed(0)}`, ""]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {(analytics?.reason_breakdown ?? []).map((r, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[r.category] ?? "#9ca3af"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Weekly trend */}
              <div className="rounded-2xl bg-white border border-black/8 p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Trend per week</p>
                {(analytics?.weekly_trends?.length ?? 0) < 2 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-300">Nog niet genoeg data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={analytics?.weekly_trends ?? []} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number, name: string) => [name === "count" ? `${v} events` : `€${v.toFixed(0)}`, name === "count" ? "Aantal" : "Bedrag"]}
                      />
                      <Legend formatter={(v) => v === "count" ? "Aantal events" : "Bedrag (€)"} />
                      <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Pending actions */}
            {(t?.pending ?? 0) > 0 && (
              <div className="rounded-2xl bg-white border border-black/8 p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Wachten op actie ({t?.pending})</p>
                <div className="space-y-2">
                  {returns.filter(r => r.status === "pending").slice(0, 5).map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.product_title}</p>
                        <p className="text-xs text-gray-500">{r.order_id} · {r.reason || "—"}</p>
                      </div>
                      <p className="text-sm font-semibold shrink-0">€{r.amount.toFixed(2)}</p>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => updateReturn(r.id, "refunded")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 transition font-semibold">Refund</button>
                        <button onClick={() => updateReturn(r.id, "rejected")} className="text-[10px] px-2 py-1 rounded-lg bg-red-600/15 text-red-500 hover:bg-red-600/25 transition font-semibold">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCTS TAB ─────────────────────────────────────────────────── */}
        {tab === "products" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-black/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Product ranking — meeste problemen bovenaan</p>
                <p className="text-xs text-gray-400">{analytics?.product_stats?.length ?? 0} producten met events</p>
              </div>
              {(analytics?.product_stats?.length ?? 0) === 0 ? (
                <div className="p-12 flex flex-col items-center text-gray-400">
                  <CheckCircle size={28} className="mb-2 text-emerald-400 opacity-50" />
                  <p className="text-sm">Geen returns of refunds in deze periode</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">#</th>
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Product</th>
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Events</th>
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Financieel</th>
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Top reden</th>
                      <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Aanbeveling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.product_stats ?? []).map((p, i) => {
                      const severity = p.return_count >= 10 ? "red" : p.return_count >= 5 ? "amber" : "gray";
                      return (
                        <tr key={p.product_title} className="border-b border-black/5 hover:bg-black/[0.02] transition">
                          <td className="px-5 py-3">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold
                              ${severity === "red" ? "bg-red-100 text-red-600" : severity === "amber" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-5 py-3 max-w-[220px]">
                            <p className="font-medium text-sm line-clamp-2">{p.product_title}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-lg font-black ${severity === "red" ? "text-red-500" : severity === "amber" ? "text-amber-500" : "text-gray-700"}`}>
                              {p.return_count}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-semibold text-red-500">€{p.refund_total.toFixed(0)}</td>
                          <td className="px-5 py-3">
                            {p.top_category && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-black/5"
                                style={{ color: CATEGORY_COLORS[p.top_category] ?? "#6b7280" }}>
                                {p.top_category}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 max-w-[200px]">
                            {ACTION_SUGGESTIONS[p.top_category] ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bar chart */}
            {(analytics?.product_stats?.length ?? 0) > 0 && (
              <div className="rounded-2xl bg-white border border-black/8 p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Events per product (top 10)</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(analytics?.product_stats ?? []).slice(0, 10).map(p => ({
                    name: p.product_title.length > 35 ? p.product_title.slice(0, 35) + "…" : p.product_title,
                    count: p.return_count,
                    amount: p.refund_total,
                  }))} layout="vertical" margin={{ left: 0, right: 32 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={200} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                      formatter={(v: number, name: string) => [name === "count" ? `${v} events` : `€${v.toFixed(0)}`, name === "count" ? "Aantal" : "Bedrag"]}
                    />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── REASONS TAB ──────────────────────────────────────────────────── */}
        {tab === "reasons" && (
          <div className="space-y-4">
            {/* Reason table */}
            <div className="rounded-2xl bg-white border border-black/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Redenen — gesorteerd op aantal</p>
              </div>
              {(analytics?.reason_breakdown?.length ?? 0) === 0 ? (
                <div className="p-12 text-center text-sm text-gray-400">Geen data</div>
              ) : (() => {
                const total = analytics!.reason_breakdown.reduce((s, r) => s + r.count, 0);
                let cumulative = 0;
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/5">
                        {["Categorie", "Aantal", "% van totaal", "Cumulatief", "Financieel", "Actie"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics!.reason_breakdown.map(r => {
                        const pct = total > 0 ? (r.count / total * 100) : 0;
                        cumulative += pct;
                        return (
                          <tr key={r.category} className="border-b border-black/5 hover:bg-black/[0.02] transition">
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[r.category] ?? "#9ca3af" }} />
                                <span className="font-medium">{r.category}</span>
                              </span>
                            </td>
                            <td className="px-5 py-3 font-bold text-gray-800">{r.count}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 rounded-full bg-gray-100 w-20">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CATEGORY_COLORS[r.category] ?? "#9ca3af" }} />
                                </div>
                                <span className="text-xs text-gray-500">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">
                              <span className={cumulative <= 80 ? "font-semibold text-orange-500" : "text-gray-400"}>
                                {cumulative.toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-5 py-3 font-semibold text-red-500">€{r.total_amount.toFixed(0)}</td>
                            <td className="px-5 py-3 text-xs text-gray-500 max-w-[220px]">{ACTION_SUGGESTIONS[r.category] ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700">
              <strong>Pareto:</strong> oranje percentages = de categorieën die samen 80% van de problemen veroorzaken. Focus daar eerst op.
            </div>

            {/* Category bar chart */}
            {(analytics?.reason_breakdown?.length ?? 0) > 0 && (
              <div className="rounded-2xl bg-white border border-black/8 p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-4">Financiële impact per categorie</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics?.reason_breakdown ?? []} layout="vertical" margin={{ left: 0, right: 32 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                      tickFormatter={v => `€${v}`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={160} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                      formatter={(v: number) => [`€${v.toFixed(0)}`, "Financieel"]}
                    />
                    <Bar dataKey="total_amount" radius={[0, 4, 4, 0]}>
                      {(analytics?.reason_breakdown ?? []).map((r, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[r.category] ?? "#9ca3af"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── EVENTS TAB ───────────────────────────────────────────────────── */}
        {tab === "events" && (
          <div className="space-y-4">
            {/* Returns */}
            <div className="rounded-2xl bg-white border border-black/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <RotateCcw size={11} /> Returns & Refunds ({returns.length})
                </p>
              </div>
              {returns.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">Geen returns</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5">
                      {["Order", "Product", "Reden", "Categorie", "Bedrag", "Status", "Datum", "Actie"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map(r => (
                      <tr key={r.id} onClick={() => setSelectedReturn(r)}
                        className="border-b border-black/5 hover:bg-black/[0.02] transition cursor-pointer">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.order_id || "—"}</td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <p className="font-medium text-xs line-clamp-2">{r.product_title}</p>
                          {r.variant_title && <p className="text-[10px] text-gray-400">{r.variant_title}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] line-clamp-2">{r.reason || "—"}</td>
                        <td className="px-4 py-3">
                          {r.reason_category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-black/5"
                              style={{ color: CATEGORY_COLORS[r.reason_category] ?? "#6b7280" }}>
                              {r.reason_category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-sm">€{r.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[r.status] ?? "bg-black/5 text-gray-500"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.created_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {r.status === "pending" && (
                            <div className="flex gap-1">
                              <button onClick={() => updateReturn(r.id, "refunded")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 transition font-semibold">✓</button>
                              <button onClick={() => updateReturn(r.id, "rejected")} className="text-[10px] px-2 py-1 rounded-lg bg-red-600/15 text-red-500 hover:bg-red-600/25 transition font-semibold">✕</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Disputes */}
            <div className="rounded-2xl bg-white border border-black/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <ShieldAlert size={11} /> Disputes & Chargebacks ({disputes.length})
                </p>
              </div>
              {disputes.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">Geen disputes</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5">
                      {["Order", "Klant", "Reden", "Categorie", "Type", "Bedrag", "Status", "Datum", "Actie"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map(d => (
                      <tr key={d.id} onClick={() => setSelectedDispute(d)}
                        className="border-b border-black/5 hover:bg-black/[0.02] transition cursor-pointer">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{d.order_id || "—"}</td>
                        <td className="px-4 py-3 text-xs">{d.customer_email || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] line-clamp-2">{d.reason || "—"}</td>
                        <td className="px-4 py-3">
                          {d.reason_category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-black/5"
                              style={{ color: CATEGORY_COLORS[d.reason_category] ?? "#6b7280" }}>
                              {d.reason_category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${d.dispute_type === "chargeback" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
                            {d.dispute_type ?? "dispute"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-red-500">€{d.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[d.status] ?? "bg-black/5 text-gray-500"}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{d.created_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {d.status === "open" && (
                            <div className="flex gap-1">
                              <button onClick={() => updateDispute(d.id, "won")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 transition font-semibold">Won</button>
                              <button onClick={() => updateDispute(d.id, "lost")} className="text-[10px] px-2 py-1 rounded-lg bg-red-600/15 text-red-500 hover:bg-red-600/25 transition font-semibond">Lost</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Reclassify button */}
            <div className="flex justify-end">
              <button onClick={reclassify} className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1.5">
                <RefreshCw size={11} /> Redenen herclassificeren
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {showAdd && <AddEventModal storeId={storeId} onClose={() => { setShowAdd(false); load(); }} />}
      {showImport && <CsvImportModal storeId={storeId} onClose={() => { setShowImport(false); load(); }} />}

      {selectedReturn && (
        <DetailModal title="Return detail" icon={<RotateCcw size={16} className="text-blue-500" />} onClose={() => setSelectedReturn(null)}>
          <Fields items={[
            { label: "Order ID", value: selectedReturn.order_id },
            { label: "Product", value: selectedReturn.product_title },
            { label: "Variant", value: selectedReturn.variant_title || "—" },
            { label: "Reden", value: selectedReturn.reason || "—" },
            { label: "Categorie", value: selectedReturn.reason_category || "—" },
            { label: "Bedrag", value: `€${selectedReturn.amount.toFixed(2)}` },
            { label: "Status", value: selectedReturn.status },
            { label: "Type", value: selectedReturn.event_type || "return" },
            { label: "Platform", value: selectedReturn.source_platform || "—" },
            { label: "Aanbeveling", value: ACTION_SUGGESTIONS[selectedReturn.reason_category] ?? "—" },
            { label: "Datum", value: selectedReturn.created_at?.slice(0, 10) },
          ]} />
          {selectedReturn.status === "pending" && (
            <div className="flex gap-2 mt-5">
              <button onClick={() => { updateReturn(selectedReturn.id, "refunded"); setSelectedReturn(null); }}
                className="flex-1 h-10 rounded-xl bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 font-semibold text-sm transition">Refund</button>
              <button onClick={() => { updateReturn(selectedReturn.id, "rejected"); setSelectedReturn(null); }}
                className="flex-1 h-10 rounded-xl bg-red-600/15 text-red-500 hover:bg-red-600/25 font-semibold text-sm transition">Reject</button>
            </div>
          )}
        </DetailModal>
      )}

      {selectedDispute && (
        <DetailModal title="Dispute detail" icon={<ShieldAlert size={16} className="text-red-500" />} onClose={() => setSelectedDispute(null)}>
          <Fields items={[
            { label: "Order ID", value: selectedDispute.order_id },
            { label: "Klant", value: selectedDispute.customer_email || "—" },
            { label: "Reden", value: selectedDispute.reason || "—" },
            { label: "Categorie", value: selectedDispute.reason_category || "—" },
            { label: "Type", value: selectedDispute.dispute_type || "dispute" },
            { label: "Bedrag", value: `€${selectedDispute.amount.toFixed(2)}` },
            { label: "Status", value: selectedDispute.status },
            { label: "Platform", value: selectedDispute.source_platform || "—" },
            { label: "Aanbeveling", value: ACTION_SUGGESTIONS[selectedDispute.reason_category] ?? "—" },
            { label: "Datum", value: selectedDispute.created_at?.slice(0, 10) },
          ]} />
          {selectedDispute.status === "open" && (
            <div className="flex gap-2 mt-5">
              <button onClick={() => { updateDispute(selectedDispute.id, "won"); setSelectedDispute(null); }}
                className="flex-1 h-10 rounded-xl bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 font-semibold text-sm transition">Won</button>
              <button onClick={() => { updateDispute(selectedDispute.id, "lost"); setSelectedDispute(null); }}
                className="flex-1 h-10 rounded-xl bg-red-600/15 text-red-500 hover:bg-red-600/25 font-semibold text-sm transition">Lost</button>
            </div>
          )}
        </DetailModal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "text-blue-600", amber: "text-amber-500", red: "text-red-500",
    green: "text-emerald-500", purple: "text-purple-600", gray: "text-gray-700",
  };
  return (
    <div className="rounded-2xl bg-white border border-black/8 p-5">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">{label}</p>
      <p className={`text-2xl font-black ${colors[color] ?? "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function DetailModal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white border border-black/10 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-lg flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fields({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="space-y-3">
      {items.map(f => (
        <div key={f.label}>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">{f.label}</p>
          <p className="text-sm text-gray-900 break-words">{f.value}</p>
        </div>
      ))}
    </div>
  );
}

function AddEventModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [type, setType] = useState<"return" | "dispute" | "chargeback">("return");
  const [form, setForm] = useState({ order_id: "", product_title: "", variant_title: "", customer_email: "", reason: "", amount: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const amt = parseFloat(form.amount || "0");
    if (type === "return") {
      await fetch(`${API}/api/returns`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: amt, store_id: storeId, event_type: "return" }),
      });
    } else {
      await fetch(`${API}/api/disputes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: amt, store_id: storeId, dispute_type: type }),
      });
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-black/10 rounded-3xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-lg">Nieuw event</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
        </div>
        <div className="flex gap-1 bg-black/5 rounded-xl p-1 mb-4">
          {(["return", "dispute", "chargeback"] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition capitalize ${type === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {[
            { key: "order_id", label: "Order ID", show: true },
            { key: "product_title", label: "Product", show: type === "return" },
            { key: "variant_title", label: "Variant", show: type === "return" },
            { key: "customer_email", label: "E-mail klant", show: type !== "return" },
            { key: "reason", label: "Reden", show: true },
            { key: "amount", label: "Bedrag (€)", show: true },
          ].filter(f => f.show).map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 block">{f.label}</label>
              <input
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500/50"
              />
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving}
          className="mt-5 w-full h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-semibold text-sm transition">
          {saving ? "Opslaan…" : "Toevoegen"}
        </button>
      </div>
    </div>
  );
}

function CsvImportModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function doImport() {
    setSaving(true);
    setResult(null);
    try {
      const lines = csv.trim().split("\n").filter(Boolean);
      const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const obj: Record<string, string> = {};
        header.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return {
          order_id: obj["order_id"] ?? obj["order"] ?? "",
          product_title: obj["product_title"] ?? obj["product"] ?? "",
          customer_email: obj["customer_email"] ?? obj["email"] ?? "",
          reason: obj["reason"] ?? "",
          amount: parseFloat(obj["amount"] ?? "0") || 0,
          event_type: obj["event_type"] ?? obj["type"] ?? "return",
          date: obj["date"] ?? "",
          country: obj["country"] ?? "",
          source_platform: obj["source_platform"] ?? obj["platform"] ?? "csv",
          status: obj["status"] ?? "",
        };
      });
      const res = await fetch(`${API}/api/returns/import-csv`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, rows }),
      });
      const data = await res.json() as { ok: boolean; imported: number };
      setResult(`✅ ${data.imported} records geïmporteerd`);
    } catch (e) {
      setResult("❌ Fout bij importeren");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-black/10 rounded-3xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg flex items-center gap-2"><Upload size={16} className="text-blue-500" /> CSV Import</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Kolommen: <code className="bg-gray-100 px-1 rounded">order_id, product_title, customer_email, reason, amount, event_type, date, country, source_platform, status</code>
          <br />event_type: <code className="bg-gray-100 px-1 rounded">return</code> / <code className="bg-gray-100 px-1 rounded">refund</code> / <code className="bg-gray-100 px-1 rounded">dispute</code> / <code className="bg-gray-100 px-1 rounded">chargeback</code>
        </p>
        <textarea
          value={csv}
          onChange={e => setCsv(e.target.value)}
          placeholder={"order_id,product_title,reason,amount,event_type,date\n#1234,Robe Maxi,Taille trop grande,34.95,return,2026-07-10"}
          rows={8}
          className="w-full bg-gray-50 border border-black/8 rounded-xl px-3 py-2.5 text-xs font-mono outline-none focus:border-blue-500/50 resize-none"
        />
        {result && <p className="text-sm mt-2 font-medium">{result}</p>}
        <div className="flex gap-2 mt-4">
          {result ? (
            <button onClick={onClose} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white font-semibold text-sm transition">Sluiten</button>
          ) : (
            <>
              <button onClick={onClose} className="flex-1 h-10 rounded-xl bg-black/5 text-gray-600 font-semibold text-sm transition">Annuleren</button>
              <button onClick={doImport} disabled={saving || !csv.trim()}
                className="flex-1 h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">
                {saving ? "Importeren…" : "Importeren"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
