"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, Bell, Bot, Box,
  LogOut, MessageCircle, Package,
  RotateCcw, ShoppingCart, Skull, Store, Target,
  TrendingUp, Trophy, Users, Zap, Radio,
  LayoutDashboard, LineChart,
} from "lucide-react";
import { createClient } from "../../utils/supabase/client";
import { canAccess, defaultPath } from "../lib/roles";

const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    color: "#34d399",   // emerald
    dimColor: "rgba(52,211,153,0.08)",
    items: [
      { label: "Dashboard",  href: "/",           icon: LayoutDashboard },
      { label: "Orders",     href: "/orders",     icon: ShoppingCart },
      { label: "P&L",        href: "/pnl",        icon: TrendingUp },
      { label: "Customers",  href: "/customers",  icon: Users },
      { label: "Milestones", href: "/milestones", icon: Trophy },
      { label: "Stores",     href: "/stores",     icon: Store },
    ],
  },
  {
    id: "buyer",
    label: "Media Buyer",
    color: "#a78bfa",   // purple
    dimColor: "rgba(167,139,250,0.08)",
    items: [
      { label: "ROAS Tracker",   href: "/roas-tracker",     icon: LineChart },
      { label: "Google Ads",     href: "/google-ads",       icon: BarChart3 },
      { label: "Product Ads",    href: "/product-ads",      icon: Package },
      { label: "Product Stats",  href: "/product-insights", icon: Box },
      { label: "Scale Command",  href: "/scale-command",    icon: Target },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    color: "#fbbf24",   // amber
    dimColor: "rgba(251,191,36,0.08)",
    items: [
      { label: "Returns & Disputes", href: "/returns",    icon: RotateCcw },
      { label: "Dead Stock",         href: "/dead-stock", icon: Skull },
    ],
  },
  {
    id: "ai",
    label: "AI Tools",
    color: "#f472b6",   // pink
    dimColor: "rgba(244,114,182,0.08)",
    items: [
      { label: "AI Chat",          href: "/ai-chat",            icon: MessageCircle },
      { label: "Recommendations",  href: "/ai-recommendations", icon: Bot },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    color: "#94a3b8",   // slate
    dimColor: "rgba(148,163,184,0.06)",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    // Clock tick every minute for the live time display
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const visibleSections = SECTIONS.map(sec => ({
    ...sec,
    items: sec.items.filter(item => canAccess(userEmail, item.href)),
  })).filter(sec => sec.items.length > 0);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  // Find which section the current page belongs to
  const activeSection = visibleSections.find(sec => sec.items.some(i => isActive(i.href)));

  return (
    <aside
      className="w-[240px] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40"
      style={{
        background: "linear-gradient(180deg, #0B0F1A 0%, #080B16 100%)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <a href="/" className="flex items-center gap-3 px-5 pt-6 pb-5 group">
        {/* Icon */}
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)",
            boxShadow: "0 0 20px rgba(34,211,238,0.25)",
          }}
        >
          <span className="text-white font-black text-[11px] tracking-tight font-mono relative z-10">TS</span>
          {/* scan line animation */}
          <div
            className="absolute inset-x-0 h-px bg-white/30 animate-scan pointer-events-none"
            style={{ top: 0 }}
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-mono font-black tracking-tight text-white">Sentinel</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot shrink-0" />
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              {dateStr} · {timeStr}
            </span>
          </div>
        </div>
      </a>

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {visibleSections.map(sec => (
          <div key={sec.id}>
            {/* Section label */}
            <div className="flex items-center gap-2 px-2 mb-1.5">
              <div
                className="h-1 w-1 rounded-full shrink-0"
                style={{ background: sec.color, boxShadow: `0 0 6px ${sec.color}` }}
              />
              <span
                className="text-[9px] font-mono font-bold uppercase tracking-[0.2em]"
                style={{ color: sec.color, opacity: 0.7 }}
              >
                {sec.label}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-0.5">
              {sec.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <a
                    key={href}
                    href={href}
                    className="relative flex items-center gap-3 px-3 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-150 group"
                    style={active ? {
                      background: sec.dimColor,
                      color: sec.color,
                    } : {
                      color: "#71717a",
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.color = "#a1a1aa";
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.color = "#71717a";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }
                    }}
                  >
                    {/* Active left bar */}
                    {active && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                        style={{ background: sec.color, boxShadow: `0 0 8px ${sec.color}` }}
                      />
                    )}
                    <Icon
                      size={14}
                      className="shrink-0 transition-colors"
                      style={{ color: active ? sec.color : undefined }}
                    />
                    <span className="flex-1 truncate font-mono">{label}</span>
                    {active && (
                      <div
                        className="h-1 w-1 rounded-full shrink-0"
                        style={{ background: sec.color }}
                      />
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── AI Status ─────────────────────────────────────────── */}
      <div className="mx-3 mb-3 rounded-xl border p-3 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(34,211,238,0.05) 0%, rgba(99,102,241,0.05) 100%)",
          borderColor: "rgba(34,211,238,0.1)",
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Radio size={9} className="text-cyan-400 animate-pulse" />
            <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-[0.15em]">Agent Active</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-600">v2</span>
        </div>
        <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
          Monitoring margins · kills · scaling signals
        </p>
        {/* Animated glow line */}
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)" }}
        />
      </div>

      {/* ── Sign out ──────────────────────────────────────────── */}
      <button
        onClick={signOut}
        className="mx-3 mb-4 flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-600 hover:text-rose-400 transition-colors text-[11px] font-mono font-medium"
        style={{ background: "transparent" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(244,63,94,0.06)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <LogOut size={12} />
        Sign out
      </button>
    </aside>
  );
}
