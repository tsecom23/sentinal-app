"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";

type Store = {
  id: string;
  user_id: string;
  store_name: string;
  shopify_domain: string;
  shopify_access_token: string;
  created_at: string;
};

export default function StoresPage() {
  const supabase = createClient();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeName, setStoreName] = useState("");
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [message, setMessage] = useState("");

  async function loadStores() {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return;

    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setStores(data || []);
  }

  async function addStore() {
    setMessage("");

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setMessage("Not logged in.");
      return;
    }

    const cleanDomain = shopifyDomain
      .replace("https://", "")
      .replace("http://", "")
      .replace("/", "")
      .trim();

    const { error } = await supabase.from("stores").insert({
      user_id: userData.user.id,
      store_name: storeName,
      shopify_domain: cleanDomain,
      shopify_access_token: shopifyToken,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setStoreName("");
    setShopifyDomain("");
    setShopifyToken("");
    setMessage("Store added.");

    await loadStores();
  }

  useEffect(() => {
    loadStores();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white p-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <a href="/" className="text-zinc-400 hover:text-white">
            ← Back to Dashboard
          </a>

          <h1 className="text-4xl font-black mt-4">Stores</h1>
          <p className="text-zinc-400 mt-2">
            Add and manage your Shopify stores.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#15151c] rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Add Store</h2>

            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Store name, e.g. CEOFO"
              className="w-full bg-[#0f0f14] border border-zinc-800 rounded-xl px-4 py-3 mb-3"
            />

            <input
              value={shopifyDomain}
              onChange={(e) => setShopifyDomain(e.target.value)}
              placeholder="Shopify domain, e.g. ceofo.myshopify.com"
              className="w-full bg-[#0f0f14] border border-zinc-800 rounded-xl px-4 py-3 mb-3"
            />

            <input
              value={shopifyToken}
              onChange={(e) => setShopifyToken(e.target.value)}
              placeholder="Shopify Admin Access Token"
              type="password"
              className="w-full bg-[#0f0f14] border border-zinc-800 rounded-xl px-4 py-3 mb-4"
            />

            <button
              onClick={addStore}
              className="w-full bg-indigo-600 rounded-xl py-3 font-bold"
            >
              Add Store
            </button>

            {message && (
              <p className="mt-4 text-sm text-yellow-400">{message}</p>
            )}
          </div>

          <div className="bg-[#15151c] rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Connected Stores</h2>

            {stores.length === 0 ? (
              <p className="text-zinc-500">No stores connected yet.</p>
            ) : (
              <div className="space-y-4">
                {stores.map((store) => (
                  <div
                    key={store.id}
                    className="border border-zinc-800 rounded-xl p-4"
                  >
                    <p className="font-bold">{store.store_name}</p>
                    <p className="text-zinc-400 text-sm">
                      {store.shopify_domain}
                    </p>
                    <p className="text-zinc-600 text-xs mt-2">
                      Added: {new Date(store.created_at).toLocaleString("nl-NL")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}