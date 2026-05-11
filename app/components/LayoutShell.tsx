"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// Pages that get the sidebar layout
const WITH_SIDEBAR = ["/", "/orders", "/product-insights", "/returns", "/dead-stock", "/stores", "/ai-chat", "/ai-recommendations", "/google-ads", "/product-ads", "/scale-command", "/milestones", "/customer-service", "/inbox", "/pnl", "/customers", "/notifications"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const hasSidebar = WITH_SIDEBAR.some(p =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  );

  if (!hasSidebar) {
    // Login page etc — no sidebar
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Offset main content by sidebar width */}
      <main className="flex-1 ml-[220px] min-w-0">
        {children}
      </main>
    </div>
  );
}
