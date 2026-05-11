"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Activity, BarChart3, Bell, Bot, Box, ChevronRight,
  Headphones, Inbox, LogOut, MessageCircle, Package,
  RotateCcw, ShoppingCart, Skull, Store, Target,
  TrendingUp, Trophy, Users, Zap,
} from "lucide-react";
import { createClient } from "../../utils/supabase/client";

const GROUPS = [
  {
    id: "owner",
    label: "Overzicht",
    icon: Activity,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    items: [
      { label: "Dashboard",   href: "/",           icon: Activity },
      { label: "Bestellingen",href: "/orders",     icon: ShoppingCart },
      { label: "P&L",         href: "/pnl",        icon: TrendingUp },
      { label: "Klanten",     href: "/customers",  icon: Users },
      { label: "Milestones",  href: "/milestones", icon: Trophy },
      { label: "Stores",      href: "/stores",     icon: Store },
    ],
  },
  {
    id: "cs",
    label: "Customer Service",
    icon: Headphones,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    items: [
      { label: "Inbox",    href: "/inbox",            icon: Inbox },
      { label: "Tickets",  href: "/customer-service", icon: Headphones },
    ],
  },
  {
    id: "buyer",
    label: "Media Buyer",
    icon: Target,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    items: [
      { label: "Google Ads",       href: "/google-ads",       icon: BarChart3 },
      { label: "Product Ads",      href: "/product-ads",      icon: Package },
      { label: "Product Stats",    href: "/product-insights", icon: Box },
      { label: "Scale Command",    href: "/scale-command",    icon: Target },
    ],
  },
  {
    id: "ops",
    label: "Operaties",
    icon: RotateCcw,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    items: [
      { label: "Retouren & Disputes", href: "/returns",    icon: RotateCcw },
      { label: "Dead Stock",          href: "/dead-stock", icon: Skull },
    ],
  },
  {
    id: "ai",
    label: "AI Tools",
    icon: Bot,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    items: [
      { label: "AI Chat",        href: "/ai-chat",            icon: MessageCircle },
      { label: "Aanbevelingen",  href: "/ai-recommendations", icon: Bot },
    ],
  },
  {
    id: "settings",
    label: "Instellingen",
    icon: Bell,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    items: [
      { label: "Notificaties", href: "/notifications", icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const activeGroupId = GROUPS.find(g =>
    g.items.some(i => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))
  )?.id ?? "owner";

  // Default: only active group open
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sidebar-open") ?? "null");
      if (saved) {
        setOpen(saved);
      } else {
        setOpen({ [activeGroupId]: true });
      }
    } catch {
      setOpen({ [activeGroupId]: true });
    }
    setHydrated(true);
  }, []); // eslint-disable-line

  function toggle(id: string) {
    setOpen(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("sidebar-open", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="w-[220px] min-h-screen bg-[#0d0d13] border-r border-white/5 py-5 flex flex-col shrink-0 fixed left-0 top-0 bottom-0 z-40">

      {/* Logo */}
      <a href="/" className="flex items-center gap-3 px-4 mb-5">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/40">
          <span className="text-white font-black text-xs tracking-tight">TS</span>
        </div>
        <div>
          <h1 className="text-sm font-black tracking-tight">TSecom</h1>
          <p className="text-[10px] text-zinc-600">AI Commerce OS</p>
        </div>
      </a>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-1">
        {GROUPS.map(group => {
          const isOpen   = hydrated ? (open[group.id] ?? false) : group.id === activeGroupId;
          const isActive = group.id === activeGroupId;
          const Icon     = group.icon;

          return (
            <div key={group.id}>
              {/* Group header button */}
              <button
                onClick={() => toggle(group.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all text-[11px] font-semibold group
                  ${isActive
                    ? `${group.bg} ${group.border} border ${group.color}`
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/4"
                  }`}
              >
                <Icon size={13} className="shrink-0" />
                <span className="flex-1 text-left tracking-wide">{group.label}</span>
                <ChevronRight
                  size={11}
                  className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""} ${isActive ? group.color : "text-zinc-700"}`}
                />
              </button>

              {/* Collapsible items */}
              {isOpen && (
                <div className="mt-0.5 mb-1 ml-2 space-y-0.5">
                  {group.items.map(({ label, href, icon: ItemIcon }) => {
                    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                    return (
                      <a key={href} href={href}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all text-[12px] font-medium
                          ${active
                            ? "bg-white/10 text-white"
                            : "text-zinc-600 hover:bg-white/5 hover:text-zinc-200"
                          }`}
                      >
                        <ItemIcon size={12} className={`shrink-0 ${active ? "text-white" : "text-zinc-700"}`} />
                        {label}
                        {active && <div className="ml-auto w-1 h-1 rounded-full bg-blue-400" />}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* AI badge */}
      <div className="mx-2 mt-3 rounded-xl bg-gradient-to-br from-blue-600/15 to-purple-600/10 border border-blue-500/15 p-3">
        <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-[10px] mb-0.5">
          <Zap size={9} /> AI Actief
        </div>
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          Bewaakt marges, voorraad & schaal signalen.
        </p>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-500/8 transition-all text-[12px] font-medium"
      >
        <LogOut size={12} />
        Uitloggen
      </button>
    </aside>
  );
}
