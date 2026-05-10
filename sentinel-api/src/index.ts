interface Env {
  DB: D1Database;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAmsterdamDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function getDateFilter(url: URL): { start: string; end: string } {
  const range = url.searchParams.get("range") || "30d";
  if (range === "today") { const d = getAmsterdamDate(0); return { start: d, end: d }; }
  if (range === "yesterday") { const d = getAmsterdamDate(-1); return { start: d, end: d }; }
  return { start: getAmsterdamDate(-29), end: getAmsterdamDate(0) };
}

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200): Response {
  return withCors(new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  }));
}

// ─── Migrations ───────────────────────────────────────────────────────────────

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS product_costs (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    product_title TEXT NOT NULL, cost REAL DEFAULT 0, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY, order_id TEXT, store_id TEXT,
    product_title TEXT, variant_title TEXT, reason TEXT,
    amount REAL DEFAULT 0, status TEXT DEFAULT 'pending',
    created_at TEXT, resolved_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY, order_id TEXT, store_id TEXT,
    customer_email TEXT, amount REAL DEFAULT 0, reason TEXT,
    status TEXT DEFAULT 'open', created_at TEXT, resolved_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS quality_checks (
    id TEXT PRIMARY KEY, order_id TEXT, store_id TEXT,
    product_title TEXT, supplier TEXT,
    status TEXT DEFAULT 'pending', notes TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS supplier_negotiations (
    id TEXT PRIMARY KEY, store_id TEXT, supplier_name TEXT,
    product_title TEXT, current_price REAL DEFAULT 0,
    target_price REAL DEFAULT 0, status TEXT DEFAULT 'pending',
    notes TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS order_milestones (
    id TEXT PRIMARY KEY, store_id TEXT,
    milestone INTEGER, reached_at TEXT, notified INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS google_ads_daily (
    id TEXT PRIMARY KEY, store_id TEXT, date TEXT NOT NULL,
    spend REAL DEFAULT 0, clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0, conversions REAL DEFAULT 0,
    cpc REAL DEFAULT 0, ctr REAL DEFAULT 0, roas REAL DEFAULT 0)`,
];

async function runMigrations(db: D1Database) {
  for (const sql of MIGRATIONS) {
    try { await db.prepare(sql).run(); } catch { /* table already exists */ }
  }
}

let migrated = false;

// ─── Main Handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!migrated) {
      try { await runMigrations(env.DB); } catch { /* ignore */ }
      migrated = true;
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    // ── GET /api/dashboard/overview ──────────────────────────────────────────
    if (path === "/api/dashboard/overview" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const [overview, costRow, adsRow, returnsRow, disputesRow, trend] = await Promise.all([
        env.DB.prepare(`
          SELECT COALESCE(SUM(revenue),0) as revenue,
                 COALESCE(SUM(net_revenue),0) as netRevenue,
                 COUNT(*) as orders
          FROM orders
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
        `).bind(storeId, start, end).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(pc.cost, oi.cost, 0)
          ), 0) as productCost
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          LEFT JOIN product_costs pc
            ON pc.product_title = oi.product_title AND pc.store_id = o.store_id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
        `).bind(storeId, start, end).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(spend),0) as adSpend,
                 COALESCE(SUM(clicks),0) as clicks,
                 COALESCE(SUM(impressions),0) as impressions,
                 COALESCE(SUM(conversions),0) as conversions,
                 CASE WHEN SUM(clicks)>0 THEN SUM(spend)/SUM(clicks) ELSE 0 END as cpc,
                 CASE WHEN SUM(impressions)>0 THEN CAST(SUM(clicks) AS REAL)/SUM(impressions)*100 ELSE 0 END as ctr
          FROM google_ads_daily
          WHERE store_id=? AND date>=? AND date<=?
        `).bind(storeId, start, end).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(amount),0) as returnAmount, COUNT(*) as returnCount
          FROM returns
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
        `).bind(storeId, start, end).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(amount),0) as disputeAmount, COUNT(*) as disputeCount
          FROM disputes
          WHERE store_id=? AND status='open' AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
        `).bind(storeId, start, end).first(),

        env.DB.prepare(`
          SELECT substr(created_at,1,10) as day, COALESCE(SUM(revenue),0) as revenue
          FROM orders
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY day ORDER BY day ASC
        `).bind(storeId, start, end).all(),
      ]);

      const revenue = (overview?.revenue as number) ?? 0;
      const orders = (overview?.orders as number) ?? 0;
      const adSpend = (adsRow?.adSpend as number) ?? 0;
      const productCost = (costRow?.productCost as number) ?? 0;
      const returnAmount = (returnsRow?.returnAmount as number) ?? 0;
      const returnCount = (returnsRow?.returnCount as number) ?? 0;
      const disputeAmount = (disputesRow?.disputeAmount as number) ?? 0;
      const disputeCount = (disputesRow?.disputeCount as number) ?? 0;
      const netRevenue = revenue - returnAmount;
      const profit = netRevenue - adSpend - productCost;
      const aov = orders > 0 ? revenue / orders : 0;
      const roas = adSpend > 0 ? revenue / adSpend : 0;
      const returnRate = orders > 0 ? (returnCount / orders) * 100 : 0;
      const cpc = (adsRow?.cpc as number) ?? 0;
      const ctr = (adsRow?.ctr as number) ?? 0;
      const clicks = (adsRow?.clicks as number) ?? 0;
      const impressions = (adsRow?.impressions as number) ?? 0;

      return json({
        revenue, netRevenue, orders, adSpend, productCost,
        returnAmount, returnCount, disputeAmount, disputeCount,
        profit, aov, roas, returnRate, cpc, ctr, clicks, impressions,
        sessions: 0, cvr: 0,
        revenueTrend: trend.results ?? [],
      });
    }

    // ── GET /api/products/top ─────────────────────────────────────────────────
    if (path === "/api/products/top" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const products = await env.DB.prepare(`
        SELECT oi.product_title, oi.variant_title,
               SUM(oi.quantity) as sold,
               SUM(oi.revenue) as revenue,
               SUM((oi.revenue - COALESCE(oi.cost,0)) * oi.quantity) as profit,
               COALESCE(AVG(oi.cost),0) as unit_cost
        FROM order_items oi JOIN orders o ON oi.order_id=o.id
        WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
        GROUP BY oi.product_title, oi.variant_title
        ORDER BY revenue DESC LIMIT 20
      `).bind(storeId, start, end).all();

      return json({ products: products.results ?? [] });
    }

    // ── GET /api/product-alerts ───────────────────────────────────────────────
    if (path === "/api/product-alerts" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const alerts = await env.DB.prepare(
        `SELECT * FROM product_alerts WHERE store_id=? ORDER BY created_at DESC LIMIT 50`
      ).bind(storeId).all();
      return json({ alerts: alerts.results ?? [] });
    }

    // ── GET /api/alerts/scan-products ─────────────────────────────────────────
    if (path === "/api/alerts/scan-products" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      // Clear old auto-generated product alerts before re-scanning
      await env.DB.prepare(
        `DELETE FROM product_alerts WHERE store_id=? AND alert_type='WATCH_PRODUCT'`
      ).bind(storeId).run();

      // Only alert products with HIGH return rates (>15% of sales)
      const highReturnProducts = await env.DB.prepare(`
        SELECT oi.product_title, SUM(oi.quantity) as sold,
               COUNT(DISTINCT r.id) as return_count
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN returns r ON r.order_id = o.id AND r.product_title = oi.product_title
          AND r.store_id = o.store_id
        WHERE o.store_id = ?
        GROUP BY oi.product_title
        HAVING sold >= 5 AND (CAST(return_count AS REAL) / sold) > 0.15
        ORDER BY (CAST(return_count AS REAL) / sold) DESC
        LIMIT 20
      `).bind(storeId).all();

      let count = 0;
      const now = new Date().toISOString();
      for (const p of (highReturnProducts.results as { product_title: string; sold: number; return_count: number }[]) ?? []) {
        const rate = Math.round((p.return_count / p.sold) * 100);
        const id = `return_rate_${storeId}_${p.product_title.slice(0, 30)}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO product_alerts
            (id,product_title,alert_type,message,severity,created_at,store_id)
          VALUES (?,?,'HIGH_RETURNS',?,'high',?,?)
        `).bind(id, p.product_title, `${rate}% return rate (${p.return_count}/${p.sold} orders)`, now, storeId).run();
        count++;
      }

      // Alert products with no cost set but high revenue (margin blind)
      const noCostProducts = await env.DB.prepare(`
        SELECT oi.product_title, SUM(oi.revenue) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN product_costs pc ON pc.product_title = oi.product_title AND pc.store_id = o.store_id
        WHERE o.store_id = ? AND (pc.cost IS NULL OR pc.cost = 0)
        GROUP BY oi.product_title
        HAVING revenue > 500
        ORDER BY revenue DESC
        LIMIT 10
      `).bind(storeId).all();

      for (const p of (noCostProducts.results as { product_title: string; revenue: number }[]) ?? []) {
        const id = `no_cost_${storeId}_${p.product_title.slice(0, 30)}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO product_alerts
            (id,product_title,alert_type,message,severity,created_at,store_id)
          VALUES (?,?,'NO_COST',?,'medium',?,?)
        `).bind(id, p.product_title, `€${p.revenue.toFixed(0)} revenue but no purchase cost set — margin unknown`, now, storeId).run();
        count++;
      }

      return json({ scanned: true, alerts_created: count });
    }

    // ── GET /api/products/dead ────────────────────────────────────────────────
    if (path === "/api/products/dead" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const products = await env.DB.prepare(`
        SELECT p.id, p.title, p.handle, p.vendor, p.created_at, p.image_url,
               CAST(julianday('now') - julianday(p.created_at) AS INTEGER) as days_online,
               COALESCE(SUM(oi.quantity), 0) as total_sold
        FROM shopify_products p
        LEFT JOIN order_items oi ON oi.product_title = p.title AND oi.store_id = p.store_id
        WHERE p.store_id = ? AND p.status = 'active' AND substr(p.created_at, 1, 10) <= ?
        GROUP BY p.id
        HAVING total_sold = 0
        ORDER BY days_online DESC
        LIMIT 100
      `).bind(storeId, cutoffStr).all();

      return json({ products: products.results ?? [] });
    }

    // ── POST /api/products/archive ─────────────────────────────────────────────
    if (path === "/api/products/archive" && method === "POST") {
      const body = await request.json() as { id: string; store_id: string };
      if (!body.id || !body.store_id) return json({ error: "Missing fields" }, 400);
      await env.DB.prepare(
        `UPDATE shopify_products SET status='archived', updated_at=? WHERE id=? AND store_id=?`
      ).bind(new Date().toISOString(), body.id, body.store_id).run();
      return json({ ok: true });
    }

    // ── GET /api/milestones ───────────────────────────────────────────────────
    if (path === "/api/milestones" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const MILESTONES = [5, 10, 20, 50, 100, 200, 500, 1000];
      const today = getAmsterdamDate(0);
      const monthStart = today.slice(0, 7) + "-01";

      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM orders WHERE store_id=? AND substr(created_at,1,10)>=?`
      ).bind(storeId, monthStart).first();

      const totalThisMonth = (countRow?.total as number) ?? 0;
      const reached = MILESTONES.filter(m => totalThisMonth >= m);
      const next = MILESTONES.find(m => totalThisMonth < m) ?? null;

      // Record new milestones
      for (const m of reached) {
        const id = `${storeId}-${today.slice(0,7)}-${m}`;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO order_milestones (id,store_id,milestone,reached_at,notified) VALUES (?,?,?,?,0)`
        ).bind(id, storeId, m, new Date().toISOString()).run();
      }

      const allReached = await env.DB.prepare(
        `SELECT * FROM order_milestones WHERE store_id=? ORDER BY milestone DESC`
      ).bind(storeId).all();

      return json({ totalThisMonth, reached, next, milestones: allReached.results ?? [] });
    }

    // ── GET /api/returns ──────────────────────────────────────────────────────
    if (path === "/api/returns" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const returns = await env.DB.prepare(
        `SELECT * FROM returns WHERE store_id=? ORDER BY created_at DESC LIMIT 100`
      ).bind(storeId).all();
      const stats = await env.DB.prepare(
        `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count,
                SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) as refunded
         FROM returns WHERE store_id=?`
      ).bind(storeId).first();
      return json({ returns: returns.results ?? [], stats });
    }

    // ── POST /api/returns ─────────────────────────────────────────────────────
    if (path === "/api/returns" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const id = `ret-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await env.DB.prepare(`
        INSERT INTO returns (id,order_id,store_id,product_title,variant_title,reason,amount,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(id, body.order_id, body.store_id, body.product_title ?? "", body.variant_title ?? "",
              body.reason ?? "", body.amount ?? 0, body.status ?? "pending", new Date().toISOString()).run();
      return json({ ok: true, id });
    }

    // ── PUT /api/returns/:id ──────────────────────────────────────────────────
    if (path.startsWith("/api/returns/") && method === "PUT") {
      const id = path.split("/")[3];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      await env.DB.prepare(
        `UPDATE returns SET status=?, resolved_at=? WHERE id=?`
      ).bind(body.status, new Date().toISOString(), id).run();
      return json({ ok: true });
    }

    // ── GET /api/disputes ─────────────────────────────────────────────────────
    if (path === "/api/disputes" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const disputes = await env.DB.prepare(
        `SELECT * FROM disputes WHERE store_id=? ORDER BY created_at DESC LIMIT 100`
      ).bind(storeId).all();
      const stats = await env.DB.prepare(
        `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count,
                SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count
         FROM disputes WHERE store_id=?`
      ).bind(storeId).first();
      return json({ disputes: disputes.results ?? [], stats });
    }

    // ── POST /api/disputes ────────────────────────────────────────────────────
    if (path === "/api/disputes" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const id = `dis-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await env.DB.prepare(`
        INSERT INTO disputes (id,order_id,store_id,customer_email,amount,reason,status,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(id, body.order_id, body.store_id, body.customer_email ?? "", body.amount ?? 0,
              body.reason ?? "", "open", new Date().toISOString()).run();
      return json({ ok: true, id });
    }

    // ── PUT /api/disputes/:id ─────────────────────────────────────────────────
    if (path.startsWith("/api/disputes/") && method === "PUT") {
      const id = path.split("/")[3];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      await env.DB.prepare(
        `UPDATE disputes SET status=?, resolved_at=? WHERE id=?`
      ).bind(body.status, new Date().toISOString(), id).run();
      return json({ ok: true });
    }

    // ── GET /api/supplier-negotiations ────────────────────────────────────────
    if (path === "/api/supplier-negotiations" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const rows = await env.DB.prepare(
        `SELECT * FROM supplier_negotiations WHERE store_id=? ORDER BY updated_at DESC`
      ).bind(storeId).all();
      return json({ negotiations: rows.results ?? [] });
    }

    // ── POST /api/supplier-negotiations ───────────────────────────────────────
    if (path === "/api/supplier-negotiations" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const id = `neg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO supplier_negotiations
          (id,store_id,supplier_name,product_title,current_price,target_price,status,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).bind(id, body.store_id, body.supplier_name ?? "", body.product_title ?? "",
              body.current_price ?? 0, body.target_price ?? 0, "pending",
              body.notes ?? "", now, now).run();
      return json({ ok: true, id });
    }

    // ── PUT /api/supplier-negotiations/:id ────────────────────────────────────
    if (path.startsWith("/api/supplier-negotiations/") && method === "PUT") {
      const id = path.split("/")[3];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      await env.DB.prepare(
        `UPDATE supplier_negotiations SET status=?, notes=?, target_price=?, updated_at=? WHERE id=?`
      ).bind(body.status ?? "pending", body.notes ?? "", body.target_price ?? 0,
             new Date().toISOString(), id).run();
      return json({ ok: true });
    }

    // ── GET /api/quality-checks ───────────────────────────────────────────────
    if (path === "/api/quality-checks" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const rows = await env.DB.prepare(
        `SELECT * FROM quality_checks WHERE store_id=? ORDER BY created_at DESC LIMIT 50`
      ).bind(storeId).all();
      return json({ checks: rows.results ?? [] });
    }

    // ── POST /api/quality-checks ──────────────────────────────────────────────
    if (path === "/api/quality-checks" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const id = `qc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await env.DB.prepare(`
        INSERT INTO quality_checks (id,order_id,store_id,product_title,supplier,status,notes,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(id, body.order_id ?? "", body.store_id, body.product_title ?? "",
              body.supplier ?? "", "pending", body.notes ?? "", new Date().toISOString()).run();
      return json({ ok: true, id });
    }

    // ── GET /api/ads/import-status ────────────────────────────────────────────
    if (path === "/api/ads/overview" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const rows = await env.DB.prepare(`
        SELECT date, spend, clicks, impressions, conversions, cpc, ctr, roas
        FROM google_ads_daily
        WHERE store_id=? AND date>=? AND date<=?
        ORDER BY date DESC
      `).bind(storeId, start, end).all();

      const totals = await env.DB.prepare(`
        SELECT COALESCE(SUM(spend),0) as spend,
               COALESCE(SUM(clicks),0) as clicks,
               COALESCE(SUM(impressions),0) as impressions,
               COALESCE(SUM(conversions),0) as conversions,
               CASE WHEN SUM(clicks)>0 THEN SUM(spend)/SUM(clicks) ELSE 0 END as cpc,
               CASE WHEN SUM(impressions)>0 THEN CAST(SUM(clicks) AS REAL)/SUM(impressions)*100 ELSE 0 END as ctr
        FROM google_ads_daily WHERE store_id=? AND date>=? AND date<=?
      `).bind(storeId, start, end).first();

      return json({ rows: rows.results ?? [], totals });
    }

    // ── POST /api/ads/import ──────────────────────────────────────────────────
    if (path === "/api/ads/import" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const rows = body.rows as Array<{
        store_id: string; date: string; spend: number; clicks: number;
        impressions: number; conversions: number; cpc: number; ctr: number; roas: number;
      }>;
      let count = 0;
      for (const row of rows ?? []) {
        const id = `${row.store_id}-${row.date}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO google_ads_daily
            (id,store_id,date,spend,clicks,impressions,conversions,cpc,ctr,roas)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).bind(id, row.store_id, row.date, row.spend, row.clicks,
                row.impressions, row.conversions, row.cpc, row.ctr, row.roas).run();
        count++;
      }
      return json({ ok: true, imported: count });
    }

    // ── POST /api/webhooks/shopify/orders-create ──────────────────────────────
    if (path === "/api/webhooks/shopify/orders-create" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const orderId = String(body.id);
      const revenue = parseFloat(body.total_price ?? "0");
      const netRevenue = parseFloat(body.subtotal_price ?? String(revenue));

      await env.DB.prepare(`
        INSERT OR REPLACE INTO orders
          (id,shopify_order_id,order_number,email,currency,revenue,net_revenue,created_at,store_id)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(orderId, orderId, String(body.order_number ?? ""), body.email ?? "",
              body.currency ?? "EUR", revenue, netRevenue,
              body.created_at ?? new Date().toISOString(), storeId).run();

      for (const item of body.line_items ?? []) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO order_items
            (id,order_id,product_id,variant_id,product_title,variant_title,quantity,revenue,cost,store_id)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).bind(`${orderId}-item-${item.id}`, orderId, String(item.product_id ?? ""),
                String(item.variant_id ?? ""), item.title ?? "", item.variant_title ?? "",
                item.quantity ?? 1, parseFloat(item.price ?? "0") * (item.quantity ?? 1),
                0, storeId).run();
      }

      // Auto quality check for new orders
      for (const item of body.line_items ?? []) {
        const qcId = `qc-auto-${orderId}-${item.id}`;
        await env.DB.prepare(`
          INSERT OR IGNORE INTO quality_checks
            (id,order_id,store_id,product_title,supplier,status,notes,created_at)
          VALUES (?,?,?,?,?,?,?,?)
        `).bind(qcId, orderId, storeId, item.title ?? "", "Supplier",
                "pending", "Auto-created on order", new Date().toISOString()).run();
      }

      return json({ ok: true, order_id: orderId });
    }

    // ── POST /api/webhooks/shopify/products-create ────────────────────────────
    if (path === "/api/webhooks/shopify/products-create" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id") || "ceofo";
      const productId = body.handle || String(body.id);

      await env.DB.prepare(`
        INSERT OR REPLACE INTO shopify_products
          (id,title,handle,status,vendor,product_type,tags,created_at,published_at,updated_at,image_url,store_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(productId, body.title ?? "", body.handle ?? productId, body.status ?? "active",
              body.vendor ?? "", body.product_type ?? "", body.tags ?? "",
              body.created_at ?? new Date().toISOString(), body.published_at ?? new Date().toISOString(),
              body.updated_at ?? new Date().toISOString(), body.image?.src ?? "", storeId).run();

      for (const variant of body.variants ?? []) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO shopify_product_variants
            (id,product_id,variant_id,title,sku,price,inventory_quantity)
          VALUES (?,?,?,?,?,?,?)
        `).bind(`${productId}-${variant.id}`, productId, String(variant.id),
                variant.title ?? "", variant.sku ?? "",
                parseFloat(variant.price ?? "0"), variant.inventory_quantity ?? 0).run();
      }

      return json({ ok: true, id: productId });
    }

    // ── POST /api/webhooks/shopify/refunds-create ─────────────────────────────
    if (path === "/api/webhooks/shopify/refunds-create" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const amount = parseFloat(body.transactions?.[0]?.amount ?? "0");
      const orderId = String(body.order_id ?? "");
      const id = `ret-shopify-${body.id}`;

      const firstLine = body.refund_line_items?.[0];
      await env.DB.prepare(`
        INSERT OR IGNORE INTO returns
          (id,order_id,store_id,product_title,variant_title,reason,amount,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(id, orderId, storeId,
              firstLine?.line_item?.title ?? "Unknown",
              firstLine?.line_item?.variant_title ?? "",
              body.note ?? "Shopify refund", amount, "refunded",
              body.created_at ?? new Date().toISOString()).run();

      return json({ ok: true, id });
    }

    // ── GET /api/product-costs ────────────────────────────────────────────────
    if (path === "/api/product-costs" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      // Return all unique product titles sold + their saved cost
      const products = await env.DB.prepare(`
        SELECT
          oi.product_title,
          SUM(oi.quantity) as total_sold,
          SUM(oi.revenue) as total_revenue,
          COALESCE(pc.cost, 0) as cost,
          pc.updated_at
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN product_costs pc
          ON pc.product_title = oi.product_title AND pc.store_id = o.store_id
        WHERE o.store_id = ?
        GROUP BY oi.product_title
        ORDER BY total_revenue DESC
      `).bind(storeId).all();

      return json({ products: products.results ?? [] });
    }

    // ── POST /api/product-costs ───────────────────────────────────────────────
    if (path === "/api/product-costs" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const { store_id, product_title, cost } = body;
      if (!store_id || !product_title) return json({ error: "Missing fields" }, 400);

      const id = `${store_id}::${product_title}`;
      await env.DB.prepare(`
        INSERT OR REPLACE INTO product_costs (id, store_id, product_title, cost, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, store_id, product_title, parseFloat(cost) || 0, new Date().toISOString()).run();

      return json({ ok: true });
    }

    // ── POST /api/product-costs/bulk ──────────────────────────────────────────
    if (path === "/api/product-costs/bulk" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const items = body.items as Array<{ store_id: string; product_title: string; cost: number }>;
      let count = 0;
      for (const item of items ?? []) {
        const id = `${item.store_id}::${item.product_title}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO product_costs (id, store_id, product_title, cost, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, item.store_id, item.product_title, parseFloat(String(item.cost)) || 0, new Date().toISOString()).run();
        count++;
      }
      return json({ ok: true, updated: count });
    }

    return json({ error: "Not found", path }, 404);
  },
};
