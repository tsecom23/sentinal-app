"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Box, CheckCircle,
  RefreshCw, RotateCcw, TrendingUp,
  ArrowUpRight, ArrowDownRight, Lightbulb,
  Skull, Zap, Activity, Radio,
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

// ── Google logo SVG ─────────────────────────────────────────────────────────
function GoogleLogo({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MetaLogo({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#1877F2" className="shrink-0">
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
    </svg>
  );
}

export default function Dashboard({ activeStoreId }: { activeStoreId?: string }) {
  const [storeId,    setStoreId]    = useState(activeStoreId || "ceofo");
  const [country,    setCountry]    = useState("");
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
        const results = await Promise.all(
          REAL_STORES.map(s =>
            fetch(`${API}/api/dashboard/overview?store_id=${s.key}&${dq}`, { cache: "no-store" })
              .then(r => r.json())
              .then(ov => ({ key: s.key, name: s.name, ov }))
          )
        );
        setStoreBreakdown(results);

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
  const revenueIsEstimated = ov?.revenueIsEstimated ?? false;

  const googleRevenue   = ov?.googleRevenue   ?? 0;
  const facebookRevenue = ov?.facebookRevenue ?? 0;
  const googleRoas      = ov?.googleRoas       ?? 0;
  const metaRoas        = ov?.metaRoas         ?? 0;
  const googleProfit    = ov?.googleProfit     ?? 0;
  const metaProfit      = ov?.metaProfit       ?? 0;

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
    <div className="px-6 py-6 min-h-screen max-w-[1400px] bg-[#07090F]">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        {/* Wordmark + live dot */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-cyan-400 uppercase">Sentinel</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono text-emerald-400/70 uppercase tracking-widest">Live</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={storeId}
                onChange={e => changeStore(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-white min-w-[150px] cursor-pointer focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                {STORES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
              {activeStore?.domain && (
                <span className="text-[10px] font-mono text-zinc-600">{activeStore.domain}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={loadData}
            className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-cyan-400 hover:border-zinc-600 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-cyan-400" : ""} />
          </button>
          {storeId !== "all" && (
            <button
              onClick={scanAlerts}
              className="h-9 px-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-500/50 text-cyan-400 text-xs font-semibold flex items-center gap-1.5 transition-all font-mono"
            >
              <Radio size={12} className={scanning ? "animate-pulse" : ""} />
              {scanning ? "Scanning…" : "Scan"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-xs font-mono">
          {error}
        </div>
      )}

      {/* ── Country tabs ───────────────────────────────────────────── */}
      {multiCountry && (
        <div className="flex items-center gap-1.5 mb-5">
          <button
            onClick={() => setCountry("")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
              country === ""
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            🌍 All
          </button>
          {countries.map(c => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                country === c.code
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Milestone bar ──────────────────────────────────────────── */}
      {milestones && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 mb-5 flex items-center gap-5">
          <div className="shrink-0">
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em]">This month</p>
            <p className="text-2xl font-mono font-black mt-0.5 text-white">
              {thisMonth}
              <span className="text-sm font-normal text-zinc-500 ml-1.5">orders</span>
            </p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[9px] font-mono text-zinc-600 mb-1.5">
              <span>{thisMonth} reached</span>
              <span>Next: {nextMilestone}</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
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
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold transition-all ${
                  thisMonth >= m
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                    : "bg-zinc-800 text-zinc-600"
                }`}
              >
                {m}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Channel toggle ─────────────────────────────────────────── */}
      {storeId !== "all" && (
        <div className="flex items-center gap-1.5 mb-5">
          {(["combined", "google", "meta"] as const).map(ch => (
            <button
              key={ch}
              onClick={() => setAdChannel(ch)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                adChannel === ch
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >
              {ch === "google" && <GoogleLogo />}
              {ch === "meta"   && <MetaLogo />}
              {ch === "combined" ? "Combined" : ch === "google" ? (
                <>Google{googleAdSpend > 0 && <span className="text-zinc-500 font-normal">€{fmt(googleAdSpend)}</span>}</>
              ) : (
                <>Meta{metaAdSpend > 0 && <span className="text-zinc-500 font-normal">€{fmt(metaAdSpend)}</span>}</>
              )}
            </button>
          ))}
          {adChannel !== "combined" && (
            <span className="ml-2 text-[10px] font-mono text-zinc-600">
              {revenueIsEstimated ? "~spend-weighted estimate" : "UTM attributed"}
            </span>
          )}
        </div>
      )}

      {/* ── Campaign pills ─────────────────────────────────────────── */}
      {storeId !== "all" && adChannel === "google" && campaigns.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 -mt-2">
          <span className="text-[9px] font-mono text-zinc-600 mr-1 uppercase tracking-widest">Campaign</span>
          {["", ...campaigns].map(c => (
            <button
              key={c || "__all"}
              onClick={() => setCampaign(c === campaign ? "" : c)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-all border ${
                campaign === c
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700"
              }`}
            >
              {c || "All"}
            </button>
          ))}
        </div>
      )}

      {/* ── Primary KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricCard
          label={adChannel === "google" ? "REVENUE · GOOGLE" : adChannel === "meta" ? "REVENUE · META" : "NET REVENUE"}
          value={`€${fmt(revenue)}`}
          sub={adChannel === "combined"
            ? (returnAmount > 0 ? `Gross €${fmt(grossRevenue)} − €${fmt(returnAmount)} returns` : `AOV €${fmt(aov)}`)
            : revenueIsEstimated
              ? `~estimated (${((revenue / (netRevTotal || 1)) * 100).toFixed(0)}% spend share)`
              : `UTM · ${((revenue / (netRevTotal || 1)) * 100).toFixed(0)}% of total`}
          color="cyan"
          loading={loading}
        />
        <MetricCard
          label={adChannel === "google" ? "PROFIT · GOOGLE" : adChannel === "meta" ? "PROFIT · META" : "NET PROFIT"}
          value={`€${fmt(profit)}`}
          sub={`${margin.toFixed(1)}% margin${adChannel === "combined" ? ` · €${orders > 0 ? fmt(profit / orders) : "0.00"}/order` : ""}`}
          trend={profit > 0 ? "up" : profit < 0 ? "down" : undefined}
          color={profit > 0 ? "emerald" : profit < 0 ? "rose" : "zinc"}
          loading={loading}
        />
        <MetricCard
          label={adChannel === "google" ? "ROAS · GOOGLE" : adChannel === "meta" ? "ROAS · META" : "ROAS"}
          value={adSpend > 0 ? `${roas.toFixed(2)}×` : "—"}
          sub={adSpend > 0 ? `€${fmt(adSpend)} spend` : "Ads not connected"}
          trend={adSpend > 0 && breakEvenRoas ? (isProfitable ? "up" : "down") : undefined}
          color={adSpend > 0 && breakEvenRoas ? (isProfitable ? "emerald" : "rose") : "zinc"}
          loading={loading}
        />
      </div>

      {/* ── Secondary metrics ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {/* Orders */}
        <StatBlock
          label="ORDERS"
          value={orders.toString()}
          sub={`${dateRange.start} → ${dateRange.end}`}
          loading={loading}
        />

        {/* Ad Spend */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-3">Ad Spend</p>
          {loading ? <div className="h-5 w-20 rounded bg-zinc-800 animate-pulse" /> : (
            <>
              <div className="space-y-2 mb-2">
                {/* Google */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <GoogleLogo size={10} />
                    <span className="text-[10px] font-mono text-zinc-500">Google</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {storeId !== "all" && !spendEditing && (
                      <button onClick={() => { setSpendEditing(true); setSpendInput(""); }}
                        className="text-[10px] text-zinc-600 hover:text-cyan-400 transition-colors">✎</button>
                    )}
                    {spendEditing ? (
                      <div className="flex gap-0.5 items-center">
                        <span className="text-[10px] font-mono text-zinc-500">€</span>
                        <input autoFocus type="text" value={spendInput} onChange={e => setSpendInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveSpend(); if (e.key === "Escape") setSpendEditing(false); }}
                          className="w-16 text-[10px] font-mono bg-zinc-800 border border-cyan-500/40 rounded px-1 py-0.5 outline-none text-white" />
                        <button onClick={saveSpend} disabled={spendSaving}
                          className="text-[10px] font-mono bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30 disabled:opacity-50">
                          {spendSaving ? "…" : "OK"}
                        </button>
                        <button onClick={() => setSpendEditing(false)} className="text-[10px] text-zinc-600">✕</button>
                      </div>
                    ) : (
                      <span className="text-sm font-mono font-bold text-white">{googleAdSpend > 0 ? `€${fmt(googleAdSpend)}` : <span className="text-zinc-600">—</span>}</span>
                    )}
                  </div>
                </div>
                {/* Meta */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MetaLogo size={10} />
                    <span className="text-[10px] font-mono text-zinc-500">Meta</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {storeId !== "all" && !metaSpendEditing && (
                      <button onClick={() => { setMetaSpendEditing(true); setMetaSpendInput(""); }}
                        className="text-[10px] text-zinc-600 hover:text-cyan-400 transition-colors">✎</button>
                    )}
                    {metaSpendEditing ? (
                      <div className="flex gap-0.5 items-center">
                        <span className="text-[10px] font-mono text-zinc-500">€</span>
                        <input autoFocus type="text" value={metaSpendInput} onChange={e => setMetaSpendInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveMetaSpend(); if (e.key === "Escape") setMetaSpendEditing(false); }}
                          className="w-16 text-[10px] font-mono bg-zinc-800 border border-cyan-500/40 rounded px-1 py-0.5 outline-none text-white" />
                        <button onClick={saveMetaSpend} disabled={metaSpendSaving}
                          className="text-[10px] font-mono bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30 disabled:opacity-50">
                          {metaSpendSaving ? "…" : "OK"}
                        </button>
                        <button onClick={() => setMetaSpendEditing(false)} className="text-[10px] text-zinc-600">✕</button>
                      </div>
                    ) : (
                      <span className="text-sm font-mono font-bold text-white">{metaAdSpend > 0 ? `€${fmt(metaAdSpend)}` : <span className="text-zinc-600">—</span>}</span>
                    )}
                  </div>
                </div>
              </div>
              {totalAdSpend > 0 && (
                <div className="pt-2 border-t border-zinc-800 flex justify-between items-center">
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Total</span>
                  <span className="text-base font-mono font-black text-white">€{fmt(totalAdSpend)}</span>
                </div>
              )}
              {cpc > 0 && <p className="text-[10px] font-mono text-zinc-600 mt-1.5">CPC €{cpc.toFixed(2)} · CTR {ctr.toFixed(2)}%</p>}
            </>
          )}
        </div>

        {/* Returns */}
        <StatBlock
          label="RETURNS"
          value={returnCount > 0 ? `${returnCount}× · €${fmt(returnAmount)}` : "None"}
          sub={returnCount > 0 ? "Deducted from revenue" : "No returns this period"}
          trend={returnCount > 0 ? "down" : undefined}
          loading={loading}
        />

        {/* Break-even ROAS */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2">Break-even ROAS</p>
          {loading ? (
            <div className="h-5 w-16 rounded bg-zinc-800 animate-pulse" />
          ) : breakEvenRoas ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-xl font-mono font-black text-white">{breakEvenRoas.toFixed(2)}×</span>
                {adSpend > 0 && (
                  <span className={`text-[10px] font-mono font-semibold mb-0.5 ${isProfitable ? "text-emerald-400" : "text-rose-400"}`}>
                    {isProfitable ? "✓ profitable" : "✗ below"}
                  </span>
                )}
              </div>
              {adSpend > 0 && (
                <div className="mt-2 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isProfitable ? "bg-emerald-400" : "bg-rose-400"}`}
                    style={{ width: `${Math.min((roasVsBreakEven ?? 0) * 50, 100)}%` }}
                  />
                </div>
              )}
              <p className="text-[9px] font-mono text-zinc-600 mt-1.5">Based on product costs</p>
            </>
          ) : (
            <>
              <p className="text-xl font-mono font-black text-zinc-700">—</p>
              <p className="text-[9px] font-mono text-zinc-600 mt-1">Set product costs to calculate</p>
            </>
          )}
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={13} className="text-cyan-400" />
          <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Revenue &amp; Profit Trend</h3>
          <div className="ml-auto flex items-center gap-4 text-[9px] font-mono text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-cyan-400 inline-block rounded" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-emerald-400 inline-block rounded" />
              Profit
            </span>
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#34d399" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="transparent" tick={{ fill: "#52525b", fontSize: 9, fontFamily: "monospace" }} />
              <YAxis stroke="transparent" tick={{ fill: "#52525b", fontSize: 9, fontFamily: "monospace" }} />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "monospace",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}
                labelStyle={{ color: "#71717a", fontWeight: 600 }}
                formatter={(v: number, name: string) => [
                  `€${v.toFixed(2)}`,
                  name === "revenue" ? "Revenue" : "Net Profit",
                ]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={1.5} fill="url(#revGrad)" dot={false} />
              <Area type="monotone" dataKey="profit"  stroke="#34d399" strokeWidth={1.5} fill="url(#profGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── All-stores breakdown ────────────────────────────────────── */}
      {storeId === "all" && storeBreakdown.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={12} className="text-cyan-400" />
            <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Per Store</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-[9px] text-zinc-600 uppercase tracking-[0.15em]">
                  <th className="text-left pb-2 pr-6 font-semibold">Store</th>
                  <th className="text-right pb-2 px-4 font-semibold">Orders</th>
                  <th className="text-right pb-2 px-4 font-semibold">Revenue</th>
                  <th className="text-right pb-2 px-4 font-semibold">COG</th>
                  <th className="text-right pb-2 px-4 font-semibold">Ad Spend</th>
                  <th className="text-right pb-2 px-4 font-semibold">Profit</th>
                  <th className="text-right pb-2 pl-4 font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {storeBreakdown.map(({ key, name, ov: sov }) => {
                  const sRev    = sov.netRevenue ?? sov.revenue ?? 0;
                  const sCog    = sov.productCost ?? 0;
                  const sAds    = sov.adSpend ?? 0;
                  const sProfit = sov.profit ?? (sRev - sCog - sAds);
                  const sRoas   = sov.roas ?? (sAds > 0 ? sRev / sAds : 0);
                  return (
                    <tr key={key} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="py-3 pr-6 font-bold text-zinc-200">{name}</td>
                      <td className="py-3 px-4 text-right text-zinc-400">{sov.orders ?? 0}</td>
                      <td className="py-3 px-4 text-right text-white font-semibold">€{fmt(sRev)}</td>
                      <td className="py-3 px-4 text-right text-zinc-500">€{fmt(sCog)}</td>
                      <td className="py-3 px-4 text-right text-zinc-500">€{fmt(sAds)}</td>
                      <td className={`py-3 px-4 text-right font-bold ${sProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        €{fmt(sProfit)}
                      </td>
                      <td className="py-3 pl-4 text-right text-zinc-400">
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

      {/* ── Products + Alerts ──────────────────────────────────────── */}
      {storeId !== "all" && (
        <div className="grid grid-cols-5 gap-3 mb-5">
          {/* Top Products */}
          <div className="col-span-3 rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Box size={12} className="text-cyan-400" />
              <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Top Products</h3>
              <span className="ml-auto text-[9px] font-mono text-zinc-600">
                {dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} → ${dateRange.end}`}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-9 rounded-lg bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyState icon={<Box size={20} className="text-zinc-700" />} label="No sales in this period" />
            ) : (
              <div className="space-y-0.5 overflow-y-auto flex-1">
                {products.slice(0, 8).map((p, i) => {
                  const pct = (p.revenue / (products[0]?.revenue || 1)) * 100;
                  const m   = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                  return (
                    <div key={i} className="relative group rounded-lg px-3 py-2.5 hover:bg-zinc-800/70 transition-colors">
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg bg-cyan-500/5"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center gap-3">
                        <span className="text-[9px] font-mono text-zinc-700 w-4 text-right shrink-0 font-bold">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-medium text-zinc-200 truncate">{p.product_title}</p>
                          {p.variant_title && (
                            <p className="text-[10px] font-mono text-zinc-600 truncate">{p.variant_title}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-bold text-white">€{fmt(p.revenue)}</p>
                          <p className="text-[10px] font-mono text-zinc-600">{p.sold}× · {m.toFixed(0)}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="col-span-2 rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={12} className="text-cyan-400" />
              <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Alerts</h3>
              {actionableAlerts.length > 0 && (
                <span className="ml-auto text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                  {actionableAlerts.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-11 rounded-lg bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : actionableAlerts.length === 0 ? (
              <EmptyState icon={<CheckCircle size={20} className="text-emerald-500/50" />} label="All systems clear" />
            ) : (
              <div className="space-y-1.5 overflow-y-auto flex-1">
                {actionableAlerts.slice(0, 12).map(a => (
                  <div key={a.id} className="rounded-lg bg-zinc-800/70 border border-zinc-700/50 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={10}
                        className={`mt-0.5 shrink-0 ${a.severity === "high" ? "text-rose-400" : "text-amber-400"}`}
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono font-medium text-zinc-200 truncate">{a.product_title}</p>
                        <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
              <a
                href="/returns"
                className="flex-1 h-8 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 transition-colors flex items-center justify-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-zinc-200"
              >
                <RotateCcw size={10} /> Returns
              </a>
              <a
                href="/dead-stock"
                className="flex-1 h-8 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 transition-colors flex items-center justify-center gap-1.5 text-[10px] font-mono text-zinc-500 hover:text-zinc-200"
              >
                <Skull size={10} /> Dead Stock
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Scaling Insights ───────────────────────────────────────── */}
      {storeId !== "all" && <AiTips ov={ov} products={products} totalAdSpend={totalAdSpend} />}
    </div>
  );
}

// ── Large metric card ────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, trend, color = "zinc", loading,
}: {
  label: string; value: string; sub?: string;
  trend?: "up" | "down"; color?: "cyan" | "emerald" | "rose" | "zinc"; loading?: boolean;
}) {
  const accentLine = {
    cyan:    "bg-cyan-400",
    emerald: "bg-emerald-400",
    rose:    "bg-rose-400",
    zinc:    "bg-zinc-700",
  }[color];

  const valueColor = {
    cyan:    "text-cyan-400",
    emerald: "text-emerald-400",
    rose:    "text-rose-400",
    zinc:    "text-white",
  }[color];

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-px ${accentLine}`} />
      <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-3">{label}</p>
      {loading ? (
        <div className="h-8 w-28 rounded bg-zinc-800 animate-pulse mb-1" />
      ) : (
        <div className="flex items-end gap-2">
          <h3 className={`text-[28px] font-mono font-black tracking-tight leading-none ${valueColor}`}>{value}</h3>
          {trend === "up"   && <ArrowUpRight   size={16} className="text-emerald-400 mb-1 shrink-0" />}
          {trend === "down" && <ArrowDownRight size={16} className="text-rose-400 mb-1 shrink-0" />}
        </div>
      )}
      {sub && <p className="text-[10px] font-mono text-zinc-600 mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
}

// ── Smaller stat block ───────────────────────────────────────────────────────
function StatBlock({
  label, value, sub, trend, loading,
}: {
  label: string; value: string; sub?: string; trend?: "up" | "down"; loading?: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
      <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2">{label}</p>
      {loading ? (
        <div className="h-6 w-20 rounded bg-zinc-800 animate-pulse mb-1" />
      ) : (
        <div className="flex items-center gap-1.5">
          <h3 className="text-xl font-mono font-black tracking-tight text-white">{value}</h3>
          {trend === "up"   && <ArrowUpRight   size={13} className="text-emerald-400 shrink-0" />}
          {trend === "down" && <ArrowDownRight size={13} className="text-rose-400 shrink-0" />}
        </div>
      )}
      {sub && <p className="text-[10px] font-mono text-zinc-600 mt-1 leading-relaxed">{sub}</p>}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-zinc-700">
      <div className="mb-2">{icon}</div>
      <p className="text-xs font-mono text-zinc-600">{label}</p>
    </div>
  );
}

// ── AI Scaling Insights ──────────────────────────────────────────────────────
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
    green: { bg: "bg-emerald-500/8 border-emerald-500/15", dot: "bg-emerald-400", text: "text-emerald-300" },
    amber: { bg: "bg-amber-500/8 border-amber-500/15",     dot: "bg-amber-400",   text: "text-amber-300"  },
    red:   { bg: "bg-rose-500/8 border-rose-500/15",       dot: "bg-rose-400",    text: "text-rose-300"   },
  };

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={12} className="text-cyan-400" />
        <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Scaling Insights</h3>
        <span className="ml-auto text-[9px] font-mono text-zinc-600">{tips.length} signal{tips.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tips.map((tip, i) => {
          const c = colorMap[tip.level];
          return (
            <div key={i} className={`rounded-lg border px-3.5 py-3 ${c.bg}`}>
              <div className="flex items-start gap-2">
                <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
                <p className={`text-[11px] font-mono leading-relaxed ${c.text}`}>{tip.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
