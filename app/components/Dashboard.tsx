"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Box, CheckCircle,
  RefreshCw, RotateCcw, ShieldAlert, TrendingUp,
  ArrowUpRight, ArrowDownRight, Lightbulb, Skull,
  Target, Zap,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DateRangePicker, DateRange, initRange, toQueryString } from "./DateRangePicker";

const API = "https://sentinel-api.tssheets1.workers.dev";

const STORES = [
  { key: "all",       name: "All Stores", domain: "" },
  { key: "ceofo",     name: "Melvoire",   domain: "c4r0ex-0k.myshopify.com" },
  { key: "martaline", name: "Martaline",  domain: "cqb72v-if.myshopify.com" },
  { key: "dorevy",    name: "Dorevy",     domain: "gfauyv-wi.myshopify.com" },
];
const REAL_STORES = STORES.filter(s => s.key !== "all");

// Per-store country config — same as ROAS tracker
const STORE_COUNTRIES: Record<string, { code: string; name: string; flag: string }[]> = {
  ceofo:     [{ code: "FR", name: "France", flag: "🇫🇷" }, { code: "ES", name: "Spain", flag: "🇪🇸" }, { code: "IT", name: "Italy", flag: "🇮🇹" }],
  dorevy:    [{ code: "UK", name: "United Kingdom", flag: "🇬🇧" }],
  martaline: [],
};

function getCountries(storeId: string) {
  return STORE_COUNTRIES[storeId] ?? [];
}

type Overview = {
  revenue: number; grossRevenue: number; netRevenue: number; orders: number;
  adSpend: number; googleAdSpend: number; metaAdSpend: number; productCost: number; profit: number;
  aov: number; roas: number; breakEvenRoas: number | null;
  returnAmount: number; returnCount: number; returnRate: number;
  disputeAmount: number; disputeCount: number;
  cpc: number; ctr: number; clicks: number; impressions: number;
  googleRevenue: number; facebookRevenue: number;
  googleRoas: number; metaRoas: number;
  googleProfit: number; metaProfit: number;
  revenueIsEstimated?: boolean;
  revenueTrend: { day: string; revenue: number; profit: number; googleSpend?: number; metaSpend?: number }[];
};

type ProductAlert = { id: string; product_title: string; message: string; severity: string; alert_type?: string };
type TopProduct   = { product_title: string; variant_title?: string; sold: number; revenue: number; profit: number };
type MilestoneData = { totalThisMonth: number; next: number | null; reached: number[] };

function fmt(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MILESTONES_LIST = [5, 10, 20, 50, 100, 200, 500, 1000];

export default function Dashboard({ activeStoreId }: { activeStoreId?: string }) {
  const [storeId,    setStoreId]    = useState(activeStoreId || "ceofo");
  const [country,    setCountry]    = useState("");           // "" = all countries
  const [dateRange,  setDateRange]  = useState<DateRange>(initRange("30d"));
  const [loading,    setLoading]    = useState(false);
  const [scanning,   setScanning]   = useState(false);
  const [overview,      setOverview]      = useState<Overview | null>(null);
  const [alerts,        setAlerts]        = useState<ProductAlert[]>([]);
  const [products,      setProducts]      = useState<TopProduct[]>([]);
  const [milestones,    setMilestones]    = useState<MilestoneData | null>(null);
  const [error,         setError]         = useState("");
  const [storeBreakdown, setStoreBreakdown] = useState<{ key: string; name: string; ov: Overview }[]>([]);
  const [spendInput,    setSpendInput]    = useState("");
  const [spendEditing,  setSpendEditing]  = useState(false);
  const [spendSaving,   setSpendSaving]   = useState(false);
  const [adChannel,     setAdChannel]     = useState<"combined" | "google" | "meta">("combined");
  const [campaign,      setCampaign]      = useState<string>("");
  const [campaigns,     setCampaigns]     = useState<string[]>([]);
  const [metaSpendInput,   setMetaSpendInput]   = useState("");
  const [metaSpendEditing, setMetaSpendEditing] = useState(false);
  const [metaSpendSaving,  setMetaSpendSaving]  = useState(false);

  async function saveSpend() {
    const val = parseFloat(spendInput.replace(",", "."));
    if (!val || isNaN(val) || val <= 0) return;
    setSpendSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${API}/api/ads/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true, rows: [{ store_id: storeId, date: today, country: "", spend: val, clicks: 0, impressions: 0, conversions: 0, cpc: 0, ctr: 0, roas: 0 }] }),
    });
    setSpendEditing(false); setSpendInput(""); setSpendSaving(false);
    loadData();
  }

  async function saveMetaSpend() {
    const val = parseFloat(metaSpendInput.replace(",", "."));
    if (!val || isNaN(val) || val <= 0) return;
    setMetaSpendSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${API}/api/meta/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true, rows: [{ store_id: storeId, date: today, country: "", spend: val }] }),
    });
    setMetaSpendEditing(false); setMetaSpendInput(""); setMetaSpendSaving(false);
    loadData();
  }

  async function loadData() {
    try {
      setLoading(true); setError("");
      const dq = toQueryString(dateRange);

      if (storeId === "all") {
        // Fetch all stores in parallel and aggregate
        const results = await Promise.all(
          REAL_STORES.map(s =>
            fetch(`${API}/api/dashboard/overview?store_id=${s.key}&${dq}`, { cache: "no-store" })
              .then(r => r.json())
              .then(ov => ({ key: s.key, name: s.name, ov }))
          )
        );
        setStoreBreakdown(results);

        // Aggregate
        const totalRevenue = results.reduce((s, r) => s + (r.ov.netRevenue ?? r.ov.revenue ?? 0), 0);
        const totalGross   = results.reduce((s, r) => s + (r.ov.grossRevenue ?? r.ov.revenue ?? 0), 0);
        const totalCost    = results.reduce((s, r) => s + (r.ov.productCost ?? 0), 0);
        const totalAds     = results.reduce((s, r) => s + (r.ov.adSpend ?? 0), 0);
        const totalOrders  = results.reduce((s, r) => s + (r.ov.orders ?? 0), 0);
        const totalReturn  = results.reduce((s, r) => s + (r.ov.returnAmount ?? 0), 0);
        const totalReturnC = results.reduce((s, r) => s + (r.ov.returnCount ?? 0), 0);
        const totalProfit  = totalRevenue - totalCost - totalAds;
        const totalRoas    = totalAds > 0 ? totalRevenue / totalAds : 0;
        const beRoas       = totalRevenue > 0 ? totalRevenue / (totalRevenue - totalCost) : null;

        // Merge daily trend (sum by day)
        const trendMap = new Map<string, { revenue: number; profit: number }>();
        for (const { ov } of results) {
          for (const pt of ov.revenueTrend ?? []) {
            const ex = trendMap.get(pt.day) ?? { revenue: 0, profit: 0 };
            trendMap.set(pt.day, { revenue: ex.revenue + pt.revenue, profit: ex.profit + pt.profit });
          }
        }
        const revenueTrend = [...trendMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, v]) => ({ day, ...v }));

        const totalGoogleAds = results.reduce((s, r) => s + (r.ov.googleAdSpend ?? 0), 0);
        const totalMetaAds   = results.reduce((s, r) => s + (r.ov.metaAdSpend ?? 0), 0);
        setOverview({
          revenue: totalRevenue, grossRevenue: totalGross, netRevenue: totalRevenue,
          orders: totalOrders, adSpend: totalAds, googleAdSpend: totalGoogleAds, metaAdSpend: totalMetaAds,
          productCost: totalCost,
          profit: totalProfit, aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          roas: totalRoas, breakEvenRoas: beRoas,
          returnAmount: totalReturn, returnCount: totalReturnC,
          returnRate: totalOrders > 0 ? (totalReturnC / totalOrders) * 100 : 0,
          disputeAmount: 0, disputeCount: 0, cpc: 0, ctr: 0, clicks: 0, impressions: 0,
          googleRevenue: 0, facebookRevenue: 0, googleRoas: 0, metaRoas: 0, googleProfit: 0, metaProfit: 0,
          revenueTrend,
        });
        setAlerts([]); setProducts([]); setMilestones(null);
        return;
      }

      setStoreBreakdown([]);
      const cc   = country  ? `&country=${country}`   : "";
      const camp = campaign ? `&campaign=${encodeURIComponent(campaign)}` : "";
      const q    = `store_id=${storeId}&${dq}${cc}${camp}`;
      const [ov, al, pr, ms, campaignsRes] = await Promise.all([
        fetch(`${API}/api/dashboard/overview?${q}`,           { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/product-alerts?store_id=${storeId}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/products/top?${q}`,                 { cache: "no-store" }).then(r => r.json()),
        fetch(`${API}/api/milestones?store_id=${storeId}`,    { cache: "no-store" }).then(r => r.json()).catch(() => null),
        fetch(`${API}/api/ads/campaigns?store_id=${storeId}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({ campaigns: [] })),
      ]);
      setOverview(ov);
      setAlerts(al.alerts || []);
      setProducts(pr.products || []);
      if (ms && !ms.error) setMilestones(ms);
      if (campaignsRes?.campaigns) setCampaigns(campaignsRes.campaigns);
    } catch (e) {
      console.error(e); setError("Could not load dashboard data.");
    } finally { setLoading(false); }
  }

  async function scanAlerts() {
    setScanning(true);
    await fetch(`${API}/api/alerts/scan-products?store_id=${storeId}`, { cache: "no-store" });
    await loadData();
    setScanning(false);
  }

  useEffect(() => { if (activeStoreId) setStoreId(activeStoreId); }, [activeStoreId]);
  useEffect(() => { setCountry(""); setCampaign(""); }, [storeId]);
  useEffect(() => { loadData(); }, [storeId, country, campaign, dateRange]); // eslint-disable-line

  const ov           = overview;
  const countries    = getCountries(storeId);
  const multiCountry = countries.length > 0;
  const grossRevenue = ov?.grossRevenue ?? ov?.revenue ?? 0;
  const netRevTotal  = ov?.netRevenue   ?? ov?.revenue ?? 0;
  const orders       = ov?.orders       ?? 0;
  const googleAdSpend = ov?.googleAdSpend ?? 0;
  const metaAdSpend   = ov?.metaAdSpend  ?? 0;
  const totalAdSpend  = ov?.adSpend      ?? 0;
  const returnAmount = ov?.returnAmount ?? 0;
  const returnCount  = ov?.returnCount  ?? 0;
  const cpc          = ov?.cpc          ?? 0;
  const ctr          = ov?.ctr          ?? 0;
  const clicks       = ov?.clicks       ?? 0;
  const hasMetaData   = metaAdSpend > 0;
  const hasGoogleData = googleAdSpend > 0;
  const hasChannelSplit = hasMetaData || hasGoogleData;
  const revenueIsEstimated = ov?.revenueIsEstimated ?? false;

  // Per-channel derived values
  const googleRevenue  = ov?.googleRevenue   ?? 0;
  const facebookRevenue = ov?.facebookRevenue ?? 0;
  const googleRoas     = ov?.googleRoas       ?? 0;
  const metaRoas       = ov?.metaRoas         ?? 0;
  const googleProfit   = ov?.googleProfit     ?? 0;
  const metaProfit     = ov?.metaProfit       ?? 0;

  // Active channel view
  const revenue = adChannel === "google" ? googleRevenue
    : adChannel === "meta" ? facebookRevenue
    : netRevTotal;
  const adSpend = adChannel === "google" ? googleAdSpend
    : adChannel === "meta" ? metaAdSpend
    : totalAdSpend;
  const profit = adChannel === "google" ? googleProfit
    : adChannel === "meta" ? metaProfit
    : (ov?.profit ?? 0);
  const roas = adChannel === "google" ? googleRoas
    : adChannel === "meta" ? metaRoas
    : (ov?.roas ?? 0);
  const aov          = orders > 0 ? revenue / orders : 0;
  const margin       = revenue > 0 ? (profit / revenue) * 100 : 0;
  const breakEvenRoas        = ov?.breakEvenRoas ?? null;
  const roasVsBreakEven      = breakEvenRoas && adSpend > 0 ? roas / breakEvenRoas : null;
  const isProfitable         = roasVsBreakEven != null && roasVsBreakEven >= 1;
  const chartData            = ov?.revenueTrend?.length ? ov.revenueTrend : [{ day: "—", revenue: 0, profit: 0 }];
  const activeStore          = STORES.find(s => s.key === storeId);

  const actionableAlerts = alerts.filter(
    a => a.alert_type !== "WATCH_PRODUCT" && a.alert_type !== "NEW_PRODUCT"
  );

  const thisMonth       = milestones?.totalThisMonth ?? 0;
  const nextMilestone   = milestones?.next ?? MILESTONES_LIST[0];
  const milestoneProgress = nextMilestone > 0 ? Math.min((thisMonth / nextMilestone) * 100, 100) : 100;

  function changeStore(id: string) {
    setStoreId(id);
    setCountry("");
    window.history.pushState({}, "", `/?store_id=${id}`);
  }

  return (
    <div className="px-8 py-7 min-h-screen max-w-[1400px]">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-1.5">Active store</p>
          <div className="flex items-center gap-3">
            <select
              value={storeId}
              onChange={e => changeStore(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm font-mono font-semibold text-slate-200 min-w-[160px] cursor-pointer focus:outline-none"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)" }}
            >
              {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            <span className="text-[11px] text-zinc-400">{activeStore?.domain}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={loadData}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 transition" style={{background:"rgba(34,211,238,0.05)",border:"1px solid rgba(34,211,238,0.1)"}}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          {storeId !== "all" && (
            <button
              onClick={scanAlerts}
              className="h-9 px-4 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition" style={{background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.25)",color:"#22d3ee"}}
            >
              <Bell size={13} />{scanning ? "Scanning…" : "Scan Alerts"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* ── Country tabs (multi-country stores only) ───────────── */}
      {multiCountry && (
        <div className="flex items-center gap-1.5 mb-6">
          <button
            onClick={() => setCountry("")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
            style={country === ""
              ? { background: "#22d3ee", color: "#020408", border: "1px solid #22d3ee", boxShadow: "0 0 12px rgba(34,211,238,0.3)" }
              : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
          >
            🌍 All
          </button>
          {countries.map(c => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
              style={country === c.code
                ? { background: "#22d3ee", color: "#020408", border: "1px solid #22d3ee", boxShadow: "0 0 12px rgba(34,211,238,0.3)" }
                : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
          {country !== "" && (
            <span className="ml-2 text-[10px] text-zinc-400">
              Showing revenue & ads for {countries.find(c => c.code === country)?.name}
            </span>
          )}
        </div>
      )}

      {/* ── Milestone bar ──────────────────────────────────────── */}
      {milestones && (
        <div className="card px-5 py-4 mb-6 flex items-center gap-5">
          <div className="shrink-0">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">This month</p>
            <p className="text-2xl font-black mt-0.5 text-white font-mono tabular-nums">
              {thisMonth}
              <span className="text-sm font-normal text-zinc-400 ml-1.5">orders</span>
            </p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1.5">
              <span>{thisMonth} reached</span>
              <span>Next milestone: {nextMilestone}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.06)"}}>
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-700"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 flex gap-1">
            {MILESTONES_LIST.map(m => (
              <div
                key={m}
                className={`text-[10px] font-mono px-2 py-1 rounded-md font-bold transition-all ${
                  thisMonth >= m
                    ? "text-cyan-400 font-bold"
                    : "text-slate-600"
                }`}
              >
                {m}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Channel toggle ─────────────────────────────────────── */}
      {storeId !== "all" && (
        <div className="flex items-center gap-1.5 mb-6">
          <button
            onClick={() => setAdChannel("combined")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
            style={adChannel === "combined"
              ? { background: "#22d3ee", color: "#020408", border: "1px solid #22d3ee", boxShadow: "0 0 12px rgba(34,211,238,0.3)" }
              : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
          >
            Combined
          </button>
          <button
            onClick={() => setAdChannel("google")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
            style={adChannel === "google"
              ? { background: "#4285F4", color: "#fff", border: "1px solid #4285F4", boxShadow: "0 0 12px rgba(66,133,244,0.3)" }
              : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" className="shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google{googleAdSpend > 0 && <span className="opacity-60">€{fmt(googleAdSpend)}</span>}
          </button>
          <button
            onClick={() => setAdChannel("meta")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
            style={adChannel === "meta"
              ? { background: "#1877F2", color: "#fff", border: "1px solid #1877F2", boxShadow: "0 0 12px rgba(24,119,242,0.3)" }
              : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className="shrink-0">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
            Meta{metaAdSpend > 0 && <span className="opacity-60">€{fmt(metaAdSpend)}</span>}
          </button>
          {adChannel !== "combined" && (
            <span className="ml-2 text-[10px] text-zinc-400">
              {revenueIsEstimated ? "Revenue is spend-weighted estimate — UTM attribution not yet available" : "Revenue attributed via UTM"}
            </span>
          )}
        </div>
      )}

      {/* ── Campaign filter (Google only, when campaigns exist) ───── */}
      {storeId !== "all" && adChannel === "google" && campaigns.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 -mt-2">
          <span className="text-[10px] text-zinc-400 mr-1">Campaign:</span>
          <button
            onClick={() => setCampaign("")}
            className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition-all"
            style={campaign === ""
              ? { background: "#22d3ee", color: "#020408", border: "1px solid #22d3ee" }
              : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
          >
            All
          </button>
          {campaigns.map(c => (
            <button
              key={c}
              onClick={() => setCampaign(c === campaign ? "" : c)}
              className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition-all"
              style={campaign === c
                ? { background: "#22d3ee", color: "#020408", border: "1px solid #22d3ee" }
                : { background: "rgba(34,211,238,0.04)", color: "#64748b", border: "1px solid rgba(34,211,238,0.1)" }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* ── Primary KPIs ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <KpiCard
          label={adChannel === "google" ? "Revenue — Google (UTM)" : adChannel === "meta" ? "Revenue — Meta (UTM)" : "Net Revenue"}
          value={`€${fmt(revenue)}`}
          sub={adChannel === "combined"
            ? (returnAmount > 0 ? `Gross €${fmt(grossRevenue)} − €${fmt(returnAmount)} returns` : `AOV €${fmt(aov)}`)
            : revenueIsEstimated
              ? `~estimated (${((revenue / (netRevTotal || 1)) * 100).toFixed(0)}% spend share) · no UTM data yet`
              : `UTM attributed · ${((revenue / (netRevTotal || 1)) * 100).toFixed(0)}% of total`}
          accent="blue"
          loading={loading}
        />
        <KpiCard
          label={adChannel === "google" ? "Profit — Google" : adChannel === "meta" ? "Profit — Meta" : "Net Profit"}
          value={`€${fmt(profit)}`}
          sub={`${margin.toFixed(1)}% margin${adChannel === "combined" ? ` · €${orders > 0 ? fmt(profit / orders) : "0"}/order` : ""}`}
          trend={profit > 0 ? "up" : profit < 0 ? "down" : undefined}
          accent={profit > 0 ? "green" : profit < 0 ? "red" : "gray"}
          loading={loading}
        />
        <KpiCard
          label={adChannel === "google" ? "ROAS — Google" : adChannel === "meta" ? "ROAS — Meta" : "ROAS"}
          value={adSpend > 0 ? `${roas.toFixed(2)}×` : "—"}
          sub={adSpend > 0 ? `€${fmt(adSpend)} spend` : "Ads not connected"}
          trend={adSpend > 0 && breakEvenRoas ? (isProfitable ? "up" : "down") : undefined}
          accent={adSpend > 0 && breakEvenRoas ? (isProfitable ? "green" : "red") : "gray"}
          loading={loading}
        />
      </div>

      {/* ── Secondary metrics ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Orders"
          value={orders.toString()}
          sub={`${dateRange.start} → ${dateRange.end}`}
          loading={loading}
        />
        <div
          className="rounded-2xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #070F22 0%, #060C1A 100%)", border: "1px solid rgba(34,211,238,0.1)" }}
        >
          <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent)" }} />
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono uppercase" style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#475569" }}>Ad Spend</p>
          </div>
          {loading ? <div className="h-6 w-20 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} /> : (
            <>
              {/* Channel rows */}
              <div className="space-y-1.5 mb-2">
                {/* Google row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-[10px] font-mono text-slate-500">Google</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {storeId !== "all" && !spendEditing && (
                      <button onClick={() => { setSpendEditing(true); setSpendInput(""); }}
                        className="text-[10px] text-blue-400 hover:text-blue-600">✎</button>
                    )}
                    {spendEditing ? (
                      <div className="flex gap-0.5 items-center">
                        <span className="text-[10px] font-mono text-slate-500">€</span>
                        <input autoFocus type="text" value={spendInput} onChange={e => setSpendInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveSpend(); if (e.key === "Escape") setSpendEditing(false); }}
                          className="w-16 text-[10px] border border-cyan-600 rounded px-1 py-0.5 outline-none bg-zinc-800 text-zinc-100" />
                        <button onClick={saveSpend} disabled={spendSaving}
                          className="text-[10px] bg-cyan-500 text-white px-1.5 py-0.5 rounded disabled:opacity-50">
                          {spendSaving ? "…" : "OK"}
                        </button>
                        <button onClick={() => setSpendEditing(false)} className="text-[10px] font-mono text-slate-500">✕</button>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-zinc-100">{googleAdSpend > 0 ? `€${fmt(googleAdSpend)}` : "—"}</span>
                    )}
                  </div>
                </div>
                {/* Meta row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="#1877F2">
                      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
                    </svg>
                    <span className="text-[10px] font-mono text-slate-500">Meta</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {storeId !== "all" && !metaSpendEditing && (
                      <button onClick={() => { setMetaSpendEditing(true); setMetaSpendInput(""); }}
                        className="text-[10px] text-blue-400 hover:text-blue-600">✎</button>
                    )}
                    {metaSpendEditing ? (
                      <div className="flex gap-0.5 items-center">
                        <span className="text-[10px] font-mono text-slate-500">€</span>
                        <input autoFocus type="text" value={metaSpendInput} onChange={e => setMetaSpendInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveMetaSpend(); if (e.key === "Escape") setMetaSpendEditing(false); }}
                          className="w-16 text-[10px] border border-cyan-600 rounded px-1 py-0.5 outline-none bg-zinc-800 text-zinc-100" />
                        <button onClick={saveMetaSpend} disabled={metaSpendSaving}
                          className="text-[10px] bg-cyan-500 text-white px-1.5 py-0.5 rounded disabled:opacity-50">
                          {metaSpendSaving ? "…" : "OK"}
                        </button>
                        <button onClick={() => setMetaSpendEditing(false)} className="text-[10px] font-mono text-slate-500">✕</button>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-zinc-100">{metaAdSpend > 0 ? `€${fmt(metaAdSpend)}` : "—"}</span>
                    )}
                  </div>
                </div>
              </div>
              {totalAdSpend > 0 && (
                <div className="pt-1.5" style={{ borderTop: "1px solid rgba(34,211,238,0.08)" }}>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono tracking-widest" style={{ color: "#475569" }}>TOTAL</span>
                    <span className="text-base font-black tabular-nums" style={{ color: "#e2e8f0" }}>€{fmt(totalAdSpend)}</span>
                  </div>
                </div>
              )}
              {cpc > 0 && <p className="text-[9px] font-mono mt-1" style={{ color: "#475569" }}>CPC €{cpc.toFixed(2)} · CTR {ctr.toFixed(2)}%</p>}
            </>
          )}
        </div>
        <StatCard
          label="Returns"
          value={returnCount > 0 ? `${returnCount}× · €${fmt(returnAmount)}` : "None"}
          sub={returnCount > 0 ? "Deducted from revenue" : "No returns this period"}
          trend={returnCount > 0 ? "down" : undefined}
          loading={loading}
        />

        {/* Break-even ROAS card */}
        <div
          className="rounded-2xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #070F22 0%, #060C1A 100%)", border: "1px solid rgba(34,211,238,0.1)" }}
        >
          <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent)" }} />
          <p className="font-mono uppercase mb-2" style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#475569" }}>Break-even ROAS</p>
          {loading ? (
            <div className="h-6 w-16 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }} />
          ) : breakEvenRoas ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-xl font-black tabular-nums" style={{ color: "#e2e8f0" }}>{breakEvenRoas.toFixed(2)}×</span>
                {adSpend > 0 && (
                  <span className={`text-xs font-mono font-bold mb-0.5 ${isProfitable ? "text-emerald-400" : "text-red-400"}`}>
                    {isProfitable ? "✓ Profitable" : "✗ Below"}
                  </span>
                )}
              </div>
              {adSpend > 0 && (
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className={`h-full rounded-full transition-all ${isProfitable ? "bg-emerald-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min((roasVsBreakEven ?? 0) * 50, 100)}%` }}
                  />
                </div>
              )}
              <p className="font-mono mt-1.5 tracking-wide" style={{ fontSize: "9px", color: "#475569" }}>Based on product costs</p>
            </>
          ) : (
            <>
              <p className="text-xl font-black" style={{ color: "#334155" }}>—</p>
              <p className="mt-1" style={{ fontSize: "10px", color: "#475569" }}>Set product costs to calculate</p>
            </>
          )}
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={14} className="text-cyan-400" />
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Revenue &amp; Profit Trend</h3>
          <div className="ml-auto flex items-center gap-4 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Net Profit
            </span>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="transparent" tick={{ fill: "#71717a", fontSize: 10 }} />
              <YAxis stroke="transparent" tick={{ fill: "#71717a", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "#060D1A",
                  border: "1px solid rgba(34,211,238,0.15)",
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
                }}
                labelStyle={{ color: "#22d3ee", fontWeight: 600 }}
                formatter={(v: number, name: string) => [
                  `€${v.toFixed(2)}`,
                  name === "revenue" ? "Revenue" : "Net Profit",
                ]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={2}  fill="url(#revGrad)"  dot={false} />
              <Area type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={1.5} fill="url(#profGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── All-stores breakdown ───────────────────────────────── */}
      {storeId === "all" && storeBreakdown.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={13} className="text-violet-400" />
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Per Store</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  <th className="text-left pb-2 pr-6 font-semibold">Store</th>
                  <th className="text-right pb-2 px-4 font-semibold">Orders</th>
                  <th className="text-right pb-2 px-4 font-semibold">Revenue</th>
                  <th className="text-right pb-2 px-4 font-semibold">COG</th>
                  <th className="text-right pb-2 px-4 font-semibold">Ad Spend</th>
                  <th className="text-right pb-2 px-4 font-semibold">Profit</th>
                  <th className="text-right pb-2 pl-4 font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {storeBreakdown.map(({ key, name, ov: sov }) => {
                  const sRev    = sov.netRevenue ?? sov.revenue ?? 0;
                  const sCog    = sov.productCost ?? 0;
                  const sAds    = sov.adSpend ?? 0;
                  const sProfit = sov.profit ?? (sRev - sCog - sAds);
                  const sRoas   = sov.roas ?? (sAds > 0 ? sRev / sAds : 0);
                  return (
                    <tr key={key} className="hover:bg-cyan-500/5 transition-colors">
                      <td className="py-3 pr-6 font-semibold text-slate-300">{name}</td>
                      <td className="py-3 px-4 text-right text-slate-400">{sov.orders ?? 0}</td>
                      <td className="py-3 px-4 text-right text-slate-300 font-medium tabular-nums">€{fmt(sRev)}</td>
                      <td className="py-3 px-4 text-right text-slate-500 tabular-nums">€{fmt(sCog)}</td>
                      <td className="py-3 px-4 text-right text-slate-500 tabular-nums">€{fmt(sAds)}</td>
                      <td className={`py-3 px-4 text-right font-bold font-mono ${sProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        €{fmt(sProfit)}
                      </td>
                      <td className="py-3 pl-4 text-right text-slate-400">
                        {sAds > 0 ? `${sRoas.toFixed(2)}×` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bottom: Products + Alerts ──────────────────────────── */}
      {storeId !== "all" && (
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Top Products */}
        <div className="col-span-3 card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Box size={13} className="text-cyan-400" />
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Top Products</h3>
            <span className="ml-auto text-[10px] text-zinc-400">
              {dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} → ${dateRange.end}`}
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-zinc-800/60 animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <Empty icon={<Box size={22} />} label="No sales in this period" />
          ) : (
            <div className="space-y-0.5 overflow-y-auto flex-1">
              {products.slice(0, 8).map((p, i) => {
                const pct = (p.revenue / (products[0]?.revenue || 1)) * 100;
                const m   = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                return (
                  <div key={i} className="relative group rounded-xl px-3 py-2.5 hover:bg-cyan-500/5 transition-colors">
                    <div
                      className="absolute inset-y-0 left-0 rounded-xl bg-cyan-500/5"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span className="text-[10px] text-slate-600 w-4 text-right shrink-0 font-mono font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-300 truncate">{p.product_title}</p>
                        {p.variant_title && (
                          <p className="text-[10px] text-slate-500 truncate">{p.variant_title}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold tabular-nums text-slate-200">€{fmt(p.revenue)}</p>
                        <p className="text-[10px] font-mono text-slate-500">{p.sold}× · {m.toFixed(0)}% margin</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="col-span-2 card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={13} className="text-amber-400" />
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Alerts</h3>
            {actionableAlerts.length > 0 && (
              <span className="ml-auto text-[10px] font-mono text-amber-400 px-2 py-0.5 rounded-full font-bold" style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.2)"}}>
                {actionableAlerts.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-zinc-800/60 animate-pulse" />
              ))}
            </div>
          ) : actionableAlerts.length === 0 ? (
            <Empty icon={<CheckCircle size={22} className="text-emerald-500" />} label="All clear" />
          ) : (
            <div className="space-y-1.5 overflow-y-auto flex-1">
              {actionableAlerts.slice(0, 12).map(a => (
                <div key={a.id} className="rounded-xl px-3 py-2.5" style={{background:"rgba(34,211,238,0.03)",border:"1px solid rgba(34,211,238,0.08)"}}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={11}
                      className={`mt-0.5 shrink-0 ${a.severity === "high" ? "text-red-400" : "text-amber-400"}`}
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-300 truncate">{a.product_title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{a.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 flex gap-2" style={{borderTop:"1px solid rgba(34,211,238,0.08)"}}>
            <a
              href="/returns"
              className="flex-1 h-8 rounded-lg transition flex items-center justify-center gap-1.5 text-[11px] font-mono text-slate-500 hover:text-slate-200" style={{background:"rgba(34,211,238,0.03)",border:"1px solid rgba(34,211,238,0.08)"}}
            >
              <RotateCcw size={11} /> Returns
            </a>
            <a
              href="/dead-stock"
              className="flex-1 h-8 rounded-lg transition flex items-center justify-center gap-1.5 text-[11px] font-mono text-slate-500 hover:text-slate-200" style={{background:"rgba(34,211,238,0.03)",border:"1px solid rgba(34,211,238,0.08)"}}
            >
              <Skull size={11} /> Dead Stock
            </a>
          </div>
        </div>
      </div>
      )}

      {/* ── Scaling Insights ───────────────────────────────────── */}
      {storeId !== "all" && <AiTips ov={ov} products={products} totalAdSpend={totalAdSpend} />}
    </div>
  );
}

// ── KPI card (large, accented) ──────────────────────────────────────────────
function KpiCard({
  label, value, sub, trend, accent = "gray", loading,
}: {
  label: string; value: string; sub?: string;
  trend?: "up" | "down"; accent?: "blue" | "green" | "red" | "gray"; loading?: boolean;
}) {
  const cfg = {
    blue:  { border: "rgba(34,211,238,0.2)",  glow: "rgba(34,211,238,0.06)",  line: "#22d3ee", value: "#e2e8f0" },
    green: { border: "rgba(52,211,153,0.2)",  glow: "rgba(52,211,153,0.06)",  line: "#34d399", value: "#e2e8f0" },
    red:   { border: "rgba(248,113,113,0.2)", glow: "rgba(248,113,113,0.06)", line: "#f87171", value: "#e2e8f0" },
    gray:  { border: "rgba(34,211,238,0.08)", glow: "transparent",            line: "rgba(255,255,255,0.1)", value: "#e2e8f0" },
  }[accent];

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, #070F22 0%, #060C1A 100%)",
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 24px ${cfg.glow}`,
      }}
    >
      {/* Top inset glow line */}
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
        background: `linear-gradient(90deg, transparent, ${cfg.line}60, transparent)`,
      }} />
      <p
        className="font-mono uppercase mb-3"
        style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#475569" }}
      >
        {label}
      </p>
      {loading ? (
        <div className="h-9 w-32 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.04)", animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }} />
      ) : (
        <div className="flex items-end gap-2">
          <h3
            className="font-black tracking-tight leading-none tabular-nums"
            style={{ fontSize: "30px", color: cfg.value, fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </h3>
          {trend === "up"   && <ArrowUpRight   size={18} className="text-emerald-400 mb-1 shrink-0" />}
          {trend === "down" && <ArrowDownRight size={18} className="text-red-400 mb-1 shrink-0" />}
        </div>
      )}
      {sub && (
        <p className="mt-2 leading-relaxed" style={{ fontSize: "11px", color: "#475569" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Stat card (smaller, secondary) ─────────────────────────────────────────
function StatCard({
  label, value, sub, trend, loading,
}: {
  label: string; value: string; sub?: string; trend?: "up" | "down"; loading?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #070F22 0%, #060C1A 100%)",
        border: "1px solid rgba(34,211,238,0.1)",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent)",
      }} />
      <p className="font-mono uppercase mb-2" style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#475569" }}>
        {label}
      </p>
      {loading ? (
        <div className="h-6 w-20 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.04)", animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }} />
      ) : (
        <div className="flex items-center gap-1.5">
          <h3 className="text-xl font-black tracking-tight tabular-nums" style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </h3>
          {trend === "up"   && <ArrowUpRight   size={13} className="text-emerald-400 shrink-0" />}
          {trend === "down" && <ArrowDownRight size={13} className="text-red-400 shrink-0" />}
        </div>
      )}
      {sub && <p className="mt-1 leading-relaxed" style={{ fontSize: "10px", color: "#475569" }}>{sub}</p>}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function Empty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
      <div className="mb-2">{icon}</div>
      <p className="text-xs font-mono text-slate-500">{label}</p>
    </div>
  );
}

// ── Scaling Insights (AI Tips) ──────────────────────────────────────────────
function AiTips({ ov, products, totalAdSpend }: { ov: Overview | null; products: TopProduct[]; totalAdSpend: number }) {
  if (!ov) return null;

  const revenue    = ov.netRevenue ?? ov.revenue ?? 0;
  const adSpend    = totalAdSpend;
  const roas       = adSpend > 0 ? revenue / adSpend : (ov.roas ?? 0);
  const profit     = ov.profit     ?? 0;
  const returnRate = ov.returnRate ?? 0;
  const margin     = revenue > 0 ? (profit / revenue) * 100 : 0;

  const tips: { level: "green" | "amber" | "red"; text: string }[] = [];

  if (profit < 0)
    tips.push({ level: "red", text: `Loss of €${Math.abs(profit).toFixed(0)} — check purchase costs, pricing and ad spend immediately.` });

  if (adSpend > 0 && roas < 2)
    tips.push({ level: "red", text: `ROAS ${roas.toFixed(2)}× is too low. Pause underperforming campaigns or raise bids on best-sellers.` });

  if (adSpend > 0 && roas >= 2 && roas < 3.5)
    tips.push({ level: "amber", text: `ROAS ${roas.toFixed(2)}× — room to improve. Test new creatives or optimise product pages.` });

  if (adSpend > 0 && roas >= 3.5)
    tips.push({ level: "green", text: `ROAS ${roas.toFixed(2)}× is strong. Scale budget on your best-performing campaigns.` });

  if (revenue > 0 && margin > 0 && margin < 20)
    tips.push({ level: "red", text: `Margin ${margin.toFixed(1)}% is too low. Negotiate a lower purchase price or raise the selling price.` });

  if (revenue > 0 && margin >= 20 && margin < 35)
    tips.push({ level: "amber", text: `Margin ${margin.toFixed(1)}% is decent. Add product costs to track this accurately per product.` });

  if (revenue > 0 && margin >= 35)
    tips.push({ level: "green", text: `Margin ${margin.toFixed(1)}% is healthy. Scale volume — your unit economics support growth.` });

  if (returnRate > 10)
    tips.push({ level: "red", text: `Return rate ${returnRate.toFixed(1)}% is high. Check which products drive most returns.` });

  if (adSpend === 0)
    tips.push({ level: "amber", text: "No ad data yet — connect Google Ads to track ROAS automatically." });

  if (products.length > 0) {
    const top = products[0];
    const topMargin = top.revenue > 0 ? (top.profit / top.revenue) * 100 : 0;
    if (topMargin > 35)
      tips.push({ level: "green", text: `"${top.product_title}" has ${topMargin.toFixed(0)}% margin — ideal candidate to scale with more ad budget.` });
  }

  if (tips.length === 0) return null;

  const colorMap = {
    green: { bg: "bg-emerald-950/40 border-emerald-800", dot: "bg-emerald-400", text: "text-emerald-300" },
    amber: { bg: "bg-amber-950/40 border-amber-800",     dot: "bg-amber-400",   text: "text-amber-300"  },
    red:   { bg: "bg-red-950/40 border-red-800",         dot: "bg-red-400",     text: "text-red-300"    },
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={13} className="text-emerald-400" />
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">Scaling Insights</h3>
        <span className="ml-auto text-[10px] text-zinc-400">{tips.length} insights</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tips.map((tip, i) => {
          const c = colorMap[tip.level];
          return (
            <div key={i} className={`rounded-xl border px-3.5 py-3 ${c.bg}`}>
              <div className="flex items-start gap-2">
                <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
                <p className={`text-[11px] leading-relaxed ${c.text}`}>{tip.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
