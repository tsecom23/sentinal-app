"use client";

import { useEffect, useState } from "react";

const API = "https://sentinel-api.tssheets1.workers.dev";

export interface Store {
  id: string;
  name: string;
  shopify_domain: string;
  google_ads_customer_id: string;
  currency: string;
}

// Always-available fallback — used when the API is unreachable or broken
const FALLBACK_STORES: Store[] = [
  { id: "ceofo",     name: "CEOFO",     shopify_domain: "", google_ads_customer_id: "", currency: "EUR" },
  { id: "martaline", name: "Martaline", shopify_domain: "", google_ads_customer_id: "", currency: "EUR" },
];

let _cache: Store[] | null = null;
let _promise: Promise<Store[]> | null = null;

async function fetchStores(): Promise<Store[]> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = fetch(`${API}/api/stores`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: { stores?: Store[] }) => {
        const stores = d.stores ?? [];
        // If API returns valid stores, use them; otherwise fall back
        _cache = stores.length > 0 ? stores : FALLBACK_STORES;
        return _cache;
      })
      .catch(() => {
        _promise = null; // allow retry next time
        return FALLBACK_STORES;
      });
  }
  return _promise;
}

export function useStores() {
  // Start with fallback so buttons render immediately, before fetch completes
  const [stores, setStores] = useState<Store[]>(_cache ?? FALLBACK_STORES);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) { setStores(_cache); setLoading(false); return; }
    fetchStores().then(s => { setStores(s); setLoading(false); });
  }, []);

  function invalidate() {
    _cache = null;
    _promise = null;
    setLoading(true);
    fetchStores().then(s => { setStores(s); setLoading(false); });
  }

  return { stores, loading, invalidate };
}
