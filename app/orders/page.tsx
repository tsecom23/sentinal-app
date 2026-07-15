"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight,
  Loader2, RefreshCw, Search, ShoppingCart, TrendingUp, X,
} from "lucide-react";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

interface OrderItem {
  product_title: string;
  variant_title: string;
  quantity: number;
  revenue: number;
}

interface Order {
  id: string;
  order_number: string;
  email: string;
  currency: string;
  revenue: number;
  net_revenue: number;
  created_at: string;
  items: OrderItem[];
}

interface DayStat {
  orders: number;
  revenue: number;
  adSpend?: number;
  roas?: number | null;
}

function f2(n: number) {
  return n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function OrdersPage() {
  const { stores } = useStores();
  const [storeId, setStoreId]     = useState("martaline");
  const [dateRange, setDateRange] = useState<DateRange>(initRange("7d"));
  const [orders, setOrders]       = useState<Order[]>([]);
  const [today, setToday]         = useState<DayStat | null>(null);
  const [yesterday, setYesterday] = useState<DayStat | null>(null);
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncMsg, setSyncMsg]     = useState("");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/orders?store_id=${storeId}&${toQueryString(dateRange)}`,
        { cache: "no-store" }
      );
      const d = await res.json() as { orders: Order[]; today: DayStat; yesterday: DayStat };
      setOrders(d.orders ?? []);
      setToday(d.today ?? null);
      setYesterday(d.yesterday ?? null);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [storeId, dateRange]); // eslint-disable-line

  async function syncOrders() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch(`${API}/api/shopify/sync-orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, days: 60 }),
      });
      const d = await r.json() as { ok: boolean; imported?: number; error?: string };
      if (d.ok) {
        setSyncMsg(`${d.imported} orders synced`);
        await load();
      } else {
        setSyncMsg(d.error ?? "Sync failed");
      }
    } catch { setSyncMsg("Network error"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 4000); }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.email.toLowerCase().includes(q) ||
      o.order_number.toLowerCase().includes(q) ||
      o.items.some(i => i.product_title.toLowerCase().includes(q))
    );
  });

  // Group by date for timeline display
  const grouped = filtered.reduce<Record<string, Order[]>>((acc, o) => {
    const day = o.created_at.slice(0, 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(o);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const totalRevenue = filtered.reduce((s, o) => s + o.revenue, 0);
  const totalOrders  = filtered.length;
  const avgOrderVal  = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const todayDelta = today && yesterday && yesterday.revenue > 0
    ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100
    : null;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <ShoppingCart size={22} className="text-blue-400" /> Orders
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">All incoming orders</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}
          <button onClick={syncOrders} disabled={syncing}
            title="Sync orders from Shopify (last 60 days)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 text-xs font-medium text-gray-500 hover:text-gray-900 transition-all disabled:opacity-40">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync Shopify
          </button>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-black/5 rounded-xl p-1">
            {stores.map(s => (
              <button key={s.id} onClick={() => setStoreId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${storeId === s.id ? "bg-blue-600 text-gray-900" : "text-gray-500 hover:text-gray-900"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Today snapshot */}
      {today && (
        <div className="grid grid-cols-4 gap-3">
          {/* Today orders */}
          <div className="rounded-2xl bg-black/3 border border-black/5 p-4 col-span-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Today</p>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-black">{today.orders}</p>
              <p className="text-gray-500 text-xs mb-1">orders</p>
            </div>
            {todayDelta !== null && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${todayDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {todayDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(todayDelta).toFixed(0)}% vs yesterday
              </div>
            )}
          </div>

          {/* Today revenue */}
          <div className="rounded-2xl bg-black/3 border border-black/5 p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Revenue today</p>
            <p className="text-2xl font-black">€{f2(today.revenue)}</p>
            {yesterday && yesterday.revenue > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">Yesterday €{f2(yesterday.revenue)}</p>
            )}
          </div>

          {/* Ad spend today */}
          <div className={`rounded-2xl border p-4 ${
            today.adSpend && today.adSpend > 0
              ? "bg-black/3 border-black/5"
              : "bg-gray-50 border-black/4"
          }`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Ad spend today</p>
            <p className="text-2xl font-black text-red-700">
              {today.adSpend && today.adSpend > 0 ? `€${f2(today.adSpend)}` : "—"}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {today.adSpend && today.adSpend > 0 ? "auto-synced via Ads Script" : "Not yet synced"}
            </p>
          </div>

          {/* ROAS today */}
          <div className={`rounded-2xl border p-4 ${
            today.roas === null || !today.adSpend
              ? "bg-gray-50 border-black/4"
              : today.roas >= 3 ? "bg-emerald-50 border-emerald-500/20"
              : today.roas >= 1.5 ? "bg-amber-50 border-amber-500/20"
              : "bg-red-50 border-red-500/20"
          }`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">ROAS today</p>
            <p className={`text-2xl font-black ${
              today.roas === null || !today.adSpend ? "text-gray-400"
              : today.roas >= 3 ? "text-emerald-400"
              : today.roas >= 1.5 ? "text-amber-400"
              : "text-red-400"
            }`}>
              {today.roas !== null && today.adSpend ? `${today.roas.toFixed(2)}x` : "—"}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp size={10} className="text-gray-400" />
              <p className="text-[11px] text-gray-400">Revenue / ad spend</p>
            </div>
          </div>
        </div>
      )}

      {/* Period summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-black/3 border border-black/5 p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Period orders</p>
          <p className="text-xl font-black">{totalOrders}</p>
        </div>
        <div className="rounded-2xl bg-black/3 border border-black/5 p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Period revenue</p>
          <p className="text-xl font-black">€{f2(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl bg-black/3 border border-black/5 p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Avg. order value</p>
          <p className="text-xl font-black">{totalOrders > 0 ? `€${f2(avgOrderVal)}` : "—"}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer, product, order number…"
          className="w-full bg-black/4 border border-black/8 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-zinc-700 outline-none focus:border-blue-500/50"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Orders timeline */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-black/4 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-black/3 border border-black/5 p-12 text-center text-gray-400">
          <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "No orders found" : "No orders in this period"}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(day => {
            const dayOrders = grouped[day];
            const dayRevenue = dayOrders.reduce((s, o) => s + o.revenue, 0);
            return (
              <div key={day}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-xs font-bold text-gray-500">{formatDate(day + "T12:00:00")}</p>
                  <div className="flex-1 h-px bg-black/5" />
                  <p className="text-xs text-gray-400">{dayOrders.length} orders · €{f2(dayRevenue)}</p>
                </div>

                {/* Orders for this day */}
                <div className="space-y-1.5">
                  {dayOrders.map(order => {
                    const isOpen = expanded.has(order.id);
                    const itemsLabel = order.items.length > 0
                      ? order.items.slice(0, 2).map(i =>
                          `${i.product_title.split(" ").slice(0, 4).join(" ")}${i.variant_title ? ` (${i.variant_title})` : ""} ×${i.quantity}`
                        ).join("  ·  ") + (order.items.length > 2 ? `  +${order.items.length - 2}` : "")
                      : "—";

                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl bg-black/3 border border-black/5 overflow-hidden hover:border-black/10 transition-colors"
                      >
                        {/* Main row */}
                        <button
                          onClick={() => toggleExpand(order.id)}
                          className="w-full flex items-center gap-4 px-4 py-3 text-left"
                        >
                          {/* Expand icon */}
                          <div className="text-gray-400 shrink-0">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>

                          {/* Order number */}
                          <div className="w-16 shrink-0">
                            <p className="text-xs font-bold text-blue-400">{order.order_number || `#${order.id.slice(-4)}`}</p>
                          </div>

                          {/* Customer */}
                          <div className="w-48 shrink-0 min-w-0">
                            <p className="text-xs text-gray-600 truncate">{order.email}</p>
                          </div>

                          {/* Products summary */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500 truncate">{itemsLabel}</p>
                          </div>

                          {/* Revenue */}
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold">€{f2(order.revenue)}</p>
                          </div>

                          {/* Time */}
                          <div className="w-20 text-right shrink-0">
                            <p className="text-[10px] text-gray-400">{formatTime(order.created_at)}</p>
                            <p className="text-[10px] text-gray-400">{timeAgo(order.created_at)}</p>
                          </div>
                        </button>

                        {/* Expanded line items */}
                        {isOpen && (
                          <div className="border-t border-black/5 px-4 pb-3 pt-2 space-y-2">
                            {order.items.length === 0 ? (
                              <p className="text-xs text-gray-400">No product details available</p>
                            ) : order.items.map((item, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-lg bg-blue-600/15 flex items-center justify-center text-[10px] text-blue-400 font-bold shrink-0">
                                  {item.quantity}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700 truncate">{item.product_title}</p>
                                  {item.variant_title && (
                                    <p className="text-[10px] text-gray-400">{item.variant_title}</p>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-gray-600 shrink-0">€{f2(item.revenue)}</p>
                              </div>
                            ))}
                            <div className="flex justify-between pt-1 border-t border-black/5">
                              <p className="text-[10px] text-gray-400">Customer: {order.email}</p>
                              <p className="text-[10px] text-gray-400">
                                {new Date(order.created_at).toLocaleString("en-GB")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
