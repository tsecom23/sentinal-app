"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Bot, Box,
  LayoutDashboard, LineChart, LogOut, MessageCircle,
  RotateCcw, ShoppingCart, Skull, Store,
  Target, TrendingUp, Trophy, Users, Wifi,
} from "lucide-react";
import { createClient } from "../../utils/supabase/client";
import { canAccess } from "../lib/roles";

const NAV = [
  {
    section: "COMMAND",
    color: "#22d3ee",
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
    section: "MEDIA",
    color: "#a78bfa",
    items: [
      { label: "ROAS Tracker",  href: "/roas-tracker",     icon: LineChart },
      { label: "Google Ads",    href: "/google-ads",       icon: BarChart3 },
      { label: "Product Ads",   href: "/product-ads",      icon: Box },
      { label: "Product Stats", href: "/product-insights", icon: Box },
      { label: "Scale",         href: "/scale-command",    icon: Target },
    ],
  },
  {
    section: "OPS",
    color: "#fb923c",
    items: [
      { label: "Returns",    href: "/returns",    icon: RotateCcw },
      { label: "Dead Stock", href: "/dead-stock", icon: Skull },
    ],
  },
  {
    section: "AI",
    color: "#f472b6",
    items: [
      { label: "AI Chat",         href: "/ai-chat",            icon: MessageCircle },
      { label: "Recommendations", href: "/ai-recommendations", icon: Bot },
      { label: "Notifications",   href: "/notifications",      icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [time, setTime]   = useState("");
  const [date, setDate]   = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDate(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const visibleNav = NAV.map(g => ({
    ...g,
    items: g.items.filter(i => canAccess(email, i.href)),
  })).filter(g => g.items.length > 0);

  return (
    <aside
      className="w-[220px] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 select-none"
      style={{
        background: "linear-gradient(180deg, #040810 0%, #030609 100%)",
        borderRight: "1px solid rgba(34,211,238,0.08)",
      }}
    >
      {/* ── Brand ──────────────────────────────── */}
      <div className="px-4 pt-5 pb-4">
        <a href="/" className="flex items-center gap-3 group">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #4f46e5)",
              boxShadow: "0 0 20px rgba(6,182,212,0.35), 0 0 40px rgba(6,182,212,0.1)",
            }}
          >
            <span className="text-white text-[11px] font-black tracking-tight font-mono z-10 relative">TS</span>
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                animation: "shine 4s ease-in-out infinite",
              }}
            />
          </div>
          <div>
            <div
              className="text-[14px] font-mono font-black tracking-tight"
              style={{ color: "#e2e8f0", letterSpacing: "-0.01em" }}
            >
              Sentinel
            </div>
            <div className="text-[9px] font-mono tracking-[0.15em] mt-0.5" style={{ color: "#22d3ee", opacity: 0.7 }}>
              AI COMMERCE OS
            </div>
          </div>
        </a>

        {/* Live clock */}
        <div
          className="mt-3 rounded-lg px-3 py-2 font-mono"
          style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.08)" }}
        >
          <div className="flex items-center justify-between">
            <div
              className="text-[13px] font-bold tabular-nums"
              style={{ color: "#22d3ee", fontVariantNumeric: "tabular-nums" }}
            >
              {time}
            </div>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse-dot 2s ease-in-out infinite" }}
            />
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: "#475569" }}>{date}</div>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-2">
        {visibleNav.map(group => (
          <div key={group.section}>
            <div
              className="flex items-center gap-1.5 px-2 mb-1.5"
            >
              <span
                className="text-[9px] font-mono font-black tracking-[0.25em]"
                style={{ color: group.color, opacity: 0.5 }}
              >
                //
              </span>
              <span
                className="text-[9px] font-mono font-black tracking-[0.2em]"
                style={{ color: group.color, opacity: 0.7 }}
              >
                {group.section}
              </span>
            </div>
            <div className="space-y-px">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-mono transition-all duration-100 relative"
                    style={{
                      color: active ? group.color : "#64748b",
                      background: active ? `${group.color}12` : "transparent",
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {active && (
                      <div
                        className="absolute left-0 inset-y-1.5 w-[2px] rounded-r"
                        style={{
                          background: group.color,
                          boxShadow: `0 0 8px ${group.color}`,
                        }}
                      />
                    )}
                    <Icon size={12} className="shrink-0" />
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── System status ──────────────────────── */}
      <div
        className="mx-3 mb-3 rounded-xl p-3 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(34,211,238,0.05) 0%, rgba(34,211,238,0.02) 100%)",
          border: "1px solid rgba(34,211,238,0.1)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Wifi
            size={9}
            className="text-cyan-400"
            style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
          />
          <span className="text-[9px] font-mono font-black text-cyan-400 tracking-[0.2em]">AGENT ONLINE</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "#475569" }}>STATUS</span>
            <span className="text-[9px] font-mono text-emerald-400 font-bold">ACTIVE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "#475569" }}>STORES</span>
            <span className="text-[9px] font-mono text-cyan-400 font-bold">3 LIVE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "#475569" }}>ENGINE</span>
            <span className="text-[9px] font-mono" style={{ color: "#64748b" }}>ZenoX · PMax</span>
          </div>
        </div>
      </div>

      {/* ── Sign out ───────────────────────────── */}
      <button
        onClick={signOut}
        className="mx-3 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono transition-all"
        style={{ color: "#475569" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.background = "transparent"; }}
      >
        <LogOut size={10} />
        Sign out
      </button>
    </aside>
  );
}
