"use client";

import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Bot, Box, MessageCircle,
  RotateCcw, Skull, Sparkles, Store, Target, Zap,
} from "lucide-react";

const NAV = [
  { label: "Overview",           href: "/",                    icon: Activity },
  { label: "Stores",             href: "/stores",              icon: Store },
  { label: "Product Insights",   href: "/product-insights",    icon: Box },
  { label: "Returns & Disputes", href: "/returns",             icon: RotateCcw },
  { label: "Dead Stock",         href: "/dead-stock",          icon: Skull },
  { label: "AI Recommendations", href: "/ai-recommendations",  icon: Bot },
  { label: "AI Chat",            href: "/ai-chat",             icon: MessageCircle },
  { label: "Google Ads",         href: "/google-ads",          icon: BarChart3 },
  { label: "Scale Command",      href: null,                   icon: Target },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[260px] min-h-screen bg-[#0d0d13] border-r border-white/5 p-5 flex flex-col shrink-0 fixed left-0 top-0 bottom-0 z-40">
      {/* Logo */}
      <a href="/" className="flex items-center gap-3 mb-10">
        <div className="h-10 w-10 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight">Sentinel</h1>
          <p className="text-[11px] text-zinc-500">AI Commerce OS</p>
        </div>
      </a>

      {/* Nav */}
      <nav className="space-y-0.5 flex-1">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = href
            ? href === "/" ? pathname === "/" : pathname.startsWith(href)
            : false;

          const inner = (
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-[13px] font-medium ${
              active
                ? "bg-blue-600 text-white"
                : "text-zinc-500 hover:bg-white/5 hover:text-white"
            }`}>
              <Icon size={15} className="shrink-0" />
              {label}
            </div>
          );

          return href
            ? <a key={label} href={href}>{inner}</a>
            : <div key={label} className="opacity-40 cursor-not-allowed">{inner}</div>;
        })}
      </nav>

      {/* AI Status */}
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/10 border border-blue-500/20 p-4">
        <div className="flex items-center gap-2 text-blue-300 font-semibold text-xs mb-1.5">
          <Zap size={13} /> AI Status
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Monitoring margins, stock risk and scaling signals.
        </p>
      </div>
    </aside>
  );
}
