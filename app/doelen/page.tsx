"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Area, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { RefreshCw, Target } from "lucide-react";
import { nlDate } from "../lib/date";
import { MARTALINE_TARGETS, type DayTarget } from "../lib/martalineTargets";
import { DOREVY_TARGETS } from "../lib/dorevyTargets";
import { MELVOIRE_TARGETS } from "../lib/melvoireTargets";

const API = "https://sentinel-api.tssheets1.workers.dev";
const GOAL_ROAS = 2.5;

// Per winkel: doelen + winstformule. Nieuwe winkel = hier toevoegen. Sleutel = store_id in ecomts.
// ret = retourpercentage (Shopify returns / omzet na korting, laatste 60 dagen, gemeten 12 nov 2026).
// Een retour kost de omzet, de inkoop is meestal al betaald: winst = omzet × fee × (60% − ret) − spend.
const STORES: Record<string, { name: string; targets: DayTarget[] | null; fee: number; ret: number }> = {
  martaline: { name: "Martaline", targets: MARTALINE_TARGETS, fee: 0.965, ret: 0.06 },
  dorevy: { name: "Dorevy", targets: DOREVY_TARGETS, fee: 0.955, ret: 0.035 },
  ceofo: { name: "Melvoire", targets: MELVOIRE_TARGETS, fee: 0.955, ret: 0.03 },
  tumsie: { name: "Tumsie", targets: null, fee: 0.955, ret: 0.04 },
};
const MARGIN = 0.6;
const profitOf = (id: string, rev: number, spend: number) => rev * STORES[id].fee * (MARGIN - STORES[id].ret) - spend;
// Doelwinst per winkel opnieuw rekenen met retouren (de targets-bestanden rekenen zonder).
const targetProfit = (id: string, x: DayTarget) => (x.t == null || x.s == null ? null : profitOf(id, x.t, x.s));
const withRefunds = (id: string, ts: DayTarget[] | null) => (ts ? ts.map(x => ({ ...x, p: targetProfit(id, x) })) : null);
for (const id of Object.keys(STORES)) STORES[id].targets = withRefunds(id, STORES[id].targets);
const breakEven = (ids: string[]) => Math.max(...ids.map(id => 1 / (STORES[id].fee * (MARGIN - STORES[id].ret))));
const TOTAL = "totaal";
const sumN = (vals: (number | null)[]) => (vals.some(v => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
// Doelen van alle winkels per dag opgeteld (vorig jaar alleen Martaline, dus leeg bij totaal).
const TOTAL_TARGETS: DayTarget[] = MARTALINE_TARGETS.map(m => {
  const ts = Object.values(STORES).map(c => c.targets?.find(x => x.d === m.d) ?? null).filter(Boolean) as DayTarget[];
  return { d: m.d, ly: null, lyS: null, lyR: null, lo: sumN(ts.map(x => x.lo)), t: sumN(ts.map(x => x.t)), hi: sumN(ts.map(x => x.hi)), s: sumN(ts.map(x => x.s)), p: sumN(ts.map(x => x.p)) };
});

type TrendDay = { day: string; revenue: number; googleSpend: number; metaSpend: number; profit?: number };
type Row = DayTarget & { rev: number | null; spend: number | null; roas: number | null; profit: number | null };

const eur = (v: number | null | undefined, digits = 0) =>
  v == null || !isFinite(v) ? "–" : "€" + v.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const r2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("nl-NL", { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? "–" : Math.round(v * 100) + "%");
const dayLabel = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const pctColor = (p: number | null) =>
  p == null ? "text-slate-400" : p >= 1 ? "text-emerald-600 dark:text-emerald-400" : p >= 0.85 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

export default function DoelenPage() {
  const [storeId, setStoreId] = useState(TOTAL);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<string>("");
  const [error, setError] = useState("");
  const isTotal = storeId === TOTAL;
  const BREAK_EVEN_V = breakEven(isTotal ? Object.keys(STORES) : [storeId]);
  const cfg = isTotal ? { name: "Alle winkels", targets: TOTAL_TARGETS, fee: 0.96 } : { ...STORES[storeId], targets: STORES[storeId].targets ?? TOTAL_TARGETS };
  const [perStore, setPerStore] = useState<{ id: string; name: string; rev: number; spend: number }[]>([]);
  const today = nlDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const first = cfg.targets[0].d;
      const ids = isTotal ? Object.keys(STORES) : [storeId];
      const perId = await Promise.all(ids.map(async id => {
        const [all, now] = await Promise.all([
          fetch(`${API}/api/dashboard/overview?store_id=${id}&start=${first}&end=${today}`).then(r => r.json()),
          fetch(`${API}/api/dashboard/overview?store_id=${id}&start=${today}&end=${today}`).then(r => r.json()),
        ]);
        const t: TrendDay[] = Array.isArray(all?.revenueTrend) ? all.revenueTrend : [];
        if (!t.some(d => d.day === today) && now && typeof now.revenue === "number") {
          t.push({ day: today, revenue: now.netRevenue ?? now.revenue, googleSpend: now.googleAdSpend ?? now.adSpend ?? 0, metaSpend: now.metaAdSpend ?? 0 });
        }
        // winst per winkel met eigen fee, zodat het totaal klopt
        return { id, t: t.map(d => ({ ...d, profit: profitOf(id, d.revenue || 0, (d.googleSpend || 0) + (d.metaSpend || 0)) })) };
      }));
      const merged = new Map<string, TrendDay>();
      for (const { t } of perId) for (const d of t) {
        const m = merged.get(d.day) ?? { day: d.day, revenue: 0, googleSpend: 0, metaSpend: 0, profit: 0 };
        m.revenue += d.revenue || 0; m.googleSpend += d.googleSpend || 0; m.metaSpend += d.metaSpend || 0; m.profit = (m.profit ?? 0) + (d.profit ?? 0);
        merged.set(d.day, m);
      }
      setTrend([...merged.values()]);
      setPerStore(perId.map(({ id, t }) => {
        const tt = t.filter(d => d.day >= "2026-11-12" && d.day <= today);
        return { id, name: STORES[id].name, rev: tt.reduce((a, d) => a + (d.revenue || 0), 0), spend: tt.reduce((a, d) => a + (d.googleSpend || 0) + (d.metaSpend || 0), 0) };
      }));
      setUpdated(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setError("Kon de cijfers niet laden. Probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  }, [cfg, storeId, today, isTotal]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const rows: Row[] = useMemo(() => {
    const byDay = new Map(trend.map(d => [d.day, d]));
    return cfg.targets.map(t => {
      const a = t.d <= today ? byDay.get(t.d) : undefined;
      const rev = a ? a.revenue : null;
      const spend = a ? (a.googleSpend || 0) + (a.metaSpend || 0) : null;
      return {
        ...t,
        rev,
        spend,
        roas: rev != null && spend ? rev / spend : null,
        profit: a && a.profit != null ? a.profit : null,
      };
    });
  }, [trend, cfg, today]);

  const k = useMemo(() => {
    const sum = (rs: Row[], f: (r: Row) => number | null) => rs.reduce((s, r) => s + (f(r) ?? 0), 0);
    const todayRow = rows.find(r => r.d === today);
    const started = rows.filter(r => r.t != null && r.d <= today);
    const done = started.filter(r => r.d < today);
    const monday = (() => { const d = new Date(today + "T00:00:00Z"); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); })();
    const week = started.filter(r => r.d >= monday);
    const all = rows.filter(r => r.t != null);
    return {
      todayRow,
      weekRev: sum(week, r => r.rev), weekT: sum(week, r => r.t),
      cumRev: sum(started, r => r.rev), cumT: sum(started, r => r.t), cumLy: sum(started, r => r.ly),
      doneRev: sum(done, r => r.rev), doneT: sum(done, r => r.t),
      cumProfit: sum(started, r => r.profit), cumProfitT: sum(started, r => r.p),
      cumSpend: sum(started, r => r.spend),
      totalT: sum(all, r => r.t), totalP: sum(all, r => r.p),
      rest: sum(all.filter(r => r.d > today), r => r.t),
    };
  }, [rows, today]);

  const chart = rows.map(r => ({
    label: dayLabel(r.d),
    d: r.d,
    werkelijk: r.rev,
    doel: r.t,
    band: r.lo != null && r.hi != null ? [r.lo, r.hi] : null,
    vorigJaar: r.ly,
  }));

  const tr = k.todayRow;
  const todayPct = tr && tr.t ? (tr.rev ?? 0) / tr.t : null;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-violet-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dagdoelen nov – dec</h1>
            <p className="text-sm text-slate-500">Elke dag een omzetdoel. Groen = doel gehaald. Ververst elke 5 minuten{updated ? ` (laatst ${updated})` : ""}.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[[TOTAL, { name: "Alle winkels" }] as const, ...Object.entries(STORES)].map(([id, s]) => (
            <button key={id} onClick={() => setStoreId(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${id === storeId ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
              {s.name}
            </button>
          ))}
          <button onClick={load} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800" aria-label="Ververs">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && <div className="card p-4 text-red-600">{error}</div>}
      {!isTotal && !STORES[storeId].targets && <div className="card p-3 text-sm text-slate-500">{cfg.name} heeft nog geen eigen dagdoelen: het doel hieronder is dat van alle winkels samen. Kijk vooral naar de werkelijke omzet.</div>}
      {isTotal && perStore.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-2">Per winkel sinds 12 nov (EUR)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {perStore.map(p => (
              <button key={p.id} onClick={() => setStoreId(p.id)} className="text-left rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <div className="text-slate-500">{p.name}</div>
                <div className="text-xl font-bold text-slate-900 dark:text-white">{eur(p.rev)}</div>
                <div className="text-xs text-slate-500">spend {eur(p.spend)} · ROAS {r2(p.spend ? p.rev / p.spend : null)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile title="Vandaag" big={eur(tr?.rev ?? 0)} sub={`doel ${eur(tr?.t)} (${eur(tr?.lo)}–${eur(tr?.hi)})`}
          extra={<span className={pctColor(todayPct)}>{pct(todayPct)} van doel · spend {eur(tr?.spend)} / doel {eur(tr?.s)}</span>} />
        <Tile title="Deze week" big={eur(k.weekRev)} sub={`doel ${eur(k.weekT)}`}
          extra={<span className={pctColor(k.weekT ? k.weekRev / k.weekT : null)}>{pct(k.weekT ? k.weekRev / k.weekT : null)} van doel</span>} />
        <Tile title="Sinds 12 nov" big={eur(k.cumRev)} sub={`doel ${eur(k.cumT)}${k.cumLy ? ` · vorig jaar ${eur(k.cumLy)}` : ""}`}
          extra={<span className={pctColor(k.doneT ? k.doneRev / k.doneT : null)}>t/m gisteren {pct(k.doneT ? k.doneRev / k.doneT : null)} van doel · ×{r2(k.cumLy ? k.cumRev / k.cumLy : null)} vorig jaar</span>} />
        <Tile title="Winst sinds 12 nov" big={eur(k.cumProfit)} sub={`doel ${eur(k.cumProfitT)} · ROAS ${r2(k.cumSpend ? k.cumRev / k.cumSpend : null)} (doel ${r2(GOAL_ROAS)})`}
          extra={<span className="text-slate-500">Totaal doel 12 nov–31 dec: {eur(k.totalT)} omzet, {eur(k.totalP)} winst. Nog te gaan: {eur(k.rest)}</span>} />
      </div>

      <div className="card p-4">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Omzet per dag: werkelijk tegenover doel</h2>
        <p className="text-xs text-slate-500 mb-3">Balk = werkelijk (netto). Paarse lijn = doel, vlak = bandbreedte. Grijs = vorig jaar zelfde weekdag.</p>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={6} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => "€" + Math.round(v / 100) / 10 + "k"} width={50} />
              <Tooltip formatter={(v: unknown) => Array.isArray(v) ? `${eur(v[0])}–${eur(v[1])}` : eur(v as number)} />
              <Legend />
              <Area dataKey="band" name="Band" fill="#8b5cf6" fillOpacity={0.12} stroke="none" connectNulls={false} />
              <Bar dataKey="werkelijk" name="Werkelijk" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Line dataKey="doel" name="Doel" stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls={false} />
              <Line dataKey="vorigJaar" name="Vorig jaar" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Elke dag</h2>
        <p className="text-xs text-slate-500 mb-3">ROAS onder {r2(BREAK_EVEN_V)} = verlies, doel {r2(GOAL_ROAS)}. Winst = omzet × fee × (60% marge − retouren) − spend; retouren {isTotal ? "per winkel (Martaline 6%, Dorevy 3,5%, Melvoire 3%, Tumsie 4%)" : (STORES[storeId].ret * 100).toLocaleString("nl-NL") + "%"}. Alles in EUR.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-3">Dag</th>
              <th className="py-2 px-2 text-right">Vorig jaar</th>
              <th className="py-2 px-2 text-right">Doel (band)</th>
              <th className="py-2 px-2 text-right">Werkelijk</th>
              <th className="py-2 px-2 text-right">% doel</th>
              <th className="py-2 px-2 text-right">Spend / doel</th>
              <th className="py-2 px-2 text-right">ROAS</th>
              <th className="py-2 px-2 text-right">Winst / doel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const p = r.t && r.rev != null ? r.rev / r.t : null;
              const isToday = r.d === today;
              return (
                <tr key={r.d} className={`border-b border-slate-100 dark:border-slate-800 ${isToday ? "bg-violet-50 dark:bg-violet-900/20 font-semibold" : ""} ${r.d > today ? "text-slate-400" : ""}`}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{dayLabel(r.d)}{isToday ? " · vandaag" : ""}</td>
                  <td className="py-1.5 px-2 text-right">{eur(r.ly)}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{r.t != null ? <>{eur(r.t)} <span className="text-xs text-slate-400">({eur(r.lo)}–{eur(r.hi)})</span></> : "–"}</td>
                  <td className="py-1.5 px-2 text-right">{eur(r.rev)}</td>
                  <td className={`py-1.5 px-2 text-right ${r.t ? pctColor(p) : ""}`}>{r.t ? pct(p) : ""}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{eur(r.spend)} / {eur(r.s)}</td>
                  <td className={`py-1.5 px-2 text-right ${r.roas == null ? "" : r.roas >= GOAL_ROAS ? "text-emerald-600 dark:text-emerald-400" : r.roas < BREAK_EVEN_V ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{r2(r.roas)}</td>
                  <td className={`py-1.5 px-2 text-right whitespace-nowrap ${r.profit != null && r.profit < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{eur(r.profit)} / {eur(r.p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ title, big, sub, extra }: { title: string; big: string; sub: string; extra?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{big}</div>
      <div className="text-sm text-slate-500 mt-1">{sub}</div>
      {extra && <div className="text-xs mt-2">{extra}</div>}
    </div>
  );
}
