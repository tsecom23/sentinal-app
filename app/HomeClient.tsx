"use client";

import { useSearchParams } from "next/navigation";
import Dashboard from "./components/Dashboard";

export default function HomeClient() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store_id");

  return <Dashboard activeStoreId={storeId || undefined} />;
}