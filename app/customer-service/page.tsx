"use client";

import { useEffect, useState } from "react";
import {
  BarChart2, CheckCircle2, ChevronDown,
  Headphones, Inbox, Loader2, Package, Plus,
  Search, Tag, Trash2, TrendingDown, TrendingUp, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DateRangePicker, DateRange, initRange, toQueryString } from "../components/DateRangePicker";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

const CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  not_received:  { label: "Not received",      emoji: "📦", color: "text-blue-400"    },
  damaged:       { label: "Damaged product",   emoji: "💔", color: "text-red-400"     },
  wrong_item:    { label: "Wrong item",        emoji: "🔄", color: "text-orange-400"  },
  refund:        { label: "Refund request",    emoji: "💸", color: "text-yellow-400"  },
  quality:       { label: "Quality issue",     emoji: "⭐", color: "text-amber-400"   },
  late_delivery: { label: "Late delivery",     emoji: "🐢", color: "text-purple-400"  },
  sizing:        { label: "Wrong size / fit",  emoji: "📏", color: "text-pink-400"    },
  missing_item:  { label: "Missing item",      emoji: "🔍", color: "text-cyan-400"    },
  other:         { label: "Other",             emoji: "❓", color: "text-zinc-400"    },
};

const PRIORITIES: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low",    color: "text-zinc-400",    bg: "bg-zinc-800"        },
  medium: { label: "Medium", color: "text-amber-400",   bg: "bg-amber-950/40"    },
  high:   { label: "High",   color: "text-orange-400",  bg: "bg-orange-950/40"   },
  urgent: { label: "Urgent", color: "text-red-400",     bg: "bg-red-950/40"      },
};

const STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "text-blue-400",    bg: "bg-blue-950/40"    },
  in_progress: { label: "In progress", color: "text-amber-400",   bg: "bg-amber-950/40"   },
  resolved:    { label: "Resolved",    color: "text-emerald-400", bg: "bg-emerald-950/40" },
  closed:      { label: "Closed",      color: "text-zinc-500",    bg: "bg-zinc-800"        },
};

const PRESET_TAGS = ["retour","fraude","betaling","klacht","dringend","vip","dubbel","ophouden"];

interface Ticket {
  id: string; store_id: string; order_number: string; customer_email: string;
  category: string; priority: string; status: string;
  subject: string; description: string; product_title: string;
  resolution: string; tags: string; source: string; thread_id: string;
  created_at: string; updated_at: string; resolved_at: string;
}

interface Stats {
  byCategory: { category: string; count: number; resolved: number }[];
  byProduct:  { product_title: string; count: number; high_priority: number }[];
  byDay:      { day: string; count: number; resolved: number }[];
  summary: {
    total: number; open_count: number; in_progress_count: number;
    resolved_count: number; urgent_count: number; high_count: number;
    avg_resolution_hours: number | null;
  } | null;
}

const EMPTY_FORM = {
  order_number: "", customer_email: "", category: "not_received",
  priority: "medium", subject: "", description: "", product_title: "",
};

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${color} ${bg}`}>
      {text}
    </span>
  );
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw.split(",").map(t => t.trim()).filter(Boolean); }
}

export default function CustomerServicePage() {
  const { stores } = useStores();
  const [store, setStore]           = useState("all");
  const [dateRange, setDateRange]   = useState<DateRange>(initRange("30d"));
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView]             = useState<"tickets" | "analytics">("tickets");

  async function load() {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`${API}/api/cs/tickets?store_id=${store}`, { cache: "no-store" }),
        fetch(`${API}/api/cs/stats?store_id=${store}&${toQueryString(dateRange)}`, { cache: "no-store" }),
      ]);
      const tData = await tRes.json() as { tickets: Ticket[] };
      const sData = await sRes.json() as Stats;
      setTickets(tData.tickets ?? []);
      setStats(sData);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [store, dateRange]);

  async function submit() {
    if (!form.category || !form.subject) return;
    setSaving(true);
    await fetch(`${API}/api/cs/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, store_id: store }),
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function updateTicket(id: string, patch: Partial<Ticket>) {
    await fetch(`${API}/api/cs/tickets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  async function deleteTicket(id: string) {
    if (!confirm("Delete this ticket?")) return;
    await fetch(`${API}/api/cs/tickets/${id}`, { method: "DELETE" });
    setTickets(prev => prev.filter(t => t.id !== id));
  }

  const filtered = tickets.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.subject.toLowerCase().includes(q) ||
             t.customer_email.toLowerCase().includes(q) ||
             t.order_number.toLowerCase().includes(q) ||
             t.product_title.toLowerCase().includes(q);
    }
    return true;
  });

  const summary = stats?.summary;
  const topCategory = stats?.byCategory[0];
  const topCatCfg   = topCategory ? CATEGORIES[topCategory.category] : null;

  // Trend direction
  const days = stats?.byDay ?? [];
  const lastWeek = days.slice(-7).reduce((s, d) => s + d.count, 0);
  const prevWeek = days.slice(-14, -7).reduce((s, d) => s + d.count, 0);
  const trendUp  = lastWeek > prevWeek;

  return (
    <div className="p-6 space-y-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Headphones size={22} className="text-blue-400" /> Customer Service
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Log and track all customer complaints & issues</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            <button onClick={() => setStore("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${store === "all" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              Alle
            </button>
            {stores.map(s => (
              <button key={s.id} onClick={() => setStore(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  store === s.id ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                }`}>{s.name}</button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus size={15} /> New ticket
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white/3 border border-white/5 p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Open</p>
          <p className="text-2xl font-black text-blue-400">{summary?.open_count ?? "—"}</p>
          <p className="text-xs text-zinc-600 mt-1">{summary?.in_progress_count ?? 0} in progress</p>
        </div>
        <div className={`rounded-2xl border p-4 ${(summary?.urgent_count ?? 0) > 0 ? "bg-red-950/30 border-red-500/30" : "bg-white/3 border-white/5"}`}>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Urgent / High</p>
          <p className={`text-2xl font-black ${(summary?.urgent_count ?? 0) > 0 ? "text-red-400" : "text-zinc-300"}`}>
            {(summary?.urgent_count ?? 0) + (summary?.high_count ?? 0)}
          </p>
          <p className="text-xs text-zinc-600 mt-1">{summary?.urgent_count ?? 0} urgent</p>
        </div>
        <div className="rounded-2xl bg-white/3 border border-white/5 p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Resolved</p>
          <p className="text-2xl font-black text-emerald-400">{summary?.resolved_count ?? "—"}</p>
          <p className="text-xs text-zinc-600 mt-1">
            {summary?.avg_resolution_hours != null
              ? `avg ${summary.avg_resolution_hours.toFixed(1)}h`
              : "no data yet"}
          </p>
        </div>
        <div className={`rounded-2xl border p-4 ${topCatCfg ? "bg-white/3 border-white/5" : "bg-white/2 border-white/4"}`}>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Top issue</p>
          {topCatCfg ? (
            <>
              <p className="text-xl font-black flex items-center gap-1.5">
                <span>{topCatCfg.emoji}</span>
                <span className={topCatCfg.color}>{topCategory!.count}</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1 truncate">{topCatCfg.label}</p>
            </>
          ) : (
            <p className="text-2xl font-black text-zinc-600">—</p>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        <button onClick={() => setView("tickets")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === "tickets" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}>
          Tickets
        </button>
        <button onClick={() => setView("analytics")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${view === "analytics" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}>
          <BarChart2 size={11} /> Analytics
        </button>
      </div>

      {/* ── ANALYTICS VIEW ───────────────────────────────────── */}
      {view === "analytics" && stats && (
        <div className="space-y-6">

          {/* Trend chart */}
          <div className="rounded-2xl bg-white/3 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Daily ticket volume</h3>
              <div className={`flex items-center gap-1 text-xs font-semibold ${trendUp ? "text-red-400" : "text-emerald-400"}`}>
                {trendUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {trendUp ? "Volume up vs last week" : "Volume down vs last week"}
              </div>
            </div>
            {days.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No data in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 10 }}
                    tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
                    labelStyle={{ color: "#999", fontSize: 11 }}
                    itemStyle={{ color: "#fff", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2}
                    dot={false} name="Tickets" />
                  <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2}
                    dot={false} name="Resolved" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Category breakdown */}
            <div className="rounded-2xl bg-white/3 border border-white/5 p-5">
              <h3 className="text-sm font-bold mb-4">By category</h3>
              {stats.byCategory.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-6">No data yet</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.byCategory.map(c => {
                    const cfg = CATEGORIES[c.category] ?? { label: c.category, emoji: "❓", color: "text-zinc-400" };
                    const total = stats.byCategory.reduce((s, x) => s + x.count, 0);
                    const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                    return (
                      <div key={c.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs flex items-center gap-1.5">
                            <span>{cfg.emoji}</span>
                            <span className="text-zinc-300">{cfg.label}</span>
                          </span>
                          <span className="text-xs font-bold text-zinc-300">{c.count} <span className="text-zinc-600 font-normal">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cfg.color.replace("text-", "bg-")}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top complaint products */}
            <div className="rounded-2xl bg-white/3 border border-white/5 p-5">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Package size={14} className="text-zinc-500" /> Most complained products
              </h3>
              {stats.byProduct.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-6">No product data yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.byProduct.map((p, i) => (
                    <div key={p.product_title} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-700 w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 truncate">{p.product_title || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.high_priority > 0 && (
                          <span className="text-[10px] text-red-400 font-bold">⚠ {p.high_priority}</span>
                        )}
                        <span className="text-xs font-bold text-zinc-300 bg-white/8 px-2 py-0.5 rounded-lg">{p.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bar chart categories */}
          {stats.byCategory.length > 0 && (
            <div className="rounded-2xl bg-white/3 border border-white/5 p-5">
              <h3 className="text-sm font-bold mb-4">Category breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.byCategory.map(c => ({
                  name: CATEGORIES[c.category]?.emoji + " " + (CATEGORIES[c.category]?.label ?? c.category),
                  tickets: c.count,
                  resolved: c.resolved,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
                    itemStyle={{ color: "#fff", fontSize: 12 }}
                  />
                  <Bar dataKey="tickets"  fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total" />
                  <Bar dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolved" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── TICKETS VIEW ─────────────────────────────────────── */}
      {view === "tickets" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search tickets…"
                className="bg-white/4 border border-white/8 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50 w-64"
              />
              {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"><X size={11} /></button>}
            </div>

            {/* Status filter */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1">
              {["all", "open", "in_progress", "resolved", "closed"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    filterStatus === s ? "bg-white/15 text-white" : "text-zinc-500 hover:text-white"
                  }`}>
                  {s === "all" ? "All" : STATUSES[s]?.label}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-zinc-300 outline-none">
              <option value="all">All categories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>

            <span className="text-zinc-600 text-xs ml-auto">{filtered.length} tickets</span>
          </div>

          {/* Ticket list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white/4 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-white/3 border border-white/5 p-12 text-center space-y-2">
              <Headphones size={32} className="mx-auto text-zinc-700" />
              <p className="text-sm text-zinc-500">No tickets found</p>
              <button onClick={() => setShowForm(true)} className="text-xs text-blue-400 hover:text-blue-300">
                + Create first ticket
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(ticket => {
                const cat  = CATEGORIES[ticket.category]  ?? { label: ticket.category, emoji: "❓", color: "text-zinc-400" };
                const pri  = PRIORITIES[ticket.priority]  ?? PRIORITIES.medium;
                const stat = STATUSES[ticket.status]      ?? STATUSES.open;
                const isOpen = expandedId === ticket.id;

                return (
                  <div key={ticket.id}
                    className={`rounded-2xl border overflow-hidden transition-all ${
                      ticket.priority === "urgent" ? "bg-red-950/20 border-red-500/30"
                      : ticket.priority === "high"   ? "bg-orange-950/15 border-orange-500/20"
                      : "bg-white/3 border-white/5"
                    }`}>
                    {/* Main row */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : ticket.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="text-lg shrink-0">{cat.emoji}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {ticket.source === "inbox" && (
                            <Inbox size={10} className="text-blue-400 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-white truncate">{ticket.subject || "—"}</span>
                          {ticket.order_number && (
                            <span className="text-[10px] text-blue-400 font-mono">#{ticket.order_number}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] ${cat.color}`}>{cat.label}</span>
                          {ticket.customer_email && (
                            <span className="text-[10px] text-zinc-600">{ticket.customer_email}</span>
                          )}
                          {parseTags(ticket.tags).map(tag => (
                            <span key={tag} className="text-[9px] bg-blue-500/15 text-blue-300 border border-blue-500/20 rounded-full px-1.5 py-0.5 font-medium">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge text={pri.label}  color={pri.color}  bg={pri.bg} />
                        <Badge text={stat.label} color={stat.color} bg={stat.bg} />
                        <span className="text-zinc-700 text-[10px]">{timeAgo(ticket.created_at)}</span>
                        <ChevronDown size={13} className={`text-zinc-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-white/5 px-4 py-4 space-y-4">
                        {ticket.description && (
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Omschrijving</p>
                            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                          </div>
                        )}

                        {/* Tags editor */}
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Tag size={9} /> Tags</p>
                          <div className="flex flex-wrap gap-1.5">
                            {parseTags(ticket.tags).map(tag => (
                              <button key={tag}
                                onClick={() => {
                                  const current = parseTags(ticket.tags).filter(t => t !== tag);
                                  updateTicket(ticket.id, { tags: current as unknown as string });
                                }}
                                className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all">
                                {tag} ×
                              </button>
                            ))}
                            {PRESET_TAGS.filter(t => !parseTags(ticket.tags).includes(t)).map(tag => (
                              <button key={tag}
                                onClick={() => {
                                  const current = [...parseTags(ticket.tags), tag];
                                  updateTicket(ticket.id, { tags: current as unknown as string });
                                }}
                                className="text-[10px] bg-white/5 text-zinc-600 border border-white/8 rounded-full px-2 py-0.5 hover:bg-blue-500/15 hover:text-blue-300 hover:border-blue-500/20 transition-all">
                                + {tag}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Quick update controls */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div>
                            <p className="text-[10px] text-zinc-500 mb-1">Status</p>
                            <select value={ticket.status}
                              onChange={e => updateTicket(ticket.id, { status: e.target.value })}
                              className="bg-white/8 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none">
                              {Object.entries(STATUSES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <p className="text-[10px] text-zinc-500 mb-1">Prioriteit</p>
                            <select value={ticket.priority}
                              onChange={e => updateTicket(ticket.id, { priority: e.target.value })}
                              className="bg-white/8 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none">
                              {Object.entries(PRIORITIES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-[10px] text-zinc-500 mb-1">Oplossing</p>
                            <input defaultValue={ticket.resolution}
                              onBlur={e => updateTicket(ticket.id, { resolution: e.target.value })}
                              placeholder="Hoe is dit opgelost?"
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-700 outline-none focus:border-blue-500/40" />
                          </div>
                          <button onClick={() => deleteTicket(ticket.id)}
                            className="mt-4 p-1.5 rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-zinc-600">
                          {ticket.source === "inbox" && <span className="flex items-center gap-1 text-blue-500"><Inbox size={10} /> Via inbox</span>}
                          {ticket.resolved_at && (
                            <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={10} /> Opgelost {timeAgo(ticket.resolved_at)}</span>
                          )}
                          <span>Aangemaakt {timeAgo(ticket.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── NEW TICKET MODAL ──────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-bold text-white">New CS ticket</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Category + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1.5">Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50">
                    {Object.entries(CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50">
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1.5">Subject *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Short description of the issue"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Order + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1.5">Order number</label>
                  <input value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
                    placeholder="#1234"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 block mb-1.5">Customer email</label>
                  <input type="email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))}
                    placeholder="customer@email.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              {/* Product */}
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1.5">Product (optional)</label>
                <input value={form.product_title} onChange={e => setForm(f => ({ ...f, product_title: e.target.value }))}
                  placeholder="Product name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1.5">Details</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Full description of the issue…"
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/5">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={submit} disabled={saving || !form.subject || !form.category}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-xl text-sm font-semibold transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? "Saving…" : "Create ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
