"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { createClient } from "../../utils/supabase/client";
import { canAccess, defaultPath } from "../lib/roles";

const WITH_SIDEBAR = [
  "/", "/orders", "/product-insights", "/returns", "/dead-stock", "/stores",
  "/ai-chat", "/ai-recommendations", "/google-ads", "/product-ads",
  "/scale-command", "/milestones", "/pnl", "/customers", "/notifications",
  "/roas-tracker", "/inbox", "/customer-service",
];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      if (email && !canAccess(email, pathname)) {
        router.replace(defaultPath(email));
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
    <div className="flex min-h-screen bg-[#07090F]">
      <Sidebar />
      <main className="flex-1 ml-[220px] min-w-0 relative">
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent pointer-events-none" />
        {children}
      </main>
    </div>
  );
}
