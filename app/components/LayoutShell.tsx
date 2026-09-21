"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { createClient } from "../../utils/supabase/client";
import { canAccess, defaultPath } from "../lib/roles";

const WITH_SIDEBAR = [
  "/", "/orders", "/product-insights", "/returns", "/dead-stock", "/stores",
  "/ai-chat", "/ai-recommendations", "/google-ads", "/product-ads",
  "/scale-command", "/milestones", "/pnl", "/customers", "/notifications",
  "/roas-tracker", "/inbox", "/customer-service", "/product-health",
];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [ready, setReady]           = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      if (email && !canAccess(email, pathname)) {
        const dest = defaultPath(email);
        if (dest === pathname) {
          // blocked (no allowed paths) — sign out
          supabase.auth.signOut().then(() => router.replace("/login"));
        } else {
          router.replace(dest);
        }
      } else {
        setReady(true);
      }
    });
  }, [pathname]); // eslint-disable-line

  const hasSidebar = WITH_SIDEBAR.some(p =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  );

  if (!hasSidebar) {
    return <>{children}</>;
  }

  if (!ready) return null;

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 md:ml-[220px] min-w-0 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent pointer-events-none" />
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-20" style={{ background: "var(--bg)", borderBottom: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--muted)", background: "var(--sidebar-bg)" }}
          >
            <Menu size={18} />
          </button>
          <span className="text-[13px] font-mono font-bold" style={{ color: "var(--text)" }}>Sentinel</span>
        </div>
        {children}
      </main>
    </div>
  );
}
