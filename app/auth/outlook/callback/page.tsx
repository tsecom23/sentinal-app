"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://sentinel-api.tssheets1.workers.dev";

function OutlookCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "ok" | "error">("processing");
  const [message, setMessage] = useState("Connecting your Outlook account…");

  useEffect(() => {
    const code  = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Outlook authorisation was denied. You can close this tab and try again.");
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("No authorisation code received from Microsoft.");
      return;
    }

    let storeId = "ceofo";
    try { storeId = JSON.parse(atob(state ?? "{}")).store_id ?? "ceofo"; } catch { /* default */ }

    fetch(`${API}/api/inbox/oauth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "outlook", code, store_id: storeId }),
    })
      .then(r => r.json())
      .then((d: { ok: boolean; email?: string; error?: string }) => {
        if (d.ok) {
          setStatus("ok");
          setMessage(`Outlook connected (${d.email}). Redirecting…`);
          setTimeout(() => { window.location.href = "/inbox"; }, 1200);
        } else {
          setStatus("error");
          setMessage(d.error ?? "Failed to connect Outlook.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="text-center space-y-4">
      {status === "processing" && (
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
      )}
      {status === "ok" && <span className="text-4xl">✅</span>}
      {status === "error" && <span className="text-4xl">❌</span>}
      <p className="text-zinc-300 text-sm max-w-xs">{message}</p>
      {status === "error" && (
        <a href="/inbox" className="text-blue-400 text-sm underline">← Back to inbox</a>
      )}
    </div>
  );
}

export default function OutlookCallbackPage() {
  return (
    <div className="min-h-screen bg-[#08080f] text-white flex items-center justify-center">
      <Suspense fallback={
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 text-sm">Connecting…</p>
        </div>
      }>
        <OutlookCallbackInner />
      </Suspense>
    </div>
  );
}
