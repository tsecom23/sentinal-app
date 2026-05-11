"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Activity, BarChart3, Bell, Bot, Box, ChevronDown,
  Headphones, Inbox, LogOut, MessageCircle, Package,
  RotateCcw, ShoppingCart, Skull, Store, Target,
  TrendingUp, Trophy, Users, Zap,
} from "lucide-react";
import { createClient } from "../../utils/supabase/client";

const GROUPS = [
  {
    id: "cs",
    label: "Customer Service",
    icon: Headphones,
    color: "text-blue-400",
    dot: "bg-blue-500",
    items: [
      { label: "Inbox",    href: "/inbox",            icon: Inbox },
      { label: "Tickets",  href: "/customer-service", icon: Headphones },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    icon: Activity,
    color: "text-emerald-400",
    dot: "bg-emerald-500",
    items: [
      { label: "Overview",   href: "/",          icon: Activity },
      { label: "Orders",     href: "/orders",    icon: ShoppingCart },
      { label: "P&L",        href: "/pnl",       icon: TrendingUp },
      { label: "Customers",  href: "/customers", icon: Users },
      { label: "Milestones", href: "/milestones",icon: Trophy },
      { label: "Stores",     href: "/stores",    icon: Store },
    ],
  },
  {
    id: "buyer",
    label: "Media Buyer",
    icon: Target,
    color: "text-purple-400",
    dot: "bg-purple-500",
    items: [
      { label: "Google Ads",       href: "/google-ads",       icon: BarChart3 },
      { label: "Product Ads",      href: "/product-ads",      icon: Package },
      { label: "Product Insights", href: "/product-insights", icon: Box },
      { label: "Scale Command",    href: "/scale-command",    icon: Target },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    icon: RotateCcw,
    color: "text-amber-400",
    dot: "bg-amber-500",
    items: [
      { label: "Returns & Disputes", href: "/returns",    icon: RotateCcw },
      { label: "Dead Stock",         href: "/dead-stock", icon: Skull },
    ],
  },
  {
    id: "ai",
    label: "AI",
    icon: Bot,
    color: "text-pink-400",
    dot: "bg-pink-500",
    items: [
      { label: "AI Chat",            href: "/ai-chat",            icon: MessageCircle },
      { label: "AI Recommendations", href: "/ai-recommendations", icon: Bot },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Bell,
    color: "text-zinc-400",
    dot: "bg-zinc-500",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const activeGroup = GROUPS.find(g =>
    g.items.some(i => i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))
  )?.id ?? "owner";

  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sidebar-open") ?? "{}");
      setOpen({ ...Object.fromEntries(GROUPS.map(g => [g.id, true])), ...saved });
    } catch {
      setOpen(Object.fromEntries(GROUPS.map(g => [g.id, true])));
    }
  }, []);

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
      <a href="/" className="flex items-center gap-3 px-4 mb-6">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/40">
          <span className="text-white font-black text-sm tracking-tight leading-none">TS</span>
        </div>
        <div>
          <h1 className="text-sm font-black tracking-tight">TSecom</h1>
          <p className="text-[10px] text-zinc-600">AI Commerce OS</p>
        </div>
      </a>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {GROUPS.map(group => {
          const isOpen    = open[group.id] !== false;
          const isActive  = group.id === activeGroup;
          const Icon      = group.icon;

          return (
            <div key={group.id}>
              {/* Group header */}
              <button
                onClick={() => toggle(group.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-[11px] font-bold tracking-wide uppercase ${
                  isActive ? group.color : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                <Icon size={11} className="shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  size={11}
                  className={`shrink-0 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                />
              </button>

              {/* Items */}
              {isOpen && (
                <div className="ml-3 pl-2 border-l border-white/5 space-y-0.5 mb-1">
                  {group.items.map(({ label, href, icon: ItemIcon }) => {
                    const active = href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(href);
                    return (
                      <a key={href} href={href}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-[12px] font-medium ${
                          active
                            ? "bg-blue-600 text-white"
                            : "text-zinc-500 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <ItemIcon size={13} className="shrink-0" />
                        {label}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* AI Status */}
      <div className="mx-2 mt-3 rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/10 border border-blue-500/20 p-3">
        <div className="flex items-center gap-1.5 text-blue-300 font-semibold text-[10px] mb-1">
          <Zap size={10} /> AI Active
        </div>
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Monitoring margins, stock & scaling signals.
        </p>
      </div>

      {/* Logout */}
      <button
        onClick={signOut}
        className="mx-2 mt-2 flex items-center gap-2 px-2 py-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all text-[12px] font-medium"
      >
        <LogOut size={13} />
        Sign out
      </button>
    </aside>
  );
}
