"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, Check, ChevronLeft, MousePointerClick,
  TrendingUp, Upload, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const API = "https://sentinel-api.tssheets1.workers.dev";

const STORES = [
  { key: "ceofo", name: "CEOFO" },
  { key: "martaline", name: "Martaline" },
];

type AdRow = {
  store_id: string; date: string; spend: number; clicks: number;
  impressions: number; conversions: number; cpc: number; ctr: number; roas: number;
};

type AdSummary = {
  date: string; spend: number; clicks: number;
  impressions: number; conversions: number; cpc: number; ctr: number; roas: number;
};

// ─── CSV parser ───────────────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  date:        ["day", "date", "datum", "dag"],
  spend:       ["cost", "spend", "kosten", "costs"],
  clicks:      ["clicks", "klicks", "klikken"],
  impressions: ["impressions", "vertoningen", "impr"],
  conversions: ["conversions", "conversies", "conv"],
  cpc:         ["avg_cpc", "cpc", "gemiddelde_cpc", "avg__cpc"],
  ctr:         ["ctr", "click_through_rate", "ktr"],
};

function normalise(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
}

function parseGoogleAdsCsv(content: string, storeId: string): AdRow[] {
  const allLines = content.split(/\r?\n/);
  // Find header row (contains date/cost/day keyword)
  const headerIdx = allLines.findIndex(l => {
    const low = l.toLowerCase();
    return low.includes("day") || low.includes("date") || low.includes("datum") || low.includes("cost");
  });
  if (headerIdx === -1) return [];

  const lines = allLines.slice(headerIdx).filter(l => l.trim());
  const headers = lines[0].split(",").map(normalise);

  function col(key: string): number {
    const alts = ALIASES[key] ?? [key];
    for (const a of alts) {
      const i = headers.indexOf(a);
      if (i !== -1) return i;
    }
    return -1;
  }

  const rows: AdRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split(",");
    const rawDate = r[col("date")]?.trim();
    if (!rawDate || /total|totaal|^--/i.test(rawDate)) continue;

    let date: string;
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) continue;
      date = d.toISOString().slice(0, 10);
    } catch { continue; }

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoogleAdsPage() {
  const [storeId, setStoreId] = useState("ceofo");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<AdRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [summary, setSummary] = useState<AdSummary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API}/api/ads/overview?store_id=${storeId}&range=30d`, { cache: "no-store" });
      const data = await res.json();
      setSummary(data.rows ?? []);
    } catch { /* ignore */ }
    setLoadingSummary(false);
  }

  useEffect(() => { loadSummary(); }, [storeId]);

  function handleFile(file: File) {
    setFileName(file.name);
    setImported(false);
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseGoogleAdsCsv(e.target?.result as string, storeId);
      setParsed(rows);
    };
    reader.readAsText(file, "utf-8");
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function doImport() {
    if (!parsed.length) return;
    setImporting(true);
    await fetch(`${API}/api/ads/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed }),
    });
    setImporting(false);
    setImported(true);
    setParsed([]);
    setFileName("");
    await loadSummary();
  }

  const totalSpend = summary.reduce((s, r) => s + r.spend, 0);
  const totalClicks = summary.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = summary.reduce((s, r) => s + r.impressions, 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const prevSpend = parsed.reduce((s, r) => s + r.spend, 0);
  const prevClicks = parsed.reduce((s, r) => s + r.clicks, 0);
  const prevDays = parsed.length;

  return (
    <div className="min-h-screen bg-[#07070b] text-white p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="h-9 w-9 rounded-xl bg-[#111118] border border-white/8 flex items-center justify-center text-zinc-500 hover:text-white transition">
            <ChevronLeft size={16} />
          </a>
          <div>
            <h1 className="text-2xl font-black">Google Ads</h1>
            <p className="text-sm text-zinc-500">Importeer via CSV export — geen API goedkeuring nodig</p>
          </div>
          <div className="ml-auto">
            <select
              value={storeId}
              onChange={e => { setStoreId(e.target.value); setParsed([]); setFileName(""); setImported(false); }}
              className="bg-[#111118] border border-white/8 rounded-xl px-3 py-2 text-sm text-white"
            >
              {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* How-to banner */}
        <div className="rounded-2xl bg-blue-600/8 border border-blue-500/20 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-blue-400" />
            <p className="text-xs font-bold text-blue-300 uppercase tracking-widest">Hoe exporteer je uit Google Ads</p>
          </div>
          <ol className="text-xs text-zinc-400 space-y-1.5">
            <li><span className="text-zinc-600 mr-2">1.</span>Ga naar <span className="text-white font-medium">ads.google.com</span> → klik op <strong className="text-white">Rapporten</strong> in het linkermenu</li>
            <li><span className="text-zinc-600 mr-2">2.</span>Kies <strong className="text-white">Vooraf ingesteld rapport → Tijd → Dag</strong> (of maak een eigen rapport)</li>
            <li><span className="text-zinc-600 mr-2">3.</span>Stel datumbereik in (bijv. afgelopen 30 of 90 dagen)</li>
            <li><span className="text-zinc-600 mr-2">4.</span>Klik rechtsboven <strong className="text-white">↓ Downloaden → CSV</strong></li>
            <li><span className="text-zinc-600 mr-2">5.</span>Sleep het .csv bestand hieronder of klik om te uploaden</li>
          </ol>
          <p className="text-[10px] text-zinc-600 mt-3">Werkt met elke taal — herkent Dutch & English kolomnamen automatisch</p>
        </div>

        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`rounded-3xl border-2 border-dashed p-12 mb-6 flex flex-col items-center cursor-pointer transition-all ${
            dragOver
              ? "border-blue-500 bg-blue-600/10"
              : "border-white/10 bg-[#111118] hover:border-white/20 hover:bg-white/2"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload size={30} className={`mb-3 ${dragOver ? "text-blue-400" : "text-zinc-700"}`} />
          {fileName ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-white">{fileName}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {parsed.length > 0
                  ? `${parsed.length} dagen gevonden · €${prevSpend.toFixed(2)} spend · ${prevClicks.toLocaleString()} clicks`
                  : "Geen herkende kolommen — check of het een Google Ads rapport CSV is"
                }
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-zinc-400">Sleep je Google Ads CSV hier naartoe</p>
              <p className="text-xs text-zinc-700 mt-1">of klik om een bestand te kiezen</p>
            </div>
          )}
        </div>

        {/* Preview & import */}
        {parsed.length > 0 && (
          <div className="rounded-3xl bg-[#111118] border border-white/8 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold">Preview — {prevDays} dagen</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {parsed[0]?.date} t/m {parsed[parsed.length - 1]?.date}
                  {" · "}€{prevSpend.toFixed(2)} spend
                  {" · "}{prevClicks.toLocaleString()} clicks
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setParsed([]); setFileName(""); }}
                  className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-zinc-400 transition flex items-center gap-1.5"
                >
                  <X size={12} /> Annuleer
                </button>
                <button
                  onClick={doImport}
                  disabled={importing}
                  className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold flex items-center gap-2 transition disabled:opacity-60"
                >
                  {importing
                    ? "Importeren..."
                    : <><Upload size={13} /> Importeer {prevDays} dagen</>
                  }
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Datum", "Spend", "Clicks", "Impressions", "CTR", "CPC"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] text-zinc-600 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 6).map((r, i) => (
                    <tr key={i} className="border-b border-white/4">
                      <td className="px-3 py-2 text-zinc-400">{r.date}</td>
                      <td className="px-3 py-2 font-semibold">€{r.spend.toFixed(2)}</td>
                      <td className="px-3 py-2">{r.clicks.toLocaleString()}</td>
                      <td className="px-3 py-2 text-zinc-500">{r.impressions.toLocaleString()}</td>
                      <td className="px-3 py-2 text-zinc-500">{r.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-zinc-400">€{r.cpc.toFixed(2)}</td>
                    </tr>
                  ))}
                  {parsed.length > 6 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-[10px] text-zinc-700">
                        +{parsed.length - 6} meer dagen…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {imported && (
          <div className="rounded-2xl bg-emerald-600/10 border border-emerald-500/20 px-5 py-3 mb-6 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
            <Check size={16} /> Data geïmporteerd! Dashboard bijgewerkt met je ad stats.
          </div>
        )}

        {/* Stats from DB */}
        {summary.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-5">
              {[
                { label: "Totale Spend (30d)", value: `€${totalSpend.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}` },
                { label: "Clicks", value: totalClicks.toLocaleString("nl-NL"), icon: <MousePointerClick size={13} className="text-blue-400" /> },
                { label: "Gem. CPC", value: `€${avgCpc.toFixed(2)}` },
                { label: "Gem. CTR", value: `${avgCtr.toFixed(2)}%`, icon: <TrendingUp size={13} className="text-emerald-400" /> },
              ].map(s => (
                <div key={s.label} className="rounded-2xl bg-[#111118] border border-white/8 p-4">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">{s.label}</p>
                  <div className="flex items-center gap-1.5">
                    {s.icon}
                    <p className="text-xl font-black">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-[#111118] border border-white/8 p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 size={14} className="text-blue-400" />
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Dagelijkse Ad Spend</h3>
                <span className="ml-auto text-[10px] text-zinc-700">{summary.length} dagen</span>
              </div>
              <div className="h-48 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...summary].reverse()} margin={{ left: -20, right: 10 }}>
                    <XAxis dataKey="date" stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis stroke="transparent" tick={{ fill: "#3f3f46", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "#0d0d13", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "#71717a" }} itemStyle={{ color: "#60a5fa" }}
                      formatter={(v: number) => [`€${v.toFixed(2)}`, "Spend"]}
                    />
                    <defs>
                      <linearGradient id="adsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="spend" stroke="#3b82f6" strokeWidth={2} fill="url(#adsGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="border-t border-white/5 pt-4">
                <div className="overflow-y-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {["Datum", "Spend", "Clicks", "Impressions", "CTR", "CPC", "Conv."].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-zinc-600 uppercase tracking-widest sticky top-0 bg-[#111118]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...summary].reverse().map((r, i) => (
                        <tr key={i} className="border-b border-white/4 hover:bg-white/2 transition">
                          <td className="px-3 py-2 text-zinc-400">{r.date}</td>
                          <td className="px-3 py-2 font-semibold">€{r.spend.toFixed(2)}</td>
                          <td className="px-3 py-2">{r.clicks.toLocaleString()}</td>
                          <td className="px-3 py-2 text-zinc-500">{r.impressions.toLocaleString()}</td>
                          <td className="px-3 py-2 text-zinc-500">{r.ctr.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-zinc-400">€{r.cpc.toFixed(2)}</td>
                          <td className="px-3 py-2 text-zinc-500">{r.conversions.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {summary.length === 0 && !loadingSummary && parsed.length === 0 && !imported && (
          <div className="rounded-3xl bg-[#111118] border border-white/8 p-16 flex flex-col items-center text-zinc-700">
            <BarChart3 size={36} className="mb-3 opacity-30" />
            <p className="text-sm">Nog geen ad data — upload een CSV hierboven</p>
          </div>
        )}
      </div>
    </div>
  );
}
