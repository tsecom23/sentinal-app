"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function StoresPage() {
  const supabase = createClient();

  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStores();
  }, []);

  async function fetchStores() {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setStores(data);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">
          Store Manager
        </h1>

        <button className="bg-indigo-600 px-5 py-3 rounded-xl font-semibold">
          + Add Store
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-400">Loading stores...</p>
      ) : stores.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-6">
          <p>No stores connected yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stores.map((store) => (
            <div
              key={store.id}
              className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
            >
              <h2 className="text-2xl font-bold mb-2">
                {store.store_name}
              </h2>

              <p className="text-zinc-400 mb-4">
                {store.shopify_domain}
              </p>

              <div className="flex gap-3">
                <button className="bg-indigo-600 px-4 py-2 rounded-lg">
                  Open Dashboard
                </button>

                <button className="bg-zinc-800 px-4 py-2 rounded-lg">
                  Settings
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}