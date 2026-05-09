export type DashboardData = {
  revenue: number;
  netRevenue: number;
  orders: number;
  sessions: number;
  cvr: number;
  aov: number;
  adSpend: number;
  roas: number;
  revenueTrend: {
    day: string;
    revenue: number;
    adSpend: number;
  }[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

export async function getDashboardData(): Promise<DashboardData> {
  const res = await fetch(`${API_URL}/api/dashboard/overview`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Dashboard data kon niet geladen worden");
  }

  return res.json();
}