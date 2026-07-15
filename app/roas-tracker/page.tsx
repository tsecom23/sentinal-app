"use client";

import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, RotateCcw, TrendingUp,
  Pencil, Check, X, Info, Calendar, ChevronDown,
} from "lucide-react";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

// ─── Country config per store ─────────────────────────────────────────────────
const STORE_COUNTRIES: Record<string, { code: string; name: string; flag: string }[]> = {
  ceofo:     [{ code: "FR", name: "France",  flag: "🇫🇷" }, { code: "ES", name: "Spain",  flag: "🇪🇸" }, { code: "IT", name: "Italy",  flag: "🇮🇹" }],
  dorevy:    [{ code: "CA", name: "Canada",  flag: "🇨🇦" }, { code: "US", name: "USA",    flag: "🇺🇸" }],
  martaline: [{ code: "FR", name: "France",  flag: "🇫🇷" }],
};

function getCountries(storeId: string) {
  return STORE_COUNTRIES[storeId] ?? [];
}

// Single-country stores use country="" (no filter) so spend reads from global google_ads_daily
function defaultCountry(storeId: string): string {
  const cs = getCountries(storeId);
  return cs.length > 1 ? (cs[0]?.code ?? "") : "";
}

// ─── Month options ────────────────────────────────────────────────────────────
function getMonthOptions(): { label: string; start: string; end: string }[] {
  const now = new Date();
  const options = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = i === 0
      ? now.toISOString().slice(0, 10)
      : `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ label, start, end });
  }
  return options;
}

const MONTH_OPTIONS = getMonthOptions();

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface Row {
  date: string;
  ad_spend: number;
  revenue: number;
  orders: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  roas: number;
  notes: string;
  is_manual: boolean;
  auto_spend: number;
  auto_revenue: number;
}

interface EditState {
  ad_spend: string;
  revenue: string;
  orders: string;
  clicks: string;
  impressions: string;
  notes: string;
}

function roasColor(roas: number): string {
  if (roas <= 0)  return "text-gray-500";
  if (roas < 1.5) return "text-red-400";
  if (roas < 2.5) return "text-amber-400";
  if (roas < 4)   return "text-emerald-400";
  return "text-blue-400";
}

function roasBg(roas: number): string {
  if (roas <= 0)  return "";
  if (roas < 1.5) return "bg-red-500/8";
  if (roas < 2.5) return "bg-amber-500/8";
  if (roas < 4)   return "bg-emerald-500/8";
  return "bg-blue-500/8";
}

function fmt(n: number, dec = 2) {
  return "€" + n.toLocaleString("en-GB", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtRoas(n: number) {
  if (n <= 0) return "—";
  return n.toFixed(2) + "×";
}

function fmtPct(n: number) {
  return n.toFixed(2) + "%";
}

function fmtNum(n: number) {
  return n.toLocaleString("en-GB");
}

function parseNum(s: string): number {
  return parseFloat(s.replace(",", ".")) || 0;
}

function formatDate(d: string) {
  const date = new Date(d + "T12:00:00Z");
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function computeTotals(rows: Row[]) {
  const total = rows.reduce((acc, r) => ({
    ad_spend:    acc.ad_spend    + r.ad_spend,
    revenue:     acc.revenue     + r.revenue,
    orders:      acc.orders      + r.orders,
    clicks:      acc.clicks      + r.clicks,
    impressions: acc.impressions + r.impressions,
  }), { ad_spend: 0, revenue: 0, orders: 0, clicks: 0, impressions: 0 });

  return {
    ...total,
    roas: total.ad_spend > 0 ? total.revenue / total.ad_spend : 0,
    ctr:  total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0,
    cpc:  total.clicks > 0 ? total.ad_spend / total.clicks : 0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RoasTrackerPage() {
  const { stores } = useStores();
  const [store, setStore] = useState("ceofo");

  // Breakeven ROAS — editable per store, persisted in localStorage
  const [beRoas, setBeRoas]         = useState(0);
  const [editBeRoas, setEditBeRoas] = useState(false);
  const [beRoasInput, setBeRoasInput] = useState("");

  // Country: default to first country of selected store
  const [country, setCountry] = useState<string>(() => defaultCountry("ceofo"));

  // Date range
  const [mode, setMode]         = useState<"month" | "custom">("month");
  const [monthIdx, setMonthIdx] = useState(0);
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState<string | null>(null);

  const [editDate, setEditDate]   = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick spend: click-to-edit just the spend cell (spreadsheet style)
  const [quickSpendDate, setQuickSpendDate] = useState<string | null>(null);
  const [quickSpendVal, setQuickSpendVal]   = useState<string>("");
  const quickSpendRef = useRef<HTMLInputElement>(null);

  // When stores load, pick a valid one
  useEffect(() => {
    if (stores.length > 0 && !stores.find(s => s.id === store)) {
      const first = stores[0].id;
      setStore(first);
      setCountry(defaultCountry(first));
    }
  }, [stores]); // eslint-disable-line

  // When store changes, reset country to first of new store
  function handleStoreChange(newStore: string) {
    setStore(newStore);
    setCountry(defaultCountry(newStore));
    setEditDate(null);
    setEditState(null);
  }

  function getDateRange() {
    if (mode === "custom") return { start: customStart, end: customEnd };
    return { start: MONTH_OPTIONS[monthIdx].start, end: MONTH_OPTIONS[monthIdx].end };
  }

  async function load() {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const countryParam = country ? `&country=${country}` : "";
      const res = await fetch(
        `${API}/api/roas-tracker?store_id=${store}&start=${start}&end=${end}${countryParam}`,
        { cache: "no-store" }
      );
      const data = await res.json() as { rows: Row[] };
      setRows(data.rows ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [store, country, mode, monthIdx, customStart, customEnd]); // eslint-disable-line

  // Load breakeven ROAS from localStorage when store changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`be_roas_${store}`);
      const val = saved ? parseFloat(saved) : 0;
      setBeRoas(val || 0);
      setBeRoasInput(val ? val.toFixed(2) : "");
    } catch { /* SSR */ }
  }, [store]);

  function saveBeRoas() {
    const val = parseNum(beRoasInput);
    setBeRoas(val);
    try { localStorage.setItem(`be_roas_${store}`, String(val)); } catch { /* SSR */ }
    setEditBeRoas(false);
  }

  function startEdit(row: Row) {
    setEditDate(row.date);
    setEditState({
      ad_spend:    row.ad_spend.toFixed(2),
      revenue:     row.revenue.toFixed(2),
      orders:      String(row.orders),
      clicks:      String(row.clicks),
      impressions: String(row.impressions),
      notes:       row.notes,
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function cancelEdit() { setEditDate(null); setEditState(null); }

  function openQuickSpend(row: Row) {
    // Close full edit if open
    setEditDate(null); setEditState(null);
    setQuickSpendDate(row.date);
    setQuickSpendVal(row.ad_spend > 0 ? row.ad_spend.toFixed(2) : "");
    setTimeout(() => { quickSpendRef.current?.focus(); quickSpendRef.current?.select(); }, 30);
  }

  async function saveQuickSpend(date: string) {
    const spend = parseNum(quickSpendVal);
    setQuickSpendDate(null);
    const row = rows.find(r => r.date === date);
    await fetch(`${API}/api/roas-tracker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_id: store, date, country,
        ad_spend: spend,
        revenue:  row?.revenue     ?? 0,
        orders:   row?.orders      ?? 0,
        clicks:   row?.clicks      ?? 0,
        impressions: row?.impressions ?? 0,
        notes: row?.notes ?? "", is_manual: true,
      }),
    });
    await load();
  }

  async function saveEdit(date: string) {
    if (!editState) return;
    setSaving(date);
    await fetch(`${API}/api/roas-tracker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_id: store, date, country,
        ad_spend:    parseNum(editState.ad_spend),
        revenue:     parseNum(editState.revenue),
        orders:      parseInt(editState.orders) || 0,
        clicks:      parseInt(editState.clicks) || 0,
        impressions: parseInt(editState.impressions) || 0,
        notes: editState.notes, is_manual: true,
      }),
    });
    setSaving(null);
    setEditDate(null);
    setEditState(null);
    await load();
  }

  async function resetRow(date: string) {
    if (!confirm(`Reset ${formatDate(date)} to auto data?`)) return;
    const countryParam = country ? `&country=${country}` : "";
    await fetch(`${API}/api/roas-tracker/${date}?store_id=${store}${countryParam}`, { method: "DELETE" });
    await load();
  }

  const totals   = computeTotals(rows);
  const countries = getCountries(store);
  const multiCountry = countries.length > 1;

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2 text-gray-900">
            <TrendingUp size={18} className="text-purple-400" />
            ROAS Tracker
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">
            Auto-filled from your data — click a row to edit
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Store selector */}
          <select
            value={store}
            onChange={e => handleStoreChange(e.target.value)}
            className="bg-gray-100 border border-black/10 text-gray-900 text-xs rounded-lg px-3 py-2 focus:outline-none"
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* Month / custom picker */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={mode === "custom" ? "custom" : String(monthIdx)}
                onChange={e => {
                  const val = e.target.value;
                  if (val === "custom") { setMode("custom"); }
                  else { setMode("month"); setMonthIdx(parseInt(val)); }
                }}
                className="appearance-none bg-gray-100 border border-black/10 text-gray-900 text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none cursor-pointer"
              >
                {MONTH_OPTIONS.map((m, i) => (
                  <option key={i} value={String(i)}>{m.label}</option>
                ))}
                <option value="custom">Custom range…</option>
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {mode === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date" value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-gray-100 border border-black/10 text-gray-900 text-xs rounded-lg px-2 py-2 focus:outline-none"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date" value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-gray-100 border border-black/10 text-gray-900 text-xs rounded-lg px-2 py-2 focus:outline-none"
                />
              </div>
            )}
          </div>

          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-black/10 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Country tabs — only shown for multi-country stores */}
      {multiCountry && (
        <div className="flex items-center gap-1.5 mb-4">
          {countries.map(c => (
            <button
              key={c.code}
              onClick={() => { setCountry(c.code); setEditDate(null); setEditState(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                ${country === c.code
                  ? "bg-purple-600 border-purple-500 text-white shadow-sm"
                  : "bg-gray-100 border-black/10 text-gray-600 hover:bg-gray-200"
                }`}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[11px] text-gray-500 flex-wrap">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> ROAS ≥ 4×</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> 2.5× – 4×</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> 1.5× – 2.5×</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> &lt; 1.5×</div>
        <div className="flex items-center gap-1.5 ml-4"><Pencil size={10} className="text-purple-400" /> = manually edited</div>
      </div>

      {/* KPI summary bar */}
      {rows.length > 0 && (() => {
        const aov = totals.orders > 0 ? totals.revenue / totals.orders : 0;
        const roasVsBe = beRoas > 0 ? totals.roas / beRoas : null;
        const aboveBe  = roasVsBe !== null && totals.roas >= beRoas;
        return (
          <div className="flex items-stretch gap-3 mb-4 flex-wrap">
            {/* Spend */}
            <div className="bg-white border border-black/8 rounded-xl px-4 py-3 min-w-[120px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Ad Spend</p>
              <p className="text-base font-bold text-gray-900">{fmt(totals.ad_spend)}</p>
            </div>
            {/* Revenue */}
            <div className="bg-white border border-black/8 rounded-xl px-4 py-3 min-w-[120px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Revenue</p>
              <p className="text-base font-bold text-gray-900">{fmt(totals.revenue)}</p>
            </div>
            {/* ROAS */}
            <div className={`border rounded-xl px-4 py-3 min-w-[120px] ${aboveBe ? "bg-emerald-50 border-emerald-200" : beRoas > 0 ? "bg-red-50 border-red-200" : "bg-white border-black/8"}`}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">ROAS</p>
              <p className={`text-base font-bold ${roasColor(totals.roas)}`}>{fmtRoas(totals.roas)}</p>
              {roasVsBe !== null && (
                <p className={`text-[10px] mt-0.5 font-medium ${aboveBe ? "text-emerald-600" : "text-red-500"}`}>
                  {aboveBe ? "▲" : "▼"} {((roasVsBe - 1) * 100).toFixed(0)}% vs BE
                </p>
              )}
            </div>
            {/* Breakeven ROAS */}
            <div className="bg-white border border-black/8 rounded-xl px-4 py-3 min-w-[130px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Breakeven ROAS</p>
              {editBeRoas ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    autoFocus
                    type="text"
                    value={beRoasInput}
                    onChange={e => setBeRoasInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveBeRoas(); if (e.key === "Escape") setEditBeRoas(false); }}
                    className="w-16 bg-gray-100 border border-purple-400 rounded px-2 py-0.5 text-xs text-gray-900 focus:outline-none"
                  />
                  <button onClick={saveBeRoas} className="p-1 rounded bg-purple-600 hover:bg-purple-500 text-white"><Check size={10} /></button>
                  <button onClick={() => setEditBeRoas(false)} className="p-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-500"><X size={10} /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setBeRoasInput(beRoas ? beRoas.toFixed(2) : ""); setEditBeRoas(true); }}
                  className="flex items-center gap-1.5 text-base font-bold text-gray-700 hover:text-purple-600 transition-colors group"
                >
                  {beRoas > 0 ? `${beRoas.toFixed(2)}×` : <span className="text-gray-300 text-sm">set…</span>}
                  <Pencil size={10} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
                </button>
              )}
            </div>
            {/* AOV */}
            <div className="bg-white border border-black/8 rounded-xl px-4 py-3 min-w-[120px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">AOV</p>
              <p className="text-base font-bold text-gray-900">{aov > 0 ? fmt(aov) : "—"}</p>
              {totals.orders > 0 && <p className="text-[10px] text-gray-400 mt-0.5">{fmtNum(totals.orders)} orders</p>}
            </div>
          </div>
        );
      })()}

      {/* Table */}
      <div className="rounded-xl border border-black/8 overflow-x-auto bg-white">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr className="border-b border-black/8 text-gray-500 text-[11px]">
              <th className="text-left px-4 py-3 w-32">Date</th>
              <th className="text-right px-3 py-3">Spend</th>
              <th className="text-right px-3 py-3">Revenue</th>
              <th className="text-right px-3 py-3 font-bold">ROAS</th>
              <th className="text-right px-3 py-3">Orders</th>
              <th className="text-right px-3 py-3">Clicks</th>
              <th className="text-right px-3 py-3">Impr.</th>
              <th className="text-right px-3 py-3">CTR</th>
              <th className="text-right px-3 py-3">CPC</th>
              <th className="text-left px-3 py-3">Notes</th>
              <th className="px-3 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {/* Totals row */}
            {rows.length > 0 && (
              <tr className="bg-gray-100/60 border-b border-black/8 font-semibold text-gray-900">
                <td className="px-4 py-2.5 text-gray-500 text-[11px] font-normal">
                  Total ({rows.length}d)
                  {multiCountry && <span className="ml-1">{countries.find(c => c.code === country)?.flag}</span>}
                </td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.ad_spend)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.revenue)}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${roasColor(totals.roas)}`}>{fmtRoas(totals.roas)}</td>
                <td className="px-3 py-2.5 text-right">{fmtNum(totals.orders)}</td>
                <td className="px-3 py-2.5 text-right">{fmtNum(totals.clicks)}</td>
                <td className="px-3 py-2.5 text-right">{fmtNum(totals.impressions)}</td>
                <td className="px-3 py-2.5 text-right">{fmtPct(totals.ctr)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.cpc)}</td>
                <td className="px-3 py-2.5" /><td className="px-3 py-2.5" />
              </tr>
            )}

            {loading ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                <RefreshCw size={16} className="animate-spin inline mr-2" />Loading...
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                No data found for this period.
              </td></tr>
            ) : rows.map(row => {
              const isEditing = editDate === row.date;
              const isSaving  = saving === row.date;
              const hasData   = row.ad_spend > 0 || row.revenue > 0 || row.orders > 0;

              const editSpend   = isEditing ? parseNum(editState!.ad_spend) : row.ad_spend;
              const editRevenue = isEditing ? parseNum(editState!.revenue)  : row.revenue;
              const editClicks  = isEditing ? parseInt(editState!.clicks) || 0 : row.clicks;
              const editImpr    = isEditing ? parseInt(editState!.impressions) || 0 : row.impressions;
              const liveRoas    = editSpend > 0 ? editRevenue / editSpend : 0;
              const liveCtr     = editImpr > 0 ? (editClicks / editImpr) * 100 : 0;
              const liveCpc     = editClicks > 0 ? editSpend / editClicks : 0;

              return (
                <tr
                  key={row.date}
                  className={`border-b border-black/5 transition-colors group
                    ${isEditing
                      ? "bg-purple-50 border-purple-500/20"
                      : hasData
                        ? `hover:bg-black/3 ${roasBg(row.roas)}`
                        : "opacity-40 hover:opacity-70"}
                  `}
                >
                  <td className="px-4 py-2 font-medium text-gray-600 whitespace-nowrap">
                    {formatDate(row.date)}
                    {row.is_manual && <span title="Manually edited"><Pencil size={9} className="inline ml-1.5 text-purple-400" /></span>}
                  </td>

                  {/* Spend — direct click-to-edit for multi-country */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input ref={inputRef} type="text" value={editState!.ad_spend}
                        onChange={e => setEditState(s => s ? { ...s, ad_spend: e.target.value } : s)}
                        className="w-24 bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none focus:border-purple-400"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : quickSpendDate === row.date ? (
                      <input
                        ref={quickSpendRef}
                        type="text"
                        value={quickSpendVal}
                        onChange={e => setQuickSpendVal(e.target.value)}
                        placeholder="0.00"
                        className="w-24 bg-white border-2 border-purple-500 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none"
                        onKeyDown={e => { if (e.key === "Enter") saveQuickSpend(row.date); if (e.key === "Escape") setQuickSpendDate(null); }}
                        onBlur={() => { if (quickSpendVal !== "") saveQuickSpend(row.date); else setQuickSpendDate(null); }}
                      />
                    ) : (
                      <span
                        onClick={() => multiCountry ? openQuickSpend(row) : undefined}
                        className={multiCountry
                          ? "cursor-pointer group/spend"
                          : "text-gray-700"
                        }
                      >
                        {row.ad_spend > 0 ? (
                          <span className="text-gray-700">{fmt(row.ad_spend)}</span>
                        ) : multiCountry ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-purple-400 border border-dashed border-purple-400/40 rounded px-1.5 py-0.5 hover:bg-purple-500/10 transition-colors">
                            + spend
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Revenue */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="text" value={editState!.revenue}
                        onChange={e => setEditState(s => s ? { ...s, revenue: e.target.value } : s)}
                        className="w-24 bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none focus:border-purple-400"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span className="text-gray-700">
                        {row.revenue > 0 ? fmt(row.revenue) : <span className="text-gray-400">—</span>}
                      </span>
                    )}
                  </td>

                  {/* ROAS */}
                  <td className={`px-3 py-2 text-right font-bold ${roasColor(isEditing ? liveRoas : row.roas)}`}>
                    {fmtRoas(isEditing ? liveRoas : row.roas)}
                  </td>

                  {/* Orders */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="text" value={editState!.orders}
                        onChange={e => setEditState(s => s ? { ...s, orders: e.target.value } : s)}
                        className="w-16 bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span className="text-gray-600">
                        {row.orders > 0 ? fmtNum(row.orders) : <span className="text-gray-400">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Clicks */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="text" value={editState!.clicks}
                        onChange={e => setEditState(s => s ? { ...s, clicks: e.target.value } : s)}
                        className="w-20 bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span className="text-gray-500">
                        {row.clicks > 0 ? fmtNum(row.clicks) : <span className="text-gray-400">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Impressions */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="text" value={editState!.impressions}
                        onChange={e => setEditState(s => s ? { ...s, impressions: e.target.value } : s)}
                        className="w-20 bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-right text-xs text-gray-900 focus:outline-none"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span className="text-gray-500">
                        {row.impressions > 0 ? fmtNum(row.impressions) : <span className="text-gray-400">—</span>}
                      </span>
                    )}
                  </td>

                  {/* CTR */}
                  <td className="px-3 py-2 text-right text-gray-500">
                    {(isEditing ? liveCtr : row.ctr) > 0
                      ? fmtPct(isEditing ? liveCtr : row.ctr)
                      : <span className="text-gray-400">—</span>}
                  </td>

                  {/* CPC */}
                  <td className="px-3 py-2 text-right text-gray-500">
                    {(isEditing ? liveCpc : row.cpc) > 0
                      ? fmt(isEditing ? liveCpc : row.cpc)
                      : <span className="text-gray-400">—</span>}
                  </td>

                  {/* Notes */}
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input type="text" value={editState!.notes}
                        onChange={e => setEditState(s => s ? { ...s, notes: e.target.value } : s)}
                        placeholder="Note..."
                        className="w-full bg-gray-200 border border-purple-500/40 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none placeholder:text-gray-400"
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(row.date); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span className="text-gray-500 italic">{row.notes || ""}</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => saveEdit(row.date)} disabled={isSaving}
                          className="p-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors" title="Save">
                          {isSaving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                        </button>
                        <button onClick={cancelEdit}
                          className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors" title="Cancel">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(row)}
                          className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-900 transition-colors" title="Edit">
                          <Pencil size={11} />
                        </button>
                        {row.is_manual && (
                          <button onClick={() => resetRow(row.date)}
                            className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-amber-400 transition-colors" title="Reset to auto data">
                            <RotateCcw size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-start gap-2 text-[11px] text-gray-400">
        <Info size={11} className="mt-0.5 shrink-0" />
        <span>
          {multiCountry
            ? <>Revenue auto-fills per country from Shopify orders. <strong className="text-gray-500">Click any row to enter the actual ad spend for that country.</strong> Each country saves its spend separately so ROAS is calculated correctly per market.</>
            : <>Revenue and spend auto-fill from Shopify and Google Ads. Click a row to override.</>
          }
          {" "}A <Pencil size={9} className="inline mx-0.5 text-purple-400" /> icon marks manually edited rows.
          Click <RotateCcw size={9} className="inline mx-0.5" /> to reset to auto data.
        </span>
      </div>
    </div>
  );
}
