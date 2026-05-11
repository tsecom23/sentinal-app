"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive, BarChart2, CheckCheck, ChevronDown, Clock, Inbox,
  Languages, Loader2, Mail, MapPin, Phone, RefreshCw, Send, ShoppingBag,
  Trash2, Truck, X, Zap,
} from "lucide-react";
import { useStores } from "../hooks/useStores";

const API = "https://sentinel-api.tssheets1.workers.dev";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  provider: "gmail" | "outlook";
  email: string;
  connected_at: string;
}

interface EmailThread {
  id: string;
  subject: string;
  customer_email: string;
  customer_name: string;
  status: "open" | "pending" | "closed";
  priority: "urgent" | "high" | "normal";
  last_message_at: string;
  message_count: number;
  provider: "gmail" | "outlook";
  account_email: string;
}

interface EmailMessage {
  id: string;
  thread_id: string;
  from_email: string;
  from_name: string;
  to_email: string;
  body_text: string;
  body_html: string;
  direction: "inbound" | "outbound";
  sent_at: string;
}

interface CannedResponse {
  id: string;
  title: string;
  body: string;
}

interface OrderItem {
  product_title: string;
  variant_title: string;
  quantity: number;
  revenue: number;
}

interface CustomerOrder {
  id: string;
  shopify_order_id: string;
  order_number: string;
  created_at: string;
  revenue: number;
  net_revenue: number;
  currency: string;
  financial_status: string;
  fulfillment_status: string;
  tracking_number: string;
  tracking_url: string;
  items: OrderItem[];
}

interface CustomerTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
}

interface CustomerData {
  email: string;
  name: string;
  phone: string;
  city: string;
  country: string;
  total_orders: number;
  total_spend: number;
  ticket_count: number;
  tickets: CustomerTicket[];
  orders: CustomerOrder[];
}

interface OverviewData {
  status: { open_count: number; pending_count: number; closed_count: number; total: number } | null;
  avg_response_hours: number | null;
  avg_resolution_hours: number | null;
  this_week: number;
  this_month: number;
  urgent_open: number;
  high_open: number;
  daily: { day: string; count: number; closed: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string, email: string): string {
  const src = name || email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  open:    { label: "Open",    cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  pending: { label: "Pending", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  closed:  { label: "Closed",  cls: "bg-zinc-700/60 text-zinc-400 border-zinc-600/30" },
};

const PROVIDER_COLORS: Record<string, string> = {
  gmail:   "text-red-400",
  outlook: "text-blue-400",
};

const PRIORITY_STYLES: Record<string, { label: string; cls: string }> = {
  urgent: { label: "URGENT", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  high:   { label: "HIGH",   cls: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  normal: { label: "",       cls: "" },
};

async function translateText(text: string): Promise<string> {
  // Auto-detect source language → English
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=fr|en`
    );
    const d = await res.json() as { responseData?: { translatedText?: string } };
    return d.responseData?.translatedText ?? text;
  } catch {
    return text;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, email, size = 36 }: { name: string; email: string; size?: number }) {
  const bg = email.charCodeAt(0) % 6;
  const colors = ["bg-blue-600", "bg-purple-600", "bg-emerald-600", "bg-amber-600", "bg-red-600", "bg-pink-600"];
  return (
    <div
      className={`${colors[bg]} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials(name, email)}
    </div>
  );
}

function ConnectModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [loading, setLoading] = useState<"gmail" | "outlook" | null>(null);

  async function connect(provider: "gmail" | "outlook") {
    setLoading(provider);
    const endpoint = provider === "gmail" ? "/api/inbox/oauth/gmail-url" : "/api/inbox/oauth/outlook-url";
    try {
      const r = await fetch(`${API}${endpoint}?store_id=${storeId}`);
      const d = await r.json() as { url?: string; error?: string };
      if (d.url) { window.location.href = d.url; }
      else { alert(d.error ?? "Could not get auth URL. Check Worker secrets."); setLoading(null); }
    } catch { alert("Network error"); setLoading(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Connect email account</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <button onClick={() => connect("gmail")} disabled={!!loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/40 hover:bg-red-950/60 disabled:opacity-50 transition-all">
            {loading === "gmail" ? <Loader2 size={18} className="animate-spin text-red-400" /> : <span className="text-lg">📧</span>}
            <div className="text-left">
              <div className="font-semibold text-sm">Connect Gmail</div>
              <div className="text-xs text-zinc-500">Google Workspace or personal Gmail</div>
            </div>
          </button>
          <button onClick={() => connect("outlook")} disabled={!!loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-950/40 border border-blue-800/40 hover:bg-blue-950/60 disabled:opacity-50 transition-all">
            {loading === "outlook" ? <Loader2 size={18} className="animate-spin text-blue-400" /> : <span className="text-lg">📨</span>}
            <div className="text-left">
              <div className="font-semibold text-sm">Connect Outlook</div>
              <div className="text-xs text-zinc-500">Microsoft 365 or Outlook.com</div>
            </div>
          </button>
        </div>
        <div className="bg-amber-950/30 border border-amber-600/20 rounded-xl p-3 text-xs text-amber-400 leading-relaxed">
          <strong>Setup required:</strong> Add <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>,{" "}
          <code>OUTLOOK_CLIENT_ID</code>, <code>OUTLOOK_CLIENT_SECRET</code> as Cloudflare Worker secrets.
        </div>
      </div>
    </div>
  );
}

function CannedPicker({ canned, onSelect, onClose, vars }: { canned: CannedResponse[]; onSelect: (b: string) => void; onClose: () => void; vars: Record<string,string> }) {
  function applyVars(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`);
  }
  const [q, setQ]                           = useState("");
  const [cannedTrans, setCannedTrans]        = useState<Record<string, string>>({});
  const [cannedTranslating, setCannedTranslating] = useState<Record<string, boolean>>({});
  const [showCannedTrans, setShowCannedTrans] = useState<Record<string, boolean>>({});

  const filtered = canned.filter(c => c.title.toLowerCase().includes(q.toLowerCase()));

  async function translateCanned(id: string, body: string) {
    setCannedTranslating(p => ({ ...p, [id]: true }));
    const t = await translateText(body);
    setCannedTrans(p => ({ ...p, [id]: t }));
    setShowCannedTrans(p => ({ ...p, [id]: true }));
    setCannedTranslating(p => ({ ...p, [id]: false }));
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#18181f] border border-white/10 rounded-xl shadow-xl z-10">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates…"
          className="flex-1 bg-transparent text-xs text-white placeholder-zinc-600 outline-none" autoFocus />
        <button onClick={onClose} className="text-zinc-600 hover:text-white"><X size={13} /></button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 && <p className="text-zinc-600 text-xs text-center py-4">No templates found</p>}
        {filtered.map(cr => (
          <div key={cr.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
            <div className="flex items-start gap-2 px-3 py-2.5">
              <button onClick={() => { onSelect(applyVars(cr.body)); onClose(); }} className="flex-1 text-left min-w-0">
                <div className="text-xs text-white font-medium">{cr.title}</div>
                {showCannedTrans[cr.id] && cannedTrans[cr.id] ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wide">→ EN</p>
                    <p className="text-[10px] text-zinc-300 line-clamp-2">{cannedTrans[cr.id]}</p>
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{cr.body}</div>
                )}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  showCannedTrans[cr.id]
                    ? setShowCannedTrans(p => ({ ...p, [cr.id]: false }))
                    : translateCanned(cr.id, cr.body);
                }}
                disabled={cannedTranslating[cr.id]}
                title={showCannedTrans[cr.id] ? "Show original" : "Translate to English"}
                className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-all disabled:opacity-40 mt-0.5"
              >
                {cannedTranslating[cr.id] ? <Loader2 size={9} className="animate-spin" /> : <Languages size={9} />}
                {showCannedTrans[cr.id] ? "FR" : "→EN"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────

function OverviewPanel({ data, storeId, loading }: { data: OverviewData | null; storeId: string; loading: boolean }) {
  function fmtHours(h: number | null): string {
    if (h === null || isNaN(h)) return "—";
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  const daily    = data?.daily ?? [];
  const maxCount = Math.max(...daily.map(d => d.count), 1);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h2 className="text-lg font-black">Inbox Overview</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Ticket metrics · {storeId.toUpperCase()}</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Open",    value: data?.status?.open_count    ?? 0, cls: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "Pending", value: data?.status?.pending_count ?? 0, cls: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "Closed",  value: data?.status?.closed_count  ?? 0, cls: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "Total",   value: data?.status?.total         ?? 0, cls: "text-white",        bg: "bg-white/5 border-white/10" },
        ].map(({ label, value, cls, bg }) => (
          <div key={label} className={`rounded-2xl border p-5 ${bg}`}>
            <p className={`text-3xl font-black ${cls}`}>{value}</p>
            <p className="text-xs text-zinc-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Priority alerts */}
      {((data?.urgent_open ?? 0) > 0 || (data?.high_open ?? 0) > 0) && (
        <div className="flex gap-3">
          {(data?.urgent_open ?? 0) > 0 && (
            <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl font-black text-red-400">{data!.urgent_open}</span>
              <div>
                <p className="text-xs font-bold text-red-300">URGENT</p>
                <p className="text-[10px] text-red-500">open ticket{data!.urgent_open > 1 ? "s" : ""}</p>
              </div>
            </div>
          )}
          {(data?.high_open ?? 0) > 0 && (
            <div className="flex-1 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl font-black text-orange-400">{data!.high_open}</span>
              <div>
                <p className="text-xs font-bold text-orange-300">HIGH</p>
                <p className="text-[10px] text-orange-500">open ticket{data!.high_open > 1 ? "s" : ""}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
          <p className="text-2xl font-black text-white">{fmtHours(data?.avg_response_hours ?? null)}</p>
          <p className="text-xs text-zinc-500 mt-1">Avg first response</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Email → reply</p>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
          <p className="text-2xl font-black text-white">{fmtHours(data?.avg_resolution_hours ?? null)}</p>
          <p className="text-xs text-zinc-500 mt-1">Avg resolution</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Open → closed</p>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
          <p className="text-2xl font-black text-white">{data?.this_week ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">This week</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Last 7 days</p>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
          <p className="text-2xl font-black text-white">{data?.this_month ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">This month</p>
          <p className="text-[10px] text-zinc-700 mt-0.5">Last 30 days</p>
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold">Ticket volume · last 14 days</h3>
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/50 inline-block" />Open</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/60 inline-block" />Closed</span>
          </div>
        </div>
        {daily.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-6">No data yet — sync emails to see volume trends</p>
        ) : (
          <div className="flex items-end gap-2 h-28">
            {daily.map(d => {
              const pct     = Math.max(6, (d.count / maxCount) * 100);
              const closedPct = d.count > 0 ? Math.round((d.closed / d.count) * 100) : 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.count} tickets, ${d.closed} closed`}>
                  <span className="text-[9px] text-zinc-500 font-medium">{d.count}</span>
                  <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse" style={{ height: `${pct}%` }}>
                    <div className="w-full bg-blue-500/50" style={{ height: `${100 - closedPct}%` }} />
                    <div className="w-full bg-emerald-500/60" style={{ height: `${closedPct}%` }} />
                  </div>
                  <span className="text-[9px] text-zinc-600 truncate w-full text-center">{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!data && !loading && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-500">No data yet</p>
          <p className="text-xs text-zinc-600 mt-1">Connect an account and sync emails to see metrics</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { stores } = useStores();
  const [tab, setTab]               = useState<"inbox" | "overview">("inbox");
  const [storeId, setStoreId]       = useState("martaline");
  const [statusFilter, setStatusFilter] = useState<"open" | "pending" | "closed" | "all">("open");
  const [search, setSearch]         = useState("");

  const [accounts, setAccounts]     = useState<EmailAccount[]>([]);
  const [threads, setThreads]       = useState<EmailThread[]>([]);
  const [selected, setSelected]     = useState<EmailThread | null>(null);
  const [messages, setMessages]     = useState<EmailMessage[]>([]);
  const [canned, setCanned]         = useState<CannedResponse[]>([]);
  const [customer, setCustomer]     = useState<CustomerData | null>(null);
  const [overview, setOverview]     = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState("");
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [sending, setSending]           = useState(false);

  const [replyText, setReplyText]   = useState("");
  const [showCanned, setShowCanned] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  // Translations: msgId -> translated text
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating]   = useState<Record<string, boolean>>({});
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({});

  // Canned management
  const [showNewCanned, setShowNewCanned] = useState(false);
  const [newCannedTitle, setNewCannedTitle] = useState("");
  const [newCannedBody, setNewCannedBody]   = useState("");
  const [ticketCreating, setTicketCreating] = useState(false);
  const [ticketCreated, setTicketCreated]   = useState<string | null>(null);
  const [orderAction, setOrderAction]       = useState<string | null>(null); // orderId being actioned
  const [orderActionDone, setOrderActionDone] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAccounts(); fetchCanned(); }, [storeId]); // eslint-disable-line
  useEffect(() => { fetchThreads(); }, [storeId, statusFilter, search]); // eslint-disable-line
  useEffect(() => { if (selected) { fetchMessages(selected.id); fetchCustomer(selected.customer_email); } }, [selected?.id]); // eslint-disable-line
  useEffect(() => { if (tab === "overview") fetchOverview(); }, [tab, storeId]); // eslint-disable-line
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function fetchOverview() {
    setOverviewLoading(true);
    try {
      const r = await fetch(`${API}/api/inbox/overview?store_id=${storeId}`);
      const d = await r.json() as OverviewData;
      setOverview(d);
    } catch { /* silent */ }
    finally { setOverviewLoading(false); }
  }

  async function fetchAccounts() {
    try {
      const r = await fetch(`${API}/api/inbox/accounts?store_id=${storeId}`);
      const d = await r.json() as { accounts: EmailAccount[] };
      setAccounts(d.accounts ?? []);
    } catch { /* silent */ }
  }

  async function fetchThreads() {
    try {
      const qs = new URLSearchParams({ store_id: storeId, status: statusFilter });
      if (search) qs.set("q", search);
      const r = await fetch(`${API}/api/inbox/threads?${qs}`);
      const d = await r.json() as { threads: EmailThread[] };
      setThreads(d.threads ?? []);
    } catch { /* silent */ }
  }

  async function fetchMessages(threadId: string) {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`${API}/api/inbox/threads/${threadId}`);
      const d = await r.json() as { messages: EmailMessage[] };
      setMessages(d.messages ?? []);
    } catch { /* silent */ }
    finally { setLoadingMsgs(false); }
  }

  async function fetchCustomer(email: string) {
    setCustomer(null);
    if (!email) return;
    try {
      const r = await fetch(`${API}/api/inbox/customer?store_id=${storeId}&email=${encodeURIComponent(email)}`);
      const d = await r.json() as { customer: CustomerData | null };
      setCustomer(d.customer);
    } catch { /* silent */ }
  }

  async function fetchCanned() {
    try {
      const r = await fetch(`${API}/api/inbox/canned?store_id=${storeId}`);
      const d = await r.json() as { canned: CannedResponse[] };
      setCanned(d.canned ?? []);
    } catch { /* silent */ }
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch(`${API}/api/inbox/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId }),
      });
      const d = await r.json() as { ok: boolean; synced: number };
      setSyncMsg(d.synced > 0 ? `${d.synced} new` : "Up to date");
      await fetchThreads();
    } catch { setSyncMsg("Failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 3000); }
  }

  async function updateStatus(threadId: string, status: string) {
    await fetch(`${API}/api/inbox/threads/${threadId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSelected(prev => prev ? { ...prev, status: status as EmailThread["status"] } : null);
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, status: status as EmailThread["status"] } : t));
  }

  async function handleReply() {
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/inbox/threads/${selected.id}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText }),
      });
      const d = await r.json() as { ok: boolean };
      if (d.ok) {
        setReplyText("");
        await fetchMessages(selected.id);
        await updateStatus(selected.id, "pending");
      } else {
        alert("Failed to send — check that your email account is still connected.");
      }
    } catch { alert("Network error while sending."); }
    finally { setSending(false); }
  }

  async function handleTranslate(msgId: string, text: string) {
    setTranslating(prev => ({ ...prev, [msgId]: true }));
    const translated = await translateText(text);
    setTranslations(prev => ({ ...prev, [msgId]: translated }));
    setShowTranslated(prev => ({ ...prev, [msgId]: true }));
    setTranslating(prev => ({ ...prev, [msgId]: false }));
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm("Disconnect this email account?")) return;
    await fetch(`${API}/api/inbox/accounts/${id}`, { method: "DELETE" });
    await fetchAccounts();
  }

  async function saveCanned() {
    if (!newCannedTitle.trim() || !newCannedBody.trim()) return;
    await fetch(`${API}/api/inbox/canned`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: storeId, title: newCannedTitle, body: newCannedBody }),
    });
    setNewCannedTitle(""); setNewCannedBody("");
    setShowNewCanned(false);
    await fetchCanned();
  }

  async function deleteCanned(id: string) {
    await fetch(`${API}/api/inbox/canned/${id}`, { method: "DELETE" });
    await fetchCanned();
  }

  async function handleOrderAction(shopifyOrderId: string, action: "refund" | "cancel") {
    if (!selected) return;
    const label = action === "refund" ? "fully refund" : "cancel";
    if (!confirm(`Are you sure you want to ${label} order ${shopifyOrderId}? This cannot be undone.`)) return;
    setOrderAction(shopifyOrderId);
    try {
      const r = await fetch(`${API}/api/shopify/order-action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, shopify_order_id: shopifyOrderId, action }),
      });
      const d = await r.json() as { ok: boolean; error?: string };
      if (d.ok) {
        setOrderActionDone(p => ({ ...p, [shopifyOrderId]: action }));
        await fetchCustomer(selected.customer_email);
      } else {
        alert(d.error ?? "Actie mislukt — controleer Shopify credentials in Store instellingen");
      }
    } catch { alert("Netwerkfout"); }
    finally { setOrderAction(null); }
  }

  async function handleCreateTicket() {
    if (!selected || ticketCreating) return;
    setTicketCreating(true);
    try {
      const r = await fetch(`${API}/api/inbox/threads/${selected.id}/create-ticket`, { method: "POST" });
      const d = await r.json() as { ok: boolean; ticket_id?: string };
      if (d.ok) {
        setTicketCreated(d.ticket_id ?? "ok");
        setTimeout(() => setTicketCreated(null), 3000);
      }
    } catch { /* silent */ }
    finally { setTicketCreating(false); }
  }

  const openCount    = threads.filter(t => t.status === "open").length;
  const pendingCount = threads.filter(t => t.status === "pending").length;

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">

      {/* ── Left: thread list ───────────────────────────────────────────────── */}
      <div className="w-[300px] shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d13]">
        <div className="px-4 pt-5 pb-3 space-y-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setTab("inbox")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tab === "inbox" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"}`}>
                <Inbox size={11} /> Inbox
                {openCount > 0 && <span className={`rounded-full px-1 text-[9px] font-bold ${tab === "inbox" ? "bg-white/20" : "bg-blue-600 text-white"}`}>{openCount}</span>}
              </button>
              <button onClick={() => setTab("overview")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tab === "overview" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"}`}>
                <BarChart2 size={11} /> Overview
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {syncMsg && <span className="text-[10px] text-zinc-500">{syncMsg}</span>}
              <button onClick={handleSync} disabled={syncing} title="Sync emails"
                className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all disabled:opacity-40">
                <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => setShowConnect(true)} title="Connect account"
                className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all">
                <Mail size={13} />
              </button>
            </div>
          </div>

          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {stores.map(s => (
              <button key={s.id} onClick={() => { setStoreId(s.id); setSelected(null); }}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${storeId === s.id ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-white"}`}>
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 text-[11px]">
            {(["open", "pending", "closed", "all"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded-lg font-medium transition-all capitalize ${statusFilter === s ? "bg-white/10 text-white" : "text-zinc-600 hover:text-zinc-400"}`}>
                {s === "open" ? `Open${openCount > 0 ? ` (${openCount})` : ""}` :
                 s === "pending" ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` :
                 s === "closed" ? "Closed" : "All"}
              </button>
            ))}
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/40" />
        </div>

        {accounts.length > 0 && (
          <div className="px-3 py-2 border-b border-white/5 flex flex-wrap gap-1.5">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1">
                <span className={`text-[10px] font-bold ${PROVIDER_COLORS[a.provider]}`}>{a.provider === "gmail" ? "G" : "⊞"}</span>
                <span className="text-[10px] text-zinc-400 max-w-[100px] truncate">{a.email}</span>
                <button onClick={() => handleDeleteAccount(a.id)} className="text-zinc-600 hover:text-red-400 ml-0.5"><X size={9} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 px-4 text-center">
              <Inbox size={28} />
              <p className="text-xs">{accounts.length === 0 ? "Connect a Gmail or Outlook account to get started" : "No threads yet — click sync to fetch emails"}</p>
              {accounts.length === 0 && <button onClick={() => setShowConnect(true)} className="text-xs text-blue-400 underline">Connect account</button>}
            </div>
          )}
          {threads.map(t => {
            const isSelected = selected?.id === t.id;
            const isUrgent   = t.priority === "urgent";
            const isHigh     = t.priority === "high";
            return (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/4 transition-all group
                  ${isSelected ? "bg-blue-600/10 border-l-2 border-l-blue-500 pl-2.5" : "hover:bg-white/4"}
                  ${isUrgent ? "border-l-2 border-l-red-500 pl-2.5" : ""}
                `}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={t.customer_name} email={t.customer_email} size={30} />
                  <div className="flex-1 min-w-0">
                    {/* Row 1: name + time */}
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-[11px] font-bold truncate ${isSelected ? "text-white" : "text-zinc-200"}`}>
                        {t.customer_name || t.customer_email.split("@")[0]}
                      </span>
                      <span className="text-[10px] text-zinc-600 shrink-0 tabular-nums">{timeAgo(t.last_message_at)}</span>
                    </div>
                    {/* Row 2: subject */}
                    <p className="text-[10px] text-zinc-500 truncate leading-snug">{t.subject || "(no subject)"}</p>
                    {/* Row 3: indicators */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {isUrgent && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded">URGENT</span>}
                      {isHigh   && <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1 rounded">HIGH</span>}
                      {t.status !== "open" && (
                        <span className={`text-[9px] font-semibold px-1 rounded ${STATUS_STYLES[t.status]?.cls}`}>
                          {STATUS_STYLES[t.status]?.label}
                        </span>
                      )}
                      <span className={`text-[9px] ${PROVIDER_COLORS[t.provider]}`}>
                        {t.provider === "gmail" ? "G" : "⊞"}
                      </span>
                      {t.message_count > 1 && (
                        <span className="text-[9px] text-zinc-700 ml-auto">{t.message_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Center: conversation / overview ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {tab === "overview" ? (
          <OverviewPanel data={overview} storeId={storeId} loading={overviewLoading} />
        ) : !selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 flex-col gap-3">
            <Mail size={40} />
            <p className="text-sm">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate">{selected.subject}</h2>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {selected.customer_name && `${selected.customer_name} · `}{selected.customer_email}
                  {selected.account_email && ` → ${selected.account_email}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative group">
                  <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${STATUS_STYLES[selected.status]?.cls}`}>
                    {STATUS_STYLES[selected.status]?.label}<ChevronDown size={11} />
                  </button>
                  <div className="absolute right-0 top-full mt-1 bg-[#18181f] border border-white/10 rounded-xl shadow-xl py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10 min-w-[130px]">
                    {(["open", "pending", "closed"] as const).map(s => (
                      <button key={s} onClick={() => updateStatus(selected.id, s)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${selected.status === s ? "text-blue-400 font-semibold" : "text-zinc-400"}`}>
                        {STATUS_STYLES[s].label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => updateStatus(selected.id, "closed")} title="Close ticket"
                  className="p-1.5 rounded-lg text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"><CheckCheck size={14} /></button>
                <button onClick={() => updateStatus(selected.id, "pending")} title="Mark as pending"
                  className="p-1.5 rounded-lg text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 transition-all"><Clock size={14} /></button>
                <button onClick={handleCreateTicket} disabled={ticketCreating}
                  title="Create CS ticket from this email"
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40 ${ticketCreated ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-zinc-400 hover:bg-blue-500/10 hover:text-blue-400 border border-white/8"}`}>
                  {ticketCreating ? <Loader2 size={11} className="animate-spin" /> : ticketCreated ? <CheckCheck size={11} /> : <Zap size={11} />}
                  {ticketCreated ? "Ticket created!" : "Create ticket"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {loadingMsgs && <div className="flex items-center gap-2 text-zinc-600 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
              {messages.map(msg => {
                const isOut = msg.direction === "outbound";
                const rawText = msg.body_text || msg.body_html?.replace(/<[^>]+>/g, "") || "";
                const isTranslating = translating[msg.id];
                const translated    = translations[msg.id];
                const showingTrans  = showTranslated[msg.id];

                return (
                  <div key={msg.id} className={`flex gap-3 ${isOut ? "flex-row-reverse" : ""}`}>
                    {!isOut && <Avatar name={msg.from_name} email={msg.from_email} size={32} />}
                    <div className={`max-w-[75%] space-y-1.5 ${isOut ? "items-end flex flex-col" : ""}`}>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                        {!isOut && <span className="font-semibold text-zinc-400">{msg.from_name || msg.from_email}</span>}
                        {isOut && <span className="text-emerald-600 font-semibold">You</span>}
                        <span>{timeAgo(msg.sent_at)}</span>
                        {!isOut && (
                          <button
                            onClick={() => showingTrans
                              ? setShowTranslated(p => ({ ...p, [msg.id]: false }))
                              : handleTranslate(msg.id, rawText)}
                            disabled={isTranslating}
                            className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-blue-400 transition-colors disabled:opacity-40"
                          >
                            {isTranslating ? <Loader2 size={9} className="animate-spin" /> : <Languages size={10} />}
                            {showingTrans ? "Original" : "Translate →EN"}
                          </button>
                        )}
                      </div>

                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isOut ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white/5 border border-white/8 text-zinc-200 rounded-tl-sm"}`}>
                        {showingTrans && translated ? (
                          <div className="space-y-2">
                            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Translation (EN)</p>
                            <p className="whitespace-pre-wrap">{translated}</p>
                            <div className="border-t border-white/10 pt-2">
                              <p className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mb-1">Original (FR)</p>
                              <p className="whitespace-pre-wrap text-zinc-500 text-xs">{rawText}</p>
                            </div>
                          </div>
                        ) : msg.body_html ? (
                          <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: msg.body_html }} />
                        ) : (
                          <p className="whitespace-pre-wrap">{rawText || "(empty)"}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply composer */}
            <div className="shrink-0 border-t border-white/5 px-6 py-4 space-y-3">
              <div className="relative">
                {showCanned && (
                  <CannedPicker
                    canned={canned}
                    onSelect={text => setReplyText(text)}
                    onClose={() => setShowCanned(false)}
                    vars={{
                      "customer.name":   selected?.customer_name || customer?.name || "",
                      "customer.email":  selected?.customer_email || "",
                      "order.number":    customer?.orders?.[0]?.order_number || "",
                      "store.name":      storeId,
                    }}
                  />
                )}
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply(); }}
                  placeholder="Write your reply in French… (Ctrl+Enter to send)"
                  rows={3}
                  className="w-full bg-white/4 border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-700 outline-none focus:border-blue-500/50 transition-colors resize-none" />
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setShowCanned(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <Zap size={12} /> Insert template
                </button>
                <button onClick={handleReply} disabled={sending || !replyText.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-xl px-4 py-2 text-xs font-semibold">
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right: Gorgias-stijl klantpaneel ──────────────────────────────── */}
      <div className="w-[310px] shrink-0 border-l border-white/5 bg-[#0d0d13] flex flex-col overflow-y-auto">
        {selected ? (
          <div className="divide-y divide-white/5">

            {/* ── Customer profile ── */}
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Customer</p>
              <div className="flex items-center gap-3">
                <Avatar name={selected.customer_name} email={selected.customer_email} size={44} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {selected.customer_name || customer?.name || "Unknown"}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">{selected.customer_email}</p>
                  {customer?.phone && (
                    <p className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                      <Phone size={9} /> {customer.phone}
                    </p>
                  )}
                  {(customer?.city || customer?.country) && (
                    <p className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                      <MapPin size={9} /> {[customer.city, customer.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* LTV metrics */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/4 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-black text-white">{customer?.total_orders ?? "—"}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">Orders</p>
                </div>
                <div className="bg-white/4 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-black text-emerald-400">
                    {customer ? `€${customer.total_spend.toFixed(0)}` : "—"}
                  </p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">LTV</p>
                </div>
                <div className={`rounded-xl p-2.5 text-center ${(customer?.ticket_count ?? 0) > 0 ? "bg-amber-500/10" : "bg-white/4"}`}>
                  <p className={`text-lg font-black ${(customer?.ticket_count ?? 0) > 0 ? "text-amber-400" : "text-white"}`}>
                    {customer?.ticket_count ?? "—"}
                  </p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">Tickets</p>
                </div>
              </div>

              {/* Conversation info */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-600">Channel</span>
                  <span className={`font-semibold ${PROVIDER_COLORS[selected.provider]}`}>
                    {selected.provider === "gmail" ? "Gmail" : "Outlook"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-600">Status</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded-full border text-[9px] ${STATUS_STYLES[selected.status]?.cls}`}>
                    {STATUS_STYLES[selected.status]?.label}
                  </span>
                </div>
                {(selected.priority === "urgent" || selected.priority === "high") && (
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-zinc-600">Priority</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded-full border text-[9px] ${PRIORITY_STYLES[selected.priority]?.cls}`}>
                      {PRIORITY_STYLES[selected.priority]?.label}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-600">Messages</span>
                  <span className="text-white font-semibold">{messages.length}</span>
                </div>
              </div>
            </div>

            {/* ── Orders ── */}
            <div className="p-4 space-y-2">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                <ShoppingBag size={10} /> Orders
              </p>
              {!customer ? (
                <p className="text-[11px] text-zinc-700 py-2">Loading…</p>
              ) : customer.orders.length === 0 ? (
                <p className="text-[11px] text-zinc-700 py-2">No orders found</p>
              ) : (
                <div className="space-y-2">
                  {customer.orders.map(o => {
                    const isDone = orderActionDone[o.shopify_order_id];
                    const isBusy = orderAction === o.shopify_order_id;
                    const fulfillCls =
                      o.fulfillment_status === "fulfilled"  ? "text-emerald-400 bg-emerald-500/10" :
                      o.fulfillment_status === "partial"    ? "text-amber-400 bg-amber-500/10" :
                                                              "text-zinc-500 bg-white/5";
                    const fulfillLabel =
                      o.fulfillment_status === "fulfilled" ? "Shipped" :
                      o.fulfillment_status === "partial"   ? "Partial" : "Unfulfilled";
                    const financialCls =
                      o.financial_status === "refunded" || o.financial_status === "voided" ? "text-red-400 bg-red-500/10" :
                      o.financial_status === "partially_refunded"                          ? "text-orange-400 bg-orange-500/10" :
                      o.financial_status === "paid"                                        ? "text-emerald-400 bg-emerald-500/10" :
                                                                                            "text-zinc-500 bg-white/5";
                    const financialLabel =
                      o.financial_status === "refunded"           ? "Refunded" :
                      o.financial_status === "voided"             ? "Cancelled" :
                      o.financial_status === "partially_refunded" ? "Partially refunded" :
                      o.financial_status === "paid"               ? "Paid" :
                                                                    o.financial_status ?? "—";
                    return (
                      <div key={o.id ?? o.shopify_order_id} className="bg-white/4 border border-white/5 rounded-xl p-3 space-y-2">
                        {/* Order header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-white">
                              #{o.order_number || o.shopify_order_id}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDate(o.created_at)}</p>
                          </div>
                          <p className="text-sm font-black text-emerald-400 shrink-0">
                            €{(o.revenue ?? 0).toFixed(2)}
                          </p>
                        </div>
                        {/* Status badges */}
                        <div className="flex flex-wrap gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${financialCls}`}>{financialLabel}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fulfillCls}`}>{fulfillLabel}</span>
                        </div>
                        {/* Tracking */}
                        {o.tracking_number && (
                          <a
                            href={o.tracking_url || "#"}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <Truck size={9} /> {o.tracking_number}
                          </a>
                        )}
                        {/* Items */}
                        {o.items && o.items.length > 0 && (
                          <div className="space-y-0.5 border-t border-white/5 pt-2">
                            {o.items.map((item, ii) => (
                              <div key={ii} className="flex items-start justify-between gap-1">
                                <p className="text-[10px] text-zinc-400 leading-tight flex-1 min-w-0">
                                  <span className="text-zinc-600">{item.quantity}×</span> {item.product_title}
                                  {item.variant_title && item.variant_title !== "Default Title" && (
                                    <span className="text-zinc-600"> · {item.variant_title}</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-zinc-500 shrink-0">€{(item.revenue ?? 0).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Order actions */}
                        {!isDone && o.financial_status !== "refunded" && o.financial_status !== "voided" && (
                          <div className="flex gap-1.5 border-t border-white/5 pt-2">
                            <button
                              onClick={() => handleOrderAction(o.shopify_order_id, "refund")}
                              disabled={!!isBusy}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 transition-all"
                            >
                              {isBusy ? <Loader2 size={9} className="animate-spin" /> : null}
                              Refund
                            </button>
                            <button
                              onClick={() => handleOrderAction(o.shopify_order_id, "cancel")}
                              disabled={!!isBusy}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 bg-white/5 hover:bg-white/10 disabled:opacity-40 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {isDone && (
                          <p className="text-[10px] text-emerald-400 text-center pt-1 border-t border-white/5">
                            {isDone === "refund" ? "Refunded" : "Cancelled"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Previous tickets ── */}
            {customer && customer.tickets.length > 0 && (
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Previous tickets</p>
                <div className="space-y-1.5">
                  {customer.tickets.map(t => (
                    <a key={t.id} href="/customer-service"
                      className="flex items-start gap-2 bg-white/3 hover:bg-white/5 rounded-xl px-3 py-2 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-300 group-hover:text-white truncate transition-colors">{t.subject || "No subject"}</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5">{fmtDate(t.created_at)}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5 ${STATUS_STYLES[t.status]?.cls ?? ""}`}>
                        {STATUS_STYLES[t.status]?.label ?? t.status}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="p-4 space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Actions</p>
              <button onClick={() => updateStatus(selected.id, "closed")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all">
                <CheckCheck size={13} /> Close
              </button>
              <button onClick={() => updateStatus(selected.id, "pending")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:bg-amber-500/10 hover:text-amber-400 transition-all">
                <Clock size={13} /> Mark as pending
              </button>
              <button onClick={() => updateStatus(selected.id, "open")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:bg-blue-500/10 hover:text-blue-400 transition-all">
                <Archive size={13} /> Reopen
              </button>
              <button onClick={handleCreateTicket} disabled={ticketCreating}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-40 ${
                  ticketCreated ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400 hover:bg-purple-500/10 hover:text-purple-400"
                }`}>
                {ticketCreating ? <Loader2 size={13} className="animate-spin" /> : ticketCreated ? <CheckCheck size={13} /> : <Zap size={13} />}
                {ticketCreated ? "Ticket created!" : "Create CS ticket"}
              </button>
            </div>

          </div>
        ) : (
          /* Geen thread geselecteerd — templates beheer */
          <div className="p-4 space-y-4">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Templates ({canned.length})</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {canned.map(cr => (
                <div key={cr.id} className="flex items-start gap-2 bg-white/3 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white">{cr.title}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5 line-clamp-1">{cr.body}</p>
                  </div>
                  <button onClick={() => deleteCanned(cr.id)} className="text-zinc-700 hover:text-red-400 transition-colors shrink-0 mt-0.5"><Trash2 size={11} /></button>
                </div>
              ))}
              {canned.length === 0 && <p className="text-[11px] text-zinc-600 text-center py-2">No templates</p>}
            </div>

            {showNewCanned ? (
              <div className="space-y-2">
                <input value={newCannedTitle} onChange={e => setNewCannedTitle(e.target.value)} placeholder="Template name"
                  className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/40" />
                <textarea value={newCannedBody} onChange={e => setNewCannedBody(e.target.value)} placeholder="Content…" rows={4}
                  className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/40 resize-none" />
                <div className="flex gap-1.5">
                  <button onClick={saveCanned} className="flex-1 bg-blue-600 hover:bg-blue-500 transition-all rounded-lg py-1.5 text-xs font-semibold">Save</button>
                  <button onClick={() => setShowNewCanned(false)} className="flex-1 bg-white/5 hover:bg-white/10 transition-all rounded-lg py-1.5 text-xs text-zinc-400">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNewCanned(true)} className="w-full bg-white/5 hover:bg-white/10 transition-all rounded-xl py-2 text-xs font-medium text-zinc-400 hover:text-white">
                + New template
              </button>
            )}

            <div className="pt-2 border-t border-white/5 space-y-2">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Connected accounts</p>
              {accounts.map(a => (
                <div key={a.id} className="flex items-center gap-2 bg-white/3 rounded-xl px-3 py-2">
                  <span className={`text-xs font-bold ${PROVIDER_COLORS[a.provider]}`}>{a.provider === "gmail" ? "G" : "⊞"}</span>
                  <span className="text-[11px] text-zinc-400 flex-1 min-w-0 truncate">{a.email}</span>
                  <button onClick={() => handleDeleteAccount(a.id)} className="text-zinc-700 hover:text-red-400 transition-colors"><X size={11} /></button>
                </div>
              ))}
              {accounts.length === 0 && <p className="text-[11px] text-zinc-600">No accounts connected</p>}
              <button onClick={() => setShowConnect(true)} className="w-full bg-white/5 hover:bg-white/10 transition-all rounded-xl py-2 text-xs font-medium text-zinc-400 hover:text-white">
                + Connect account
              </button>
            </div>
          </div>
        )}
      </div>

      {showConnect && <ConnectModal storeId={storeId} onClose={() => { setShowConnect(false); fetchAccounts(); }} />}
    </div>
  );
}
