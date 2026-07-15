"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { Store, useStores } from "../hooks/useStores";
import { Plus, Pencil, Check, X, ExternalLink, Link2 } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

interface EditDraft {
  name: string;
  shopify_domain: string;
  shopify_access_token: string;
  google_ads_customer_id: string;
  currency: string;
}

const EMPTY_DRAFT: EditDraft = {
  name: "", shopify_domain: "", shopify_access_token: "",
  google_ads_customer_id: "", currency: "EUR",
};

export default function StoresPage() {
  const supabase = createClient();
  const { stores, loading, invalidate } = useStores();

  const [showAdd, setShowAdd]     = useState(false);
  const [draft, setDraft]         = useState<EditDraft>(EMPTY_DRAFT);
  const [saving, setSaving]       = useState(false);
  const [message, setMessage]     = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_DRAFT);

  async function addStore() {
    if (!draft.name) { setMessage("Store name is required."); return; }
    setSaving(true); setMessage("");
    try {
      // Save to Worker D1
      const r = await fetch(`${API}/api/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await r.json();
      if (!d.ok) { setMessage("Error saving store."); return; }

      // Also save to Supabase for auth-linked data
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("stores").upsert({
          user_id: userData.user.id,
          store_name: draft.name,
          shopify_domain: draft.shopify_domain,
          shopify_access_token: draft.shopify_access_token,
        });
      }

      invalidate();
      setDraft(EMPTY_DRAFT);
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await fetch(`${API}/api/stores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      invalidate();
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteStore(id: string) {
    if (!confirm(`Store "${id}" verwijderen?`)) return;
    await fetch(`${API}/api/stores/${id}`, { method: "DELETE" });
    invalidate();
  }

  function startEdit(s: Store) {
    setEditingId(s.id);
    setEditDraft({
      name: s.name,
      shopify_domain: s.shopify_domain ?? "",
      shopify_access_token: "",
      google_ads_customer_id: s.google_ads_customer_id ?? "",
      currency: s.currency ?? "EUR",
    });
  }

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Store Manager</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your Shopify stores and ad connections</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setMessage(""); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-gray-900 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
        >
          <Plus size={15} /> Add store
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-black/3 border border-blue-500/20 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-blue-700 mb-1">New store</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
              placeholder="Store name (e.g. CEOFO)"
              value={draft.name}
              onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
            />
            <input
              className="bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
              placeholder="Shopify domain (e.g. ceofo.myshopify.com)"
              value={draft.shopify_domain}
              onChange={e => setDraft(p => ({ ...p, shopify_domain: e.target.value }))}
            />
            <input
              type="password"
              className="bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
              placeholder="Shopify Admin Access Token"
              value={draft.shopify_access_token}
              onChange={e => setDraft(p => ({ ...p, shopify_access_token: e.target.value }))}
            />
            <input
              className="bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
              placeholder="Google Ads Customer ID (bijv. 123-456-7890)"
              value={draft.google_ads_customer_id}
              onChange={e => setDraft(p => ({ ...p, google_ads_customer_id: e.target.value }))}
            />
          </div>
          {message && <p className="text-yellow-400 text-xs">{message}</p>}
          <div className="flex gap-2">
            <button
              onClick={addStore} disabled={saving || !draft.name}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-semibold rounded-xl transition-all"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setDraft(EMPTY_DRAFT); setMessage(""); }}
              className="px-4 py-2 text-gray-500 hover:text-gray-600 text-sm rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Store cards */}
      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : stores.length === 0 ? (
        <div className="bg-black/3 border border-black/5 rounded-2xl p-8 text-center text-gray-400 text-sm">
          No stores yet — click &quot;Add store&quot; to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stores.map(s => (
            <div key={s.id} className="bg-black/3 border border-black/5 rounded-2xl p-5 space-y-3">
              {editingId === s.id ? (
                /* Edit mode */
                <div className="space-y-2">
                  <input
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50"
                    value={editDraft.name}
                    placeholder="Store name"
                    onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50"
                    value={editDraft.shopify_domain}
                    placeholder="Shopify domain"
                    onChange={e => setEditDraft(p => ({ ...p, shopify_domain: e.target.value }))}
                  />
                  <input
                    type="password"
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50"
                    value={editDraft.shopify_access_token}
                    placeholder="Access token (leeg = niet wijzigen)"
                    onChange={e => setEditDraft(p => ({ ...p, shopify_access_token: e.target.value }))}
                  />
                  <input
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50"
                    value={editDraft.google_ads_customer_id}
                    placeholder="Google Ads Customer ID (bijv. 123-456-7890)"
                    onChange={e => setEditDraft(p => ({ ...p, google_ads_customer_id: e.target.value }))}
                  />
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => saveEdit(s.id)} disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-gray-900 text-xs font-semibold rounded-lg transition-all">
                      <Check size={12} /> {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-600 text-xs rounded-lg transition-all">
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">{s.name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">{s.shopify_domain || "No Shopify domain"}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(s)}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-all">
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Connections */}
                  <div className="space-y-1.5">
                    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                      s.shopify_domain ? "bg-emerald-500/10 text-emerald-400" : "bg-black/5 text-gray-400"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${s.shopify_domain ? "bg-emerald-400" : "bg-zinc-700"}`} />
                      Shopify {s.shopify_domain ? `— ${s.shopify_domain}` : "— not connected"}
                    </div>
                    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                      s.google_ads_customer_id ? "bg-blue-500/10 text-blue-400" : "bg-black/5 text-gray-400"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${s.google_ads_customer_id ? "bg-blue-400" : "bg-zinc-700"}`} />
                      Google Ads {s.google_ads_customer_id ? `— ${s.google_ads_customer_id}` : "— not connected"}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1 flex-wrap">
                    <a href={`/?store_id=${s.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-medium rounded-lg transition-all">
                      <ExternalLink size={11} /> Open dashboard
                    </a>
                    {!s.google_ads_customer_id && (
                      <button onClick={() => startEdit(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 hover:bg-black/8 text-gray-500 hover:text-gray-900 text-xs font-medium rounded-lg transition-all">
                        <Link2 size={11} /> Connect Ads
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
