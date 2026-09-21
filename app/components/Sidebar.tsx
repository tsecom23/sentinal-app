"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Bot, Box,
  LayoutDashboard, LineChart, LogOut, MessageCircle,
  RotateCcw, ShoppingCart, Skull, Store,
  Target, TrendingUp, Trophy, Users, Wifi, Heart, X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { createClient } from "../../utils/supabase/client";
import { canAccess } from "../lib/roles";

const NAV = [
  {
    section: "COMMAND",
    color: "#8b5cf6",
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
    color: "#a855f7",
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
      { label: "Product Health", href: "/product-health", icon: Heart },
      { label: "Returns",        href: "/returns",        icon: RotateCcw },
      { label: "Dead Stock",     href: "/dead-stock",     icon: Skull },
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

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
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
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}
    <aside
      className={`w-[220px] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 select-none transition-transform duration-200
        ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* ── Brand ──────────────────────────────── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <a href="/" className="flex items-center gap-3 group flex-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              boxShadow: "0 0 20px rgba(139,92,246,0.40), 0 0 40px rgba(139,92,246,0.12)",
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
              style={{ color: "var(--text)", letterSpacing: "-0.01em" }}
            >
              Sentinel
            </div>
            <div className="text-[9px] font-mono tracking-[0.15em] mt-0.5" style={{ color: "#8b5cf6", opacity: 0.8 }}>
              AI COMMERCE OS
            </div>
          </div>
        </a>
          {/* Mobile close button */}
          <button
            className="md:hidden p-1.5 rounded-lg"
            style={{ color: "var(--muted)" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Live clock */}
        <div
          className="mt-3 rounded-lg px-3 py-2 font-mono"
          style={{ background: "var(--clock-bg)", border: "1px solid var(--clock-border)" }}
        >
          <div className="flex items-center justify-between">
            <div
              className="text-[13px] font-bold tabular-nums"
              style={{ color: "var(--clock-color)", fontVariantNumeric: "tabular-nums" }}
            >
              {time}
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse-dot 2s ease-in-out infinite" }}
              />
            </div>
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: "var(--date-color)" }}>{date}</div>
        </div>
      </div>

      {/* ── Nav ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-2">
        {visibleNav.map(group => (
          <div key={group.section}>
            <div className="flex items-center gap-1.5 px-2 mb-1.5">
              <span className="text-[9px] font-mono font-black tracking-[0.25em]" style={{ color: group.color, opacity: 0.5 }}>
                //
              </span>
              <span className="text-[9px] font-mono font-black tracking-[0.2em]" style={{ color: group.color, opacity: 0.7 }}>
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
                      color: active ? group.color : "#6b7280",
                      background: active ? `${group.color}14` : "transparent",
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
          background: "var(--system-bg)",
          border: "1px solid var(--system-border)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Wifi
            size={9}
            className="text-violet-400"
            style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
          />
          <span className="text-[9px] font-mono font-black text-violet-400 tracking-[0.2em]">AGENT ONLINE</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "var(--status-label)" }}>STATUS</span>
            <span className="text-[9px] font-mono text-emerald-500 font-bold">ACTIVE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "var(--status-label)" }}>STORES</span>
            <span className="text-[9px] font-mono text-violet-500 font-bold">3 LIVE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono" style={{ color: "var(--status-label)" }}>ENGINE</span>
            <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>ZenoX · PMax</span>
          </div>
        </div>
      </div>

      {/* ── Sign out ───────────────────────────── */}
      <button
        onClick={signOut}
        className="mx-3 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono transition-all"
        style={{ color: "var(--muted)" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}
      >
        <LogOut size={10} />
        Sign out
      </button>
    </aside>
    </>
  );
}
