"use client";

import { useEffect, useState } from "react";
import { Users, Search, X } from "lucide-react";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

interface CustomerData {
  email: string;
  order_count: number;
  total_revenue: number;
  first_order: string;
  last_order: string;
}

interface StatsResponse {
  customers: CustomerData[];
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  newToday: number;
  avgLtv: number;
}

function fmt(n: number): string {
  return "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function Badge({ count }: { count: number }) {
  if (count >= 5) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400">
        VIP
      </span>
    );
  }
  if (count >= 2) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-400">
        Repeat
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/8 text-zinc-500">
      New
    </span>
  );
}

export default function CustomersPage() {
  const { stores } = useStores();
  const [store, setStore]   = useState("ceofo");
  const [data, setData]     = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]       = useState<"all" | "repeat">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`${API}/api/customers/stats?store_id=${store}`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: StatsResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [store]);

  const allCustomers: CustomerData[] = data?.customers ?? [];

  // Sort by total_revenue desc
  const sorted = [...allCustomers].sort((a, b) => b.total_revenue - a.total_revenue);

  // Tab filter
  const tabFiltered = tab === "repeat"
    ? sorted.filter(c => c.order_count >= 2)
    : sorted;

  // Search filter
  const searchFiltered = search
    ? tabFiltered.filter(c =>
        (c.email || "").toLowerCase().includes(search.toLowerCase())
      )
    : tabFiltered;

  // Max 50 rows
  const displayed = searchFiltered.slice(0, 50);

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Users size={22} className="text-blue-400" /> Customers
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Repeat customers, top spenders and lifetime value</p>
        </div>

        {/* Store selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {stores.map(s => (
            <button
              key={s.id}
              onClick={() => setStore(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                store === s.id ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total customers */}
        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Total Customers</p>
          <p className="text-2xl font-black text-blue-400">
            {loading ? "—" : data ? data.totalCustomers.toLocaleString("nl-NL") : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">Unique customers</p>
        </div>

        {/* Repeat customers */}
        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Repeat Customers</p>
          <p className="text-2xl font-black text-blue-400">
            {loading ? "—" : data ? `${data.repeatRate}%` : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">
            {data ? `${data.repeatCustomers.toLocaleString("nl-NL")} bought 2+ times` : "bought 2+ times"}
          </p>
        </div>

        {/* New today */}
        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">New Today</p>
          <p className="text-2xl font-black text-emerald-400">
            {loading ? "—" : data ? data.newToday : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">First-time buyers</p>
        </div>

        {/* Avg LTV */}
        <div className="bg-white/3 border border-white/5 rounded-2xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Avg. LTV</p>
          <p className="text-2xl font-black text-amber-400">
            {loading ? "—" : data ? fmt(data.avgLtv) : "—"}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">Lifetime value per customer</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(["all", "repeat"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t === "all" ? "All customers" : "Repeat only"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by email…"
          className="w-full bg-white/4 border border-white/8 rounded-xl pl-9 pr-9 py-2 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Customer table */}
      <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-white/4 animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-zinc-700">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="text-sm">
              {search
                ? "No customers match your search"
                : tab === "repeat"
                  ? "No repeat customers yet"
                  : "No customers found"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Email", "Orders", "Total Spent", "First Order", "Last Order", ""].map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-4 py-3 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((c, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/2 transition">
                    <td className="px-4 py-3 text-zinc-300 max-w-[220px] truncate">
                      {c.email || <span className="text-zinc-600 italic">Anonymous</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{c.order_count}</td>
                    <td className="px-4 py-3 text-zinc-200 font-semibold whitespace-nowrap">
                      {fmt(c.total_revenue)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
                      {c.first_order ? fmtDate(c.first_order) : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">
                      {c.last_order ? fmtDate(c.last_order) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge count={c.order_count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {searchFiltered.length > 50 && (
              <p className="px-4 py-3 text-[11px] text-zinc-600 border-t border-white/5">
                Showing 50 of {searchFiltered.length.toLocaleString("nl-NL")} customers
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
