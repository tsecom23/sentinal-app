import OpenAI from "openai";

type Env = {
  DB: D1Database;
  OPENAI_API_KEY: string;
  SHOPIFY_STORE_DOMAIN: string;
  SHOPIFY_ADMIN_ACCESS_TOKEN: string;
};

type ShopifyOrder = {
  id?: string | number;
  order_number?: string | number;
  email?: string;
  currency?: string;
  total_price?: string;
  current_total_price?: string;
  created_at?: string;
  line_items?: {
    id?: string | number;
    product_id?: string | number;
    variant_id?: string | number;
    title?: string;
    variant_title?: string;
    quantity?: number;
    price?: string;
  }[];
};

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Hmac-SHA256",
};

function getStoreId(url: URL) {
  return url.searchParams.get("store_id") || "ceofo";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const storeId = getStoreId(url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/api/test") {
      return Response.json(
        {
          ok: true,
          message: "Sentinel API werkt",
        },
        { headers }
      );
    }

    /*
    ============================================
    STORES
    ============================================
    */

    if (url.pathname === "/api/stores") {
      const stores = await env.DB.prepare(`
        SELECT *
        FROM stores
        ORDER BY created_at ASC
      `).all();

      return Response.json(
        {
          stores: stores.results || [],
        },
        { headers }
      );
    }

    /*
    ============================================
    PRODUCTS
    ============================================
    */

    if (url.pathname === "/api/shopify/products") {
      const products = await env.DB.prepare(`
        SELECT
          p.*,
          COALESCE(SUM(oi.quantity), 0) as sold,
          COALESCE(SUM(oi.revenue), 0) as revenue,
          COALESCE(SUM(oi.revenue - (oi.quantity * oi.cost)), 0) as profit
        FROM shopify_products p
        LEFT JOIN order_items oi
          ON oi.product_title = p.title
          AND COALESCE(oi.store_id, 'ceofo') = COALESCE(p.store_id, 'ceofo')
        WHERE COALESCE(p.store_id, 'ceofo') = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `)
        .bind(storeId)
        .all();

      return Response.json(
        {
          products: products.results || [],
        },
        { headers }
      );
    }

    /*
    ============================================
    DASHBOARD OVERVIEW
    ============================================
    */

    if (url.pathname === "/api/dashboard/overview") {
      const orderResult = await env.DB.prepare(`
        SELECT COUNT(*) as orders,
               COALESCE(SUM(revenue), 0) as revenue
        FROM orders
        WHERE COALESCE(store_id, 'ceofo') = ?
      `)
        .bind(storeId)
        .first<{ orders: number; revenue: number }>();

      const costResult = await env.DB.prepare(`
        SELECT COALESCE(SUM(quantity * cost), 0) as productCost
        FROM order_items
        WHERE COALESCE(store_id, 'ceofo') = ?
      `)
        .bind(storeId)
        .first<{ productCost: number }>();

      const trend = await env.DB.prepare(`
        SELECT
          substr(created_at, 1, 10) as day,
          COALESCE(SUM(revenue), 0) as revenue
        FROM orders
        WHERE COALESCE(store_id, 'ceofo') = ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC
      `)
        .bind(storeId)
        .all();

      const orders = Number(orderResult?.orders || 0);
      const revenue = Number(orderResult?.revenue || 0);
      const productCost = Number(costResult?.productCost || 0);

      return Response.json(
        {
          revenue,
          netRevenue: revenue,
          orders,
          sessions: 0,
          cvr: 0,
          aov: orders > 0
            ? Number((revenue / orders).toFixed(2))
            : 0,
          adSpend: 0,
          productCost,
          profit: revenue - productCost,
          roas: 0,
          revenueTrend: trend.results || [],
        },
        { headers }
      );
    }

    /*
    ============================================
    PRODUCT ALERTS
    ============================================
    */

    if (url.pathname === "/api/product-alerts") {
      const alerts = await env.DB.prepare(`
        SELECT *
        FROM product_alerts
        WHERE COALESCE(store_id, 'ceofo') = ?
        ORDER BY created_at DESC
        LIMIT 50
      `)
        .bind(storeId)
        .all();

      return Response.json(
        {
          alerts: alerts.results || [],
        },
        { headers }
      );
    }

    /*
    ============================================
    AI CHAT
    ============================================
    */

    if (url.pathname === "/api/ai/chat" && request.method === "POST") {
      try {
        const openai = new OpenAI({
          apiKey: env.OPENAI_API_KEY,
        });

        const body = (await request.json()) as {
          message?: string;
        };

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are Sentinel AI. Focus on ecommerce profitability, Google Ads readiness, margins, ROAS, CPA and scaling opportunities.",
            },
            {
              role: "user",
              content: body.message || "",
            },
          ],
        });

        return Response.json(
          {
            ok: true,
            reply:
              completion.choices[0]?.message?.content ||
              "No response generated.",
          },
          { headers }
        );
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "AI failed",
          },
          {
            status: 500,
            headers,
          }
        );
      }
    }

    /*
    ============================================
    FALLBACK
    ============================================
    */

    return Response.json(
      {
        error: "Not found",
        path: url.pathname,
      },
      {
        status: 404,
        headers,
      }
    );
  },
};