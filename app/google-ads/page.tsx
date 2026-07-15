"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, Check, Eye, MousePointerClick,
  TrendingUp, Upload, X, Zap,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

type AdRow = {
  store_id: string; date: string; spend: number; clicks: number;
  impressions: number; conversions: number; cpc: number; ctr: number; roas: number;
};
type DailyRow = {
  date: string; spend: number; clicks: number;
  impressions: number; conversions: number; cpc: number; ctr: number;
};
type Totals = {
  spend: number; clicks: number; impressions: number;
  conversions: number; cpc: number; ctr: number;
};

// ─── CSV aliases ──────────────────────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  date:        ["day", "date", "datum", "dag"],
  spend:       ["cost", "spend", "kosten", "costs"],
  clicks:      ["clicks", "klicks", "klikken"],
  impressions: ["impressions", "vertoningen", "impr"],
  conversions: ["conversions", "conversies", "conv"],
  cpc:         ["avg_cpc", "cpc", "gemiddelde_cpc", "avg__cpc"],
  ctr:         ["ctr", "click_through_rate", "ktr"],
};
function normalise(h: string) { return h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""); }
function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
}
function parseGoogleAdsCsv(content: string, storeId: string): AdRow[] {
  const allLines = content.split(/\r?\n/);
  const headerIdx = allLines.findIndex(l => {
    const low = l.toLowerCase();
    return low.includes("day") || low.includes("date") || low.includes("datum") || low.includes("cost");
  });
  if (headerIdx === -1) return [];
  const lines = allLines.slice(headerIdx).filter(l => l.trim());
  const headers = lines[0].split(",").map(normalise);
  function col(key: string) {
    for (const a of (ALIASES[key] ?? [key])) { const i = headers.indexOf(a); if (i !== -1) return i; }
    return -1;
  }
  const rows: AdRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split(",");
    const rawDate = r[col("date")]?.trim();
    if (!rawDate || /total|totaal|^--/i.test(rawDate)) continue;
    let date: string;
    try { const d = new Date(rawDate); if (isNaN(d.getTime())) continue; date = d.toISOString().slice(0, 10); }
    catch { continue; }
    const spend = parseNum(r[col("spend")]);
    const clicks = Math.round(parseNum(r[col("clicks")]));
    const impressions = Math.round(parseNum(r[col("impressions")]));
    const conversions = parseNum(r[col("conversions")]);
    const cpc = clicks > 0 ? spend / clicks : parseNum(r[col("cpc")]);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : parseNum(r[col("ctr")]);
    rows.push({ store_id: storeId, date, spend, clicks, impressions, conversions, cpc, ctr, roas: 0 });
  }
  return rows;
}

function f2(n: number) { return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function GoogleAdsPage() {
  const { stores } = useStores();
  const [storeId, setStoreId]   = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("30d"));
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed]     = useState<AdRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(false);
  const [rows, setRows]           = useState<DailyRow[]>([]);
  const [totals, setTotals]       = useState<Totals | null>(null);
  const [roas, setRoas]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [chart, setChart]         = useState<"spend" | "clicks" | "impressions">("spend");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const dq = toQueryString(dateRange);
      const [adsRes, dashRes] = await Promise.all([
        fetch(`${API}/api/ads/overview?store_id=${storeId}&${dq}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/dashboard/overview?store_id=${storeId}&${dq}`, { cache: "no-store" }).then(r => r.json()),
      ]);
      setRows(adsRes.rows ?? []);
      setTotals(adsRes.totals ?? null);
      setRoas(dashRes.roas ?? 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [storeId, dateRange]);

  function handleFile(file: File) {
    setFileName(file.name); setImported(false);
    const reader = new FileReader();
    reader.onload = e => setParsed(parseGoogleAdsCsv(e.target?.result as string, storeId));
    reader.readAsText(file, "utf-8");
  }
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function doImport() {
    if (!parsed.length) return;
    setImporting(true);
    await fetch(`${API}/api/ads/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed }),
    });
    setImporting(false); setImported(true); setParsed([]); setFileName("");
    await loadData();
  }

  const hasData = rows.length > 0;
  const t = totals;
  const prevSpend  = parsed.reduce((s, r) => s + r.spend,  0);
  const prevClicks = parsed.reduce((s, r) => s + r.clicks, 0);

  const chartData = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  const METRIC_CARDS = [
    {
      label: "Spend",
      value: t ? `€${f2(t.spend)}` : "—",
      icon: <span className="text-base">💸</span>,
      color: "",
    },
    {
      label: "Clicks",
      value: t ? t.clicks.toLocaleString("nl-NL") : "—",
      icon: <MousePointerClick size={15} className="text-blue-400" />,
      color: "",
    },
    {
      label: "Impressions",
      value: t ? t.impressions.toLocaleString("nl-NL") : "—",
      icon: <Eye size={15} className="text-purple-400" />,
      color: "text-purple-700",
    },
    {
      label: "CTR",
      value: t ? `${t.ctr.toFixed(2)}%` : "—",
      icon: <TrendingUp size={15} className="text-cyan-400" />,
      color: t && t.ctr >= 2 ? "text-emerald-400" : t && t.ctr >= 1 ? "text-amber-400" : "text-red-400",
    },
    {
      label: "CPC",
      value: t ? `€${f2(t.cpc)}` : "—",
      icon: <span className="text-base">🎯</span>,
      color: "",
    },
    {
      label: "Conversions",
      value: t ? t.conversions.toFixed(1) : "—",
      icon: <Check size={15} className="text-emerald-400" />,
      color: "text-emerald-700",
    },
    {
      label: "ROAS",
      value: roas > 0 ? `${roas.toFixed(2)}x` : "—",
      icon: <BarChart3 size={15} className={roas >= 3 ? "text-emerald-400" : roas >= 1.5 ? "text-amber-400" : "text-red-400"} />,
      color: roas >= 3 ? "text-emerald-400" : roas >= 1.5 ? "text-amber-400" : roas > 0 ? "text-red-400" : "",
    },
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <BarChart3 size={22} className="text-blue-400" /> Google Ads
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Alle ad stats — spend, clicks, CTR, CPC, ROAS</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-black/5 rounded-xl p-1">
            {stores.map(s => (
              <button key={s.id} onClick={() => { setStoreId(s.id); setParsed([]); setFileName(""); setImported(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${storeId === s.id ? "bg-blue-600 text-gray-900" : "text-gray-500 hover:text-gray-900"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric cards — 7 across */}
      {loading ? (
        <div className="grid grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-black/4 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {METRIC_CARDS.map(c => (
            <div key={c.label} className="rounded-2xl bg-black/3 border border-black/5 p-4">
              <div className="flex items-center gap-1.5 mb-2 text-gray-500">
                {c.icon}
                <p className="text-[10px] uppercase tracking-widest font-medium">{c.label}</p>
              </div>
              <p className={`text-lg font-black ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {hasData && (
        <div className="rounded-2xl bg-black/3 border border-black/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-blue-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Trend</h3>
            <span className="ml-auto text-[10px] text-gray-400">{rows.length} days</span>
            <div className="flex gap-1 bg-black/5 rounded-lg p-0.5 ml-2">
              {([["spend","Spend"],["clicks","Clicks"],["impressions","Impr."]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setChart(k)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${chart === k ? "bg-blue-600 text-gray-900" : "text-gray-500 hover:text-gray-900"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              {chart === "spend" ? (
                <AreaChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: "#71717a" }} itemStyle={{ color: "#60a5fa" }}
                    formatter={(v: number) => [`€${v.toFixed(2)}`, "Spend"]} />
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="spend" stroke="#3b82f6" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                </AreaChart>
              ) : chart === "clicks" ? (
                <LineChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: "#71717a" }} itemStyle={{ color: "#a78bfa" }}
                    formatter={(v: number) => [v.toLocaleString(), "Clicks"]} />
                  <Line type="monotone" dataKey="clicks" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: "#71717a" }} itemStyle={{ color: "#c084fc" }}
                    formatter={(v: number) => [v.toLocaleString(), "Impressions"]} />
                  <defs>
                    <linearGradient id="imprGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="impressions" stroke="#a855f7" strokeWidth={2} fill="url(#imprGrad)" dot={false} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Daily table */}
      {hasData && (
        <div className="rounded-2xl bg-black/3 border border-black/5 overflow-hidden">
          <div className="overflow-y-auto max-h-72">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/5 text-gray-500 sticky top-0 bg-white">
                  {["Date","Spend","Clicks","Impressions","CTR","CPC","Conv."].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => (
                  <tr key={i} className="border-b border-black/4 hover:bg-black/3 transition">
                    <td className="px-4 py-2.5 text-gray-500 font-mono">{r.date}</td>
                    <td className="px-4 py-2.5 font-bold text-red-700">€{f2(r.spend)}</td>
                    <td className="px-4 py-2.5 font-semibold">{r.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.impressions.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 font-semibold ${r.ctr >= 2 ? "text-emerald-400" : r.ctr >= 1 ? "text-amber-400" : "text-gray-500"}`}>
                      {r.ctr.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">€{f2(r.cpc)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.conversions.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV import */}
      <div className="rounded-2xl bg-black/3 border border-black/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-blue-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">CSV Import</h3>
          <span className="ml-auto text-[10px] text-gray-400">Manual backup alongside the Ads Script</span>
        </div>

        <div className="rounded-xl bg-blue-600/6 border border-blue-500/15 p-4 mb-4 text-xs text-gray-500 space-y-1">
          <p className="text-blue-700 font-semibold mb-2">Export from Google Ads:</p>
          <p><span className="text-gray-400">1.</span> ads.google.com → <strong className="text-gray-900">Reports</strong> → Predefined → Time → Day</p>
          <p><span className="text-gray-400">2.</span> Set date range → <strong className="text-gray-900">↓ Download → CSV</strong></p>
          <p><span className="text-gray-400">3.</span> Drop the .csv file below</p>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 flex flex-col items-center cursor-pointer transition-all ${
            dragOver ? "border-blue-500 bg-blue-600/10" : "border-black/8 bg-gray-50 hover:border-black/15 hover:bg-black/4"
          }`}
        >
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Upload size={22} className={`mb-2 ${dragOver ? "text-blue-400" : "text-gray-400"}`} />
          {fileName ? (
            <div className="text-center">
              <p className="text-sm font-semibold">{fileName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {parsed.length > 0
                  ? `${parsed.length} days · €${prevSpend.toFixed(2)} spend · ${prevClicks.toLocaleString()} clicks`
                  : "No recognised columns — check the CSV format"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Drop your Google Ads CSV here or click</p>
          )}
        </div>

        {parsed.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {parsed.length} days found · {parsed[0]?.date} to {parsed[parsed.length - 1]?.date}
            </p>
            <div className="flex gap-2">
              <button onClick={() => { setParsed([]); setFileName(""); }}
                className="h-8 px-3 rounded-lg bg-black/5 hover:bg-black/10 text-xs text-gray-500 transition flex items-center gap-1.5">
                <X size={11} /> Cancel
              </button>
              <button onClick={doImport} disabled={importing}
                className="h-8 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-60">
                {importing ? "Importing..." : <><Upload size={11} /> Import {parsed.length} days</>}
              </button>
            </div>
          </div>
        )}

        {imported && (
          <div className="mt-3 rounded-xl bg-emerald-600/10 border border-emerald-500/20 px-4 py-2.5 flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <Check size={13} /> Imported — stats updated above
          </div>
        )}
      </div>

      {!hasData && !loading && (
        <div className="rounded-2xl bg-black/3 border border-black/5 p-12 flex flex-col items-center text-gray-400">
          <BarChart3 size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No ad data for {storeId} in this period</p>
          <p className="text-xs text-gray-400 mt-1">Upload a CSV above or check that the Ads Script is active</p>
        </div>
      )}
    </div>
  );
}
