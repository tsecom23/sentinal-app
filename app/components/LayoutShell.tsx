"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// Pages that get the sidebar layout
const WITH_SIDEBAR = ["/", "/product-insights", "/returns", "/stores", "/ai-chat", "/ai-recommendations", "/google-ads"];

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
      <main className="flex-1 ml-[260px] min-w-0">
        {children}
      </main>
    </div>
  );
}
