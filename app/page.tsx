"use client";

import { useSearchParams } from "next/navigation";
import Dashboard from "./components/Dashboard";

export default function Home() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store_id");

  return (
    <div>
      <Dashboard activeStoreId={storeId || undefined} />
    </div>
  );
}