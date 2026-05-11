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

let _cache: Store[] | null = null;
let _promise: Promise<Store[]> | null = null;

async function fetchStores(): Promise<Store[]> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = fetch(`${API}/api/stores`, { cache: "no-store" })
      .then(r => r.json())
      .then((d: { stores: Store[] }) => {
        _cache = d.stores ?? [];
        return _cache;
      })
      .catch(() => {
        _promise = null;
        return [] as Store[];
      });
  }
  return _promise;
}

export function useStores() {
  const [stores, setStores] = useState<Store[]>(_cache ?? []);
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
