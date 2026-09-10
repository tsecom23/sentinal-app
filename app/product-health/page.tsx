"use client";

import { useEffect, useState, useMemo } from "react";
import { Heart, RefreshCw, ChevronLeft, AlertTriangle, CheckCircle, XCircle, Filter, ArrowUpDown } from "lucide-react";

const API = "https://sentinel-api.tssheets1.workers.dev";

const STORES = [
  { key: "ceofo",     name: "Melvoire" },
  { key: "martaline", name: "Martaline" },
  { key: "dorevy",    name: "Dorevy" },
];

const SIGNAL_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  photo_quality:  { label: "Photo <1500px",   color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.22)" },
  variant_images: { label: "Var. imgs manquantes", color: "#fb923c", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.22)" },
  seo_title:      { label: "SEO title",        color: "#facc15", bg: "rgba(250,204,21,0.10)",  border: "rgba(250,204,21,0.22)" },
  seo_description:{ label: "SEO desc",         color: "#facc15", bg: "rgba(250,204,21,0.10)",  border: "rgba(250,204,21,0.22)" },
  product_type:   { label: "Product type",     color: "#a78bfa", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.22)" },
  off_season:     { label: "Hors-saison",      color: "#f472b6", bg: "rgba(244,114,182,0.10)", border: "rgba(244,114,182,0.22)" },
  no_sales:       { label: "0 ventes 30j",     color: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)" },
  declining:      { label: "Momentum -",       color: "#ef4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.22)" },
};

type Product = {
  id: number; store_id: string; product_id: string; product_title: string; handle: string;
  image_width: number; image_height: number; has_variant_images: number;
  variant_count: number; variants_with_images: number;
  seo_title: string; seo_description: string; product_type: string; tags: string;
  orders_30d: number; revenue_30d: number; orders_7d: number; revenue_7d: number;
  health_score: number; last_synced: string;
  failed_signals: string[];
};

type SortMode = "score_asc" | "score_desc" | "revenue" | "orders";

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 70 ? "#34d399" : score >= 45 ? "#8b5cf6" : "#f87171";

  return (
    <div className="relative inline-flex items-center justify-center w-14 h-14 shrink-0">
      <svg width="56" height="56" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <span className="text-[13px] font-black font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

function SignalPill({ signal }: { signal: string }) {
  const meta = SIGNAL_META[signal];
  if (!meta) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border"
      style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
    >
      {meta.label}
    </span>
  );
}

function DetailPanel({ p, onClose }: { p: Product; onClose: () => void }) {
  const domain = STORES.find(s => s.key === p.store_id)?.name ?? p.store_id;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-6 relative animate-float-in"
        style={{
          background: "linear-gradient(135deg, #1e1e2e 0%, #1a1a28 100%)",
          border: "1px solid rgba(139,92,246,0.20)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.10)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">✕</button>

        <div className="flex items-start gap-4 mb-5">
          <ScoreRing score={p.health_score} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-white leading-tight mb-1 truncate">{p.product_title}</div>
            <div className="text-[11px] font-mono" style={{ color: "#6b7280" }}>
              {domain} · #{p.product_id}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: "Commandes 30j",  value: p.orders_30d },
            { label: "Revenue 30j",    value: `€${p.revenue_30d.toFixed(2)}` },
            { label: "Commandes 7j",   value: p.orders_7d },
            { label: "Photo max px",   value: Math.max(p.image_width, p.image_height) || "?" },
            { label: "Variants",       value: p.variant_count },
            { label: "Imgs variants",  value: `${p.variants_with_images}/${p.variant_count}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl px-3 py-2"
              style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.10)" }}>
              <div className="text-[9px] font-mono tracking-wider mb-1" style={{ color: "#6b7280" }}>{label}</div>
              <div className="text-[14px] font-black font-mono text-white">{value}</div>
            </div>
          ))}
        </div>

        {p.failed_signals.length > 0 && (
          <div className="mb-4">
            <div className="text-[9px] font-mono tracking-wider mb-2" style={{ color: "#6b7280" }}>PROBLÈMES DÉTECTÉS</div>
            <div className="flex flex-wrap gap-1.5">
              {p.failed_signals.map(s => <SignalPill key={s} signal={s} />)}
            </div>
          </div>
        )}

        {p.seo_title && (
          <div className="mb-2">
            <div className="text-[9px] font-mono tracking-wider mb-1" style={{ color: "#6b7280" }}>SEO TITLE</div>
            <div className="text-[12px] text-slate-300">{p.seo_title || <span style={{ color: "#6b7280" }}>—</span>}</div>
          </div>
        )}
        {p.product_type && (
          <div className="mb-2">
            <div className="text-[9px] font-mono tracking-wider mb-1" style={{ color: "#6b7280" }}>PRODUCT TYPE</div>
            <div className="text-[12px] text-slate-300">{p.product_type}</div>
          </div>
        )}

        <div className="mt-4 text-[9px] font-mono" style={{ color: "#4b5563" }}>
          Dernier sync: {p.last_synced ? new Date(p.last_synced).toLocaleString("fr-FR") : "—"}
        </div>
      </div>
    </div>
  );
}

export default function ProductHealthPage() {
  const [storeId, setStoreId]     = useState("ceofo");
  const [sort, setSort]           = useState<SortMode>("score_asc");
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [selected, setSelected]   = useState<Product | null>(null);
  const [filter, setFilter]       = useState<string>("all");
  const [lastSync, setLastSync]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`${API}/api/product-health?store_id=${storeId}&sort=${sort}&limit=500`, { cache: "no-store" });
    const data = await res.json() as { products: Product[] };
    const ps = data.products || [];
    setProducts(ps);
    if (ps.length > 0 && ps[0].last_synced) setLastSync(ps[0].last_synced);
    setLoading(false);
  }

  async function triggerSync() {
    setSyncing(true);
    await fetch(`${API}/api/product-health/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: storeId }),
    });
    await load();
    setSyncing(false);
  }

  useEffect(() => { load(); }, [storeId, sort]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (filter === "all") return products;
    return products.filter(p => p.failed_signals.includes(filter));
  }, [products, filter]);

  const buckets = {
    critical: products.filter(p => p.health_score < 40).length,
    warning:  products.filter(p => p.health_score >= 40 && p.health_score < 70).length,
    healthy:  products.filter(p => p.health_score >= 70).length,
  };

  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      for (const s of p.failed_signals) {
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [products]);

  return (
    <div className="min-h-screen p-6" style={{ background: "transparent" }}>
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-6">
          <a href="/"
            className="h-9 w-9 rounded-xl flex items-center justify-center transition"
            style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}
          >
            <ChevronLeft size={16} style={{ color: "#8b5cf6" }} />
          </a>
          <div className="flex items-center gap-2">
            <Heart size={16} style={{ color: "#8b5cf6" }} />
            <h1 className="text-[20px] font-black font-mono text-white tracking-tight">Product Health</h1>
          </div>
          <span className="text-[9px] font-mono px-2 py-1 rounded-full"
            style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.20)", color: "#a78bfa" }}>
            BETA
          </span>
          {lastSync && (
            <span className="text-[10px] font-mono ml-auto" style={{ color: "#4b5563" }}>
              Sync: {new Date(lastSync).toLocaleString("fr-FR")}
            </span>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Store selector */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.15)" }}>
            {STORES.map(s => (
              <button key={s.key} onClick={() => setStoreId(s.key)}
                className="px-4 py-2 text-[12px] font-mono font-bold transition"
                style={storeId === s.key
                  ? { background: "#8b5cf6", color: "#fff" }
                  : { background: "rgba(139,92,246,0.05)", color: "#6b7280" }
                }
              >{s.name}</button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 rounded-xl px-3 py-2"
            style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.12)" }}>
            <ArrowUpDown size={11} style={{ color: "#8b5cf6" }} />
            <select value={sort} onChange={e => setSort(e.target.value as SortMode)}
              className="bg-transparent text-[11px] font-mono outline-none cursor-pointer"
              style={{ color: "#c4b5fd" }}>
              <option value="score_asc">Score ↑ (priorité)</option>
              <option value="score_desc">Score ↓ (meilleurs)</option>
              <option value="revenue">Revenue 30j</option>
              <option value="orders">Commandes 30j</option>
            </select>
          </div>

          {/* Sync button */}
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-mono font-bold transition ml-auto"
            style={syncing
              ? { background: "rgba(139,92,246,0.10)", color: "#6b7280", border: "1px solid rgba(139,92,246,0.12)" }
              : { background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" }
            }
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sync…" : "Sync Now"}
          </button>
        </div>

        {/* ── Score summary ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Critique", count: buckets.critical, color: "#f87171", bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.15)", icon: XCircle },
            { label: "Attention", count: buckets.warning,  color: "#8b5cf6", bg: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.15)", icon: AlertTriangle },
            { label: "Sain",     count: buckets.healthy,  color: "#34d399", bg: "rgba(52,211,153,0.06)",  border: "rgba(52,211,153,0.15)", icon: CheckCircle },
          ].map(({ label, count, color, bg, border, icon: Icon }) => (
            <div key={label} className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <Icon size={20} style={{ color, filter: `drop-shadow(0 0 6px ${color}60)` }} />
              <div>
                <div className="text-[22px] font-black font-mono" style={{ color }}>{count}</div>
                <div className="text-[10px] font-mono" style={{ color: "#6b7280" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Signal filter pills ── */}
        {signalCounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button onClick={() => setFilter("all")}
              className="tag-pill"
              style={filter === "all"
                ? { background: "rgba(139,92,246,0.20)", borderColor: "rgba(139,92,246,0.40)", color: "#c4b5fd" }
                : { background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.15)", color: "#6b7280" }
              }
            >
              Tous ({products.length})
            </button>
            {signalCounts.map(([signal, count]) => {
              const meta = SIGNAL_META[signal];
              if (!meta) return null;
              return (
                <button key={signal} onClick={() => setFilter(signal === filter ? "all" : signal)}
                  className="tag-pill transition"
                  style={filter === signal
                    ? { background: meta.bg, borderColor: meta.border, color: meta.color, opacity: 1 }
                    : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", color: "#6b7280" }
                  }
                >
                  <Filter size={8} />
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* ── Product list ── */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[12px] font-mono" style={{ color: "#4b5563" }}>Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-[12px] font-mono mb-2" style={{ color: "#4b5563" }}>
              {products.length === 0 ? "Aucune donnée — cliquez Sync Now" : "Aucun produit dans ce filtre"}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p, i) => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all group"
                style={{
                  background: "linear-gradient(135deg, #1e1e2e 0%, #1a1a28 100%)",
                  border: "1px solid rgba(139,92,246,0.10)",
                  animation: `fade-in-up 0.2s ease ${i * 0.02}s both`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.10)"; }}
              >
                <div className="text-[10px] font-mono w-6 text-right shrink-0" style={{ color: "#4b5563" }}>
                  {i + 1}
                </div>

                <ScoreRing score={p.health_score} />

                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate mb-1">{p.product_title}</div>
                  <div className="flex flex-wrap gap-1">
                    {p.failed_signals.slice(0, 4).map(s => <SignalPill key={s} signal={s} />)}
                    {p.failed_signals.length > 4 && (
                      <span className="text-[10px] font-mono" style={{ color: "#6b7280" }}>+{p.failed_signals.length - 4}</span>
                    )}
                    {p.failed_signals.length === 0 && (
                      <span className="text-[10px] font-mono text-emerald-400">Tout bon ✓</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[13px] font-black font-mono text-white">€{p.revenue_30d.toFixed(0)}</div>
                  <div className="text-[9px] font-mono" style={{ color: "#6b7280" }}>{p.orders_30d} cmd 30j</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && <DetailPanel p={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
