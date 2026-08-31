"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, Bell, Bot, Box,
  LogOut, MessageCircle, Package,
  RotateCcw, ShoppingCart, Skull, Store, Target,
  TrendingUp, Trophy, Users, Zap,
  LayoutDashboard, LineChart, Wifi,
} from "lucide-react";
import { createClient } from "../../utils/supabase/client";
import { canAccess } from "../lib/roles";

const NAV = [
  {
    section: "Command",
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
    section: "Media",
    color: "#a78bfa",
    items: [
      { label: "ROAS Tracker",  href: "/roas-tracker",     icon: LineChart },
      { label: "Google Ads",    href: "/google-ads",       icon: BarChart3 },
      { label: "Product Ads",   href: "/product-ads",      icon: Package },
      { label: "Product Stats", href: "/product-insights", icon: Box },
      { label: "Scale",         href: "/scale-command",    icon: Target },
    ],
  },
  {
    section: "Ops",
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
      { label: "AI Chat",          href: "/ai-chat",            icon: MessageCircle },
      { label: "Recommendations",  href: "/ai-recommendations", icon: Bot },
      { label: "Notifications",    href: "/notifications",      icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const pathname  = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [time, setTime]   = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 5000);
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
      style={{ background: "#0A0D18", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* ── Brand ──────────────────────────── */}
      <div className="px-4 pt-5 pb-4">
        <a href="/" className="flex items-center gap-3 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, #22d3ee, #6366f1)",
              boxShadow: "0 0 16px rgba(34,211,238,0.3)",
            }}
          >
            <span className="text-white text-[11px] font-black tracking-tight font-mono z-10 relative">TS</span>
            {/* animated shine */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
                animation: "shine 3s ease-in-out infinite",
              }}
            />
          </div>
          <div>
            <div className="text-[13px] font-mono font-bold text-white tracking-tight">Sentinel</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"
                style={{ animation: "pulse-dot 2.5s ease-in-out infinite" }}
              />
              <span className="text-[9px] font-mono text-zinc-500 tabular-nums">{time}</span>
            </div>
          </div>
        </a>
      </div>

      {/* ── Nav ────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-2">
        {visibleNav.map(group => (
          <div key={group.section}>
            {/* Section label */}
            <div
              className="text-[8px] font-mono font-bold uppercase tracking-[0.25em] px-2 mb-1"
              style={{ color: group.color, opacity: 0.5 }}
            >
              {group.section}
            </div>

            {/* Items — always visible */}
            <div className="space-y-px">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-mono transition-all duration-100 relative"
                    style={{
                      color: active ? group.color : "#52525b",
                      background: active ? `${group.color}12` : "transparent",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {/* Active bar */}
                    {active && (
                      <div
                        className="absolute left-0 inset-y-1.5 w-[2px] rounded-r"
                        style={{
                          background: group.color,
                          boxShadow: `0 0 6px ${group.color}`,
                        }}
                      />
                    )}
                    <Icon size={13} className="shrink-0" />
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Agent pulse card ───────────────── */}
      <div className="mx-3 mb-3 rounded-xl p-3 relative overflow-hidden"
        style={{
          background: "rgba(34,211,238,0.05)",
          border: "1px solid rgba(34,211,238,0.1)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Wifi
            size={9}
            className="text-cyan-400"
            style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
          />
          <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-widest">Agent Active</span>
        </div>
        <p className="text-[9px] font-mono text-zinc-600 leading-relaxed">
          Margins · kills · scaling
        </p>
      </div>

      {/* ── Sign out ───────────────────────── */}
      <button
        onClick={signOut}
        className="mx-3 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono text-zinc-600 hover:text-rose-400 hover:bg-rose-400/5 transition-all"
      >
        <LogOut size={11} />
        Sign out
      </button>

      {/* ── CSS animations (injected once) ── */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
        @keyframes shine {
          0% { transform: translateX(-100%); }
          50%, 100% { transform: translateX(100%); }
        }
      `}</style>
    </aside>
  );
}
