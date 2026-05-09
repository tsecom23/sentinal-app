"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";

type Store = {
  id: string;
  user_id?: string;
  store_name: string;
  shopify_domain: string;
  shopify_access_token: string;
  created_at: string;
};

export default function StoresPage() {
  const supabase = createClient();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStore, setShowAddStore] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchStores();
  }, []);

  async function fetchStores() {
    setLoading(true);

    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setStores(data);
    }

    setLoading(false);
  }

  async function addStore() {
    setSaving(true);
    setMessage("");

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setMessage("Je bent niet ingelogd.");
      setSaving(false);
      return;
    }

    const cleanDomain = shopifyDomain
      .replace("https://", "")
      .replace("http://", "")
      .replace("/", "")
      .trim();

    if (!storeName || !cleanDomain || !shopifyToken) {
      setMessage("Vul alle velden in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("stores").insert({
      user_id: userData.user.id,
      store_name: storeName.trim(),
      shopify_domain: cleanDomain,
      shopify_access_token: shopifyToken.trim(),
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setStoreName("");
    setShopifyDomain("");
    setShopifyToken("");
    setShowAddStore(false);
    setSaving(false);

    await fetchStores();
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <a href="/" className="text-zinc-400 hover:text-white text-sm">
            ← Back to Dashboard
          </a>

          <h1 className="text-4xl font-bold mt-4">Store Manager</h1>

          <p className="text-zinc-400 mt-2">
            Voeg Shopify stores toe en beheer je multi-store setup.
          </p>
        </div>

        <button
          onClick={() => setShowAddStore(true)}
          className="bg-indigo-600 px-5 py-3 rounded-xl font-semibold"
        >
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
              <h2 className="text-2xl font-bold mb-2">{store.store_name}</h2>

              <p className="text-zinc-400 mb-4">{store.shopify_domain}</p>

              <p className="text-xs text-zinc-600 mb-5">
                Added: {new Date(store.created_at).toLocaleString("nl-NL")}
              </p>

              <div className="flex gap-3">
                <a
                  href={`/?store_id=${store.id}`}
                  className="bg-indigo-600 px-4 py-2 rounded-lg"
                >
                  Open Dashboard
                </a>

                <button className="bg-zinc-800 px-4 py-2 rounded-lg">
                  Settings
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddStore && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Add Shopify Store</h2>

              <button
                onClick={() => setShowAddStore(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Store name, e.g. CEOFO"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 mb-3"
            />

            <input
              value={shopifyDomain}
              onChange={(e) => setShopifyDomain(e.target.value)}
              placeholder="Shopify domain, e.g. ceofo.myshopify.com"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 mb-3"
            />

            <input
              value={shopifyToken}
              onChange={(e) => setShopifyToken(e.target.value)}
              placeholder="Shopify Admin Access Token"
              type="password"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 mb-4"
            />

            {message && (
              <p className="text-sm text-yellow-400 mb-4">{message}</p>
            )}

            <button
              onClick={addStore}
              disabled={saving}
              className="w-full bg-indigo-600 rounded-xl py-3 font-bold"
            >
              {saving ? "Saving..." : "Save Store"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}