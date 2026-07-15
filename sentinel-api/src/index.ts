interface Env {
  DB: D1Database;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  OUTLOOK_CLIENT_ID?: string;
  OUTLOOK_CLIENT_SECRET?: string;
}

// ─── FX rate cache (per worker instance, resets on cold start) ───────────────
const _fxCache: Record<string, { rate: number; ts: number }> = {};
async function getFxRate(from: string, to: string): Promise<number> {
  if (!from || from === to) return 1;
  const key = `${from}_${to}`;
  const cached = _fxCache[key];
  if (cached && Date.now() - cached.ts < 3_600_000) return cached.rate;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, { cf: { cacheTtl: 3600 } } as RequestInit);
    const d = await r.json() as { rates: Record<string, number> };
    const rate = d.rates[to];
    if (rate && rate > 0) { _fxCache[key] = { rate, ts: Date.now() }; return rate; }
  } catch { /* fall through to hardcoded */ }
  // Hardcoded fallback rates (updated 2026-06)
  const FALLBACK: Record<string, number> = { CAD_EUR: 0.67, USD_EUR: 0.92, GBP_EUR: 1.17, AUD_EUR: 0.59 };
  return FALLBACK[key] ?? 1;
}

// ─── Cancel-sync: pull cancelled Shopify orders → mark 'cancelled' in D1 ────────
// A cancelled Shopify order has `cancelled_at` set while its financial_status
// stays paid/refunded, so cancellations never reached D1 and kept counting as
// sold. This backfills them; the stock calc already excludes 'cancelled'.
// Runs on demand (POST /api/sync/cancellations) and on a cron (scheduled).
async function syncCancellations(env: Env, storeId?: string): Promise<number> {
  const q = storeId
    ? env.DB.prepare(`SELECT id, shopify_domain, shopify_access_token FROM stores WHERE id=?`).bind(storeId)
    : env.DB.prepare(`SELECT id, shopify_domain, shopify_access_token FROM stores`);
  const stores = (await q.all()).results as Array<{ id: string; shopify_domain: string; shopify_access_token: string }>;

  let marked = 0;
  for (const store of stores) {
    if (!store.shopify_domain || !store.shopify_access_token) continue;
    const base = `https://${store.shopify_domain}/admin/api/2024-01`;
    const headers = { "X-Shopify-Access-Token": store.shopify_access_token };

    let pageInfo: string | null = null;
    for (let page = 0; page < 10; page++) {
      // page_info can't be combined with other filters (only limit)
      const qs = pageInfo
        ? `page_info=${pageInfo}&limit=250`
        : `status=cancelled&limit=250&created_at_min=2024-01-01T00:00:00Z&fields=id,cancelled_at`;
      const res = await fetch(`${base}/orders.json?${qs}`, { headers });
      if (!res.ok) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orders: any[] = data.orders ?? [];
      if (orders.length === 0) break;
      for (const o of orders) {
        if (!o.cancelled_at) continue;
        const r = await env.DB.prepare(
          `UPDATE orders SET financial_status='cancelled' WHERE shopify_order_id=? AND store_id=?`
        ).bind(String(o.id), store.id).run();
        marked += (r.meta?.changes as number) ?? 0;
      }
      const link = res.headers.get("Link") ?? "";
      const next = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (next) { pageInfo = next[1]; } else { break; }
    }
  }
  return marked;
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
  // Direct start/end params take priority (custom ranges)
  const s = url.searchParams.get("start");
  const e = url.searchParams.get("end");
  if (s && e && /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { start: s, end: e };
  }
  const range = url.searchParams.get("range") || "30d";
  if (range === "today")     { const d = getAmsterdamDate(0);  return { start: d, end: d }; }
  if (range === "yesterday") { const d = getAmsterdamDate(-1); return { start: d, end: d }; }
  if (range === "7d")  return { start: getAmsterdamDate(-6),  end: getAmsterdamDate(0) };
  if (range === "90d") return { start: getAmsterdamDate(-89), end: getAmsterdamDate(0) };
  if (range === "all") return { start: "2020-01-01",          end: getAmsterdamDate(0) };
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
  `CREATE TABLE IF NOT EXISTS google_ads_products (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, date TEXT NOT NULL,
    product_title TEXT NOT NULL, spend REAL DEFAULT 0, clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0, conversions REAL DEFAULT 0,
    cpc REAL DEFAULT 0, ctr REAL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS product_milestones (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    product_title TEXT NOT NULL, milestone INTEGER NOT NULL,
    reached_at TEXT, notified INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS cs_tickets (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    order_number TEXT, customer_email TEXT,
    category TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    subject TEXT, description TEXT,
    product_title TEXT,
    resolution TEXT,
    created_at TEXT, updated_at TEXT, resolved_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS notification_settings (
    store_id TEXT PRIMARY KEY,
    slack_webhook TEXT DEFAULT '',
    whatsapp_phone TEXT DEFAULT '',
    notify_milestones INTEGER DEFAULT 1,
    notify_kill_signals INTEGER DEFAULT 1,
    notify_cs_urgent INTEGER DEFAULT 1,
    notify_daily_digest INTEGER DEFAULT 0,
    updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    provider TEXT NOT NULL, email TEXT NOT NULL,
    access_token TEXT, refresh_token TEXT, token_expiry TEXT,
    connected_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS email_threads (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    account_id TEXT NOT NULL, provider_thread_id TEXT,
    subject TEXT, customer_email TEXT, customer_name TEXT,
    status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal',
    last_message_at TEXT, created_at TEXT,
    message_count INTEGER DEFAULT 0)`,
  `ALTER TABLE email_threads ADD COLUMN priority TEXT DEFAULT 'normal'`,
  `ALTER TABLE email_threads ADD COLUMN created_at TEXT`,
  `CREATE TABLE IF NOT EXISTS email_messages (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
    provider_message_id TEXT UNIQUE,
    from_email TEXT, from_name TEXT, to_email TEXT,
    body_text TEXT, body_html TEXT,
    direction TEXT DEFAULT 'inbound', sent_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS canned_responses (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS overhead_costs (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL,
    name TEXT NOT NULL, category TEXT DEFAULT 'other',
    amount REAL DEFAULT 0, recurring TEXT DEFAULT 'monthly',
    active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shopify_domain TEXT DEFAULT '',
    shopify_access_token TEXT DEFAULT '',
    google_ads_customer_id TEXT DEFAULT '',
    currency TEXT DEFAULT 'EUR',
    created_at TEXT)`,
  `INSERT OR IGNORE INTO stores (id,name,shopify_domain,currency,created_at) VALUES ('ceofo','CEOFO','','EUR','2024-01-01')`,
  `INSERT OR IGNORE INTO stores (id,name,shopify_domain,currency,created_at) VALUES ('martaline','Martaline','','EUR','2024-01-01')`,
  `INSERT OR IGNORE INTO stores (id,name,shopify_domain,created_at) VALUES ('dorevy','Dorevy','gfauyv-wi.myshopify.com','2024-01-01')`,
  // Add google_ads_customer_id and shopify_access_token to stores if they don't exist yet
  `ALTER TABLE stores ADD COLUMN google_ads_customer_id TEXT DEFAULT ''`,
  `ALTER TABLE stores ADD COLUMN shopify_access_token TEXT DEFAULT ''`,
  // Tags on CS tickets
  `ALTER TABLE cs_tickets ADD COLUMN tags TEXT DEFAULT ''`,
  `ALTER TABLE cs_tickets ADD COLUMN source TEXT DEFAULT 'manual'`,
  `ALTER TABLE cs_tickets ADD COLUMN thread_id TEXT DEFAULT ''`,
  // Order enrichment: tracking + fulfillment + customer profile
  `ALTER TABLE orders ADD COLUMN tracking_number TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN tracking_url TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN fulfillment_status TEXT DEFAULT 'unfulfilled'`,
  `ALTER TABLE orders ADD COLUMN financial_status TEXT DEFAULT 'paid'`,
  `ALTER TABLE orders ADD COLUMN customer_name TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN customer_phone TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN customer_city TEXT DEFAULT ''`,
  `ALTER TABLE orders ADD COLUMN customer_country TEXT DEFAULT ''`,
  // ROAS Tracker — daily editable sheet per store
  `CREATE TABLE IF NOT EXISTS roas_tracker (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    date TEXT NOT NULL,
    ad_spend REAL DEFAULT 0,
    revenue REAL DEFAULT 0,
    orders INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    is_manual INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(store_id, date)
  )`,
  // ROAS Tracker — per country (multifeed stores)
  `CREATE TABLE IF NOT EXISTS roas_tracker_country (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    date TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    ad_spend REAL DEFAULT 0,
    revenue REAL DEFAULT 0,
    orders INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    is_manual INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(store_id, date, country)
  )`,
  `ALTER TABLE google_ads_daily ADD COLUMN country TEXT DEFAULT ''`,
  // Returns enrichment — reason classification + extra fields
  `ALTER TABLE returns ADD COLUMN event_type TEXT DEFAULT 'return'`,
  `ALTER TABLE returns ADD COLUMN sku TEXT DEFAULT ''`,
  `ALTER TABLE returns ADD COLUMN quantity INTEGER DEFAULT 1`,
  `ALTER TABLE returns ADD COLUMN sale_price REAL DEFAULT 0`,
  `ALTER TABLE returns ADD COLUMN currency TEXT DEFAULT 'EUR'`,
  `ALTER TABLE returns ADD COLUMN country TEXT DEFAULT ''`,
  `ALTER TABLE returns ADD COLUMN reason_category TEXT DEFAULT ''`,
  `ALTER TABLE returns ADD COLUMN source_platform TEXT DEFAULT 'shopify'`,
  // Disputes enrichment
  `ALTER TABLE disputes ADD COLUMN reason_category TEXT DEFAULT ''`,
  `ALTER TABLE disputes ADD COLUMN outcome TEXT DEFAULT ''`,
  `ALTER TABLE disputes ADD COLUMN currency TEXT DEFAULT 'EUR'`,
  `ALTER TABLE disputes ADD COLUMN country TEXT DEFAULT ''`,
  `ALTER TABLE disputes ADD COLUMN source_platform TEXT DEFAULT 'stripe'`,
  `ALTER TABLE disputes ADD COLUMN dispute_type TEXT DEFAULT 'dispute'`,
];

async function runMigrations(db: D1Database) {
  for (const sql of MIGRATIONS) {
    try { await db.prepare(sql).run(); } catch { /* table already exists */ }
  }
}

let migrated = false;

// ─── Email / Inbox Helpers ────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Reason Classification ────────────────────────────────────────────────────

const REASON_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["taille","size","petit","grand","small","big","tight","loose","fit","sizing","too small","too big","too large","too tight","maat","pas","kleiner","größe","zu klein","zu groß"], category: "Maat / Pasvorm" },
  { keywords: ["quality","qualité","cheap","thin","poor","flimsy","badly made","poorly made","sewn","stitching","kwaliteit","goedkoop","kwalité","niet goed","slecht"], category: "Productkwaliteit" },
  { keywords: ["defect","broken","damaged","cassé","endommagé","ripped","torn","déchiré","défectueux","broken on arrival","arrivé cassé","ne fonctionne pas","kapot","stuk","beschadigd"], category: "Defect / Beschadigd" },
  { keywords: ["wrong item","wrong product","mauvais produit","pas commandé","not what i ordered","different product","verkeerd product","wrong order","faux article"], category: "Verkeerd product ontvangen" },
  { keywords: ["color","colour","couleur","different color","not matching","nuance","teinte","different colour","kleurverschil","verkeerde kleur","autre couleur"], category: "Kleurverschil" },
  { keywords: ["not received","not arrived","missing","pas reçu","perdu","lost","never arrived","jamais reçu","niet ontvangen","nooit aangekomen","non livré"], category: "Niet ontvangen" },
  { keywords: ["late","delay","livraison","retard","slow delivery","trop long","te laat","te traag","vertraging","trop de temps"], category: "Leveringsvertraging" },
  { keywords: ["not as expected","not as described","different","pas comme","misleading","not what i expected","trompeur","anders dan verwacht","niet zoals","niet conform","photo","image","photo differ"], category: "Niet zoals verwacht" },
  { keywords: ["changed mind","no longer want","don't want","plus envie","changer d'avis","i changed my mind","bedacht","wil niet meer","me ravise"], category: "Klant bedacht" },
  { keywords: ["fraud","unauthorized","not authorized","frauduleux","non autorisé","didn't order","i didn't order","ongeautoriseerd","fraude","oplichting"], category: "Ongeautoriseerde transactie" },
  { keywords: ["duplicate","double order","ordered twice","deux fois","en double","dubbel","deux commandes"], category: "Dubbele bestelling" },
  { keywords: ["packaging","package damaged","emballage","box damaged","colis abîmé","verpakking","doos beschadigd","emballage abîmé"], category: "Verpakking beschadigd" },
  { keywords: ["material","matière","fabric","tissu","texture","scratchy","rough","synthetic","matériaux","stof","materiaal"], category: "Materiaalprobleem" },
  { keywords: ["uncomfortable","comfort","inconfort","gêne","oncomfortabel","niet comfortabel","inconfortable"], category: "Comfortprobleem" },
  { keywords: ["chargeback","charge back","bankboeking","bank dispute","payment dispute"], category: "Chargeback" },
];

function classifyReason(reason: string): string {
  if (!reason) return "Onbekend";
  const lower = reason.toLowerCase();
  for (const rule of REASON_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.category;
    }
  }
  return "Anders";
}

async function refreshOAuthToken(provider: string, refreshToken: string, env: Env): Promise<{ accessToken: string; expiry: string }> {
  let tokenUrl: string;
  let params: Record<string, string>;

  if (provider === "gmail") {
    tokenUrl = "https://oauth2.googleapis.com/token";
    params = {
      refresh_token: refreshToken,
      client_id: env.GMAIL_CLIENT_ID ?? "",
      client_secret: env.GMAIL_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    };
  } else {
    tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    params = {
      refresh_token: refreshToken,
      client_id: env.OUTLOOK_CLIENT_ID ?? "",
      client_secret: env.OUTLOOK_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite offline_access",
    };
  }
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const d = await r.json() as { access_token: string; expires_in: number; error?: string };
  if (d.error || !d.access_token) throw new Error(d.error ?? "refresh failed");
  return {
    accessToken: d.access_token,
    expiry: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
  };
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  try { return atob(padded); } catch { return ""; }
}

function extractGmailBody(payload: Record<string, unknown>): { text: string; html: string } {
  if (!payload) return { text: "", html: "" };
  const body = payload.body as { data?: string } | undefined;
  if (body?.data) {
    const decoded = decodeBase64Url(body.data);
    if (payload.mimeType === "text/plain") return { text: decoded, html: "" };
    if (payload.mimeType === "text/html")  return { text: "", html: decoded };
  }
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    let text = ""; let html = "";
    for (const part of parts) {
      const partBody = part.body as { data?: string } | undefined;
      if (part.mimeType === "text/plain" && partBody?.data) {
        text = decodeBase64Url(partBody.data);
      } else if (part.mimeType === "text/html" && partBody?.data) {
        html = decodeBase64Url(partBody.data);
      } else if (part.parts) {
        const nested = extractGmailBody(part);
        if (nested.text) text = nested.text;
        if (nested.html) html = nested.html;
      }
    }
    return { text, html };
  }
  return { text: "", html: "" };
}

function detectPriority(subject: string, body: string): "urgent" | "high" | "normal" {
  const text = `${subject} ${body}`.toLowerCase().slice(0, 1200);
  const urgent = [
    "urgent", "urgente", "lawsuit", "avocat", "legal action", "police", "fraud", "fraude",
    "chargeback", "scam", "arnaque", "hack", "dangerous", "dangereux", "injury",
    "blessure", "brûlure", "burn", "menace", "threat", "immédiatement", "immediately",
  ];
  const high = [
    "refund", "remboursement", "return", "retour", "cancel", "annuler",
    "not received", "pas reçu", "never arrived", "wrong item", "mauvais produit",
    "missing", "manquant", "damaged", "endommagé", "broken", "cassé",
    "complaint", "plainte", "problème", "problem", "issue", "help",
    "aidez", "dispute", "litige", "lost", "perdu",
  ];
  if (urgent.some(kw => text.includes(kw))) return "urgent";
  if (high.some(kw => text.includes(kw))) return "high";
  return "normal";
}

function encodeBase64Url(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function syncGmailAccount(account: Record<string, string>, accessToken: string, storeId: string, db: D1Database): Promise<number> {
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox&maxResults=25",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return 0;
  const listData = await listRes.json() as { messages?: { id: string }[] };
  const ids = (listData.messages ?? []).map((m: { id: string }) => m.id);
  let synced = 0;

  for (const msgId of ids) {
    const existing = await db.prepare("SELECT id FROM email_messages WHERE provider_message_id=?").bind(msgId).first();
    if (existing) continue;

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json() as Record<string, unknown>;

    const headers = (msg.payload as Record<string, unknown> | undefined)?.headers as { name: string; value: string }[] ?? [];
    const hdr = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

    const from    = hdr("from");
    const to      = hdr("to");
    const subject = hdr("subject") || "(no subject)";
    const date    = hdr("date");
    const threadId = msg.threadId as string;

    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) ?? [null, "", from];
    const fromName  = (fromMatch[1] ?? "").replace(/"/g, "").trim();
    const fromEmail = fromMatch[2] || from;
    const sentAt    = date ? new Date(date).toISOString() : new Date().toISOString();
    const { text, html } = extractGmailBody(msg.payload as Record<string, unknown>);

    // upsert thread
    const existingThread = await db.prepare(
      "SELECT id FROM email_threads WHERE provider_thread_id=? AND account_id=?"
    ).bind(threadId, account.id).first() as { id: string } | null;

    const priority = detectPriority(subject, text);
    let threadDbId: string;
    if (existingThread) {
      threadDbId = existingThread.id;
      await db.prepare("UPDATE email_threads SET last_message_at=?, message_count=message_count+1, priority=CASE WHEN priority='urgent' THEN 'urgent' WHEN ?='urgent' THEN 'urgent' WHEN priority='high' THEN 'high' ELSE ? END WHERE id=?")
        .bind(sentAt, priority, priority, threadDbId).run();
    } else {
      threadDbId = `th-${uid()}`;
      await db.prepare(`INSERT INTO email_threads (id,store_id,account_id,provider_thread_id,subject,customer_email,customer_name,status,priority,last_message_at,created_at,message_count) VALUES (?,?,?,?,?,?,?,'open',?,?,?,1)`)
        .bind(threadDbId, storeId, account.id, threadId, subject, fromEmail, fromName, priority, sentAt, sentAt).run();
    }

    await db.prepare(`INSERT OR IGNORE INTO email_messages (id,thread_id,provider_message_id,from_email,from_name,to_email,body_text,body_html,direction,sent_at) VALUES (?,?,?,?,?,?,?,?,'inbound',?)`)
      .bind(`msg-${uid()}`, threadDbId, msgId, fromEmail, fromName, to, text, html, sentAt).run();
    synced++;
  }
  return synced;
}

async function syncOutlookAccount(account: Record<string, string>, accessToken: string, storeId: string, db: D1Database): Promise<number> {
  const listRes = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime%20desc&$select=id,subject,from,toRecipients,body,conversationId,receivedDateTime",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return 0;
  const listData = await listRes.json() as { value?: Record<string, unknown>[] };
  let synced = 0;

  for (const msg of listData.value ?? []) {
    const existing = await db.prepare("SELECT id FROM email_messages WHERE provider_message_id=?").bind(msg.id).first();
    if (existing) continue;

    const fromObj   = msg.from as { emailAddress?: { address?: string; name?: string } } | undefined;
    const fromEmail = fromObj?.emailAddress?.address ?? "";
    const fromName  = fromObj?.emailAddress?.name ?? "";
    const toArr     = msg.toRecipients as { emailAddress?: { address?: string } }[] ?? [];
    const toEmail   = toArr.map(r => r.emailAddress?.address).join(", ");
    const subject   = (msg.subject as string) || "(no subject)";
    const sentAt    = (msg.receivedDateTime as string) ?? new Date().toISOString();
    const threadId  = msg.conversationId as string;
    const bodyObj   = msg.body as { contentType?: string; content?: string } | undefined;
    const bodyText  = bodyObj?.contentType === "text" ? (bodyObj.content ?? "") : "";
    const bodyHtml  = bodyObj?.contentType === "html" ? (bodyObj.content ?? "") : "";

    const priority = detectPriority(subject, bodyText);
    const existingThread = await db.prepare(
      "SELECT id FROM email_threads WHERE provider_thread_id=? AND account_id=?"
    ).bind(threadId, account.id).first() as { id: string } | null;

    let threadDbId: string;
    if (existingThread) {
      threadDbId = existingThread.id;
      await db.prepare("UPDATE email_threads SET last_message_at=?, message_count=message_count+1, priority=CASE WHEN priority='urgent' THEN 'urgent' WHEN ?='urgent' THEN 'urgent' WHEN priority='high' THEN 'high' ELSE ? END WHERE id=?")
        .bind(sentAt, priority, priority, threadDbId).run();
    } else {
      threadDbId = `th-${uid()}`;
      await db.prepare(`INSERT INTO email_threads (id,store_id,account_id,provider_thread_id,subject,customer_email,customer_name,status,priority,last_message_at,created_at,message_count) VALUES (?,?,?,?,?,?,?,'open',?,?,?,1)`)
        .bind(threadDbId, storeId, account.id, threadId, subject, fromEmail, fromName, priority, sentAt, sentAt).run();
    }

    await db.prepare(`INSERT OR IGNORE INTO email_messages (id,thread_id,provider_message_id,from_email,from_name,to_email,body_text,body_html,direction,sent_at) VALUES (?,?,?,?,?,?,?,?,'inbound',?)`)
      .bind(`msg-${uid()}`, threadDbId, msg.id as string, fromEmail, fromName, toEmail, bodyText, bodyHtml, sentAt).run();
    synced++;
  }
  return synced;
}

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

    // ── GET /api/stores ───────────────────────────────────────────────────────
    if (path === "/api/stores" && method === "GET") {
      // First ensure google_ads_customer_id column exists (idempotent, safe to run every time)
      try { await env.DB.prepare(`ALTER TABLE stores ADD COLUMN google_ads_customer_id TEXT DEFAULT ''`).run(); } catch { /* already exists */ }
      try { await env.DB.prepare(`ALTER TABLE stores ADD COLUMN shopify_access_token TEXT DEFAULT ''`).run(); } catch { /* already exists */ }
      try { await env.DB.prepare(`ALTER TABLE stores ADD COLUMN currency TEXT DEFAULT 'EUR'`).run(); } catch { /* already exists */ }
      const rows = await env.DB.prepare(`SELECT id,name,shopify_domain,google_ads_customer_id,currency,created_at FROM stores ORDER BY created_at ASC`).all();
      return json({ stores: rows.results });
    }

    // ── POST /api/stores ──────────────────────────────────────────────────────
    if (path === "/api/stores" && method === "POST") {
      const body = await request.json() as { name: string; shopify_domain?: string; shopify_access_token?: string; google_ads_customer_id?: string; currency?: string };
      if (!body.name) return json({ error: "name required" }, 400);
      const id = body.name.toLowerCase().trim().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      await env.DB.prepare(
        `INSERT OR IGNORE INTO stores (id,name,shopify_domain,shopify_access_token,google_ads_customer_id,currency,created_at) VALUES (?,?,?,?,?,?,?)`
      ).bind(id, body.name.trim(), body.shopify_domain ?? "", body.shopify_access_token ?? "", body.google_ads_customer_id ?? "", body.currency ?? "EUR", new Date().toISOString()).run();
      const store = await env.DB.prepare(`SELECT * FROM stores WHERE id=?`).bind(id).first();
      return json({ ok: true, store });
    }

    // ── PUT /api/stores/:id ───────────────────────────────────────────────────
    if (path.startsWith("/api/stores/") && method === "PUT") {
      const id = path.split("/")[3];
      const body = await request.json() as { name?: string; shopify_domain?: string; shopify_access_token?: string; google_ads_customer_id?: string; currency?: string };
      await env.DB.prepare(
        `UPDATE stores SET name=COALESCE(?,name), shopify_domain=COALESCE(?,shopify_domain), shopify_access_token=COALESCE(?,shopify_access_token), google_ads_customer_id=COALESCE(?,google_ads_customer_id), currency=COALESCE(?,currency) WHERE id=?`
      ).bind(body.name ?? null, body.shopify_domain ?? null, body.shopify_access_token ?? null, body.google_ads_customer_id ?? null, body.currency ?? null, id).run();
      const store = await env.DB.prepare(`SELECT * FROM stores WHERE id=?`).bind(id).first();
      return json({ ok: true, store });
    }

    // ── DELETE /api/stores/:id ────────────────────────────────────────────────
    if (path.startsWith("/api/stores/") && method === "DELETE") {
      const id = path.split("/")[3];
      await env.DB.prepare(`DELETE FROM stores WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── GET /api/dashboard/overview ──────────────────────────────────────────
    if (path === "/api/dashboard/overview" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      // FX: get store currency and fetch conversion rate to EUR
      const storeRow = await env.DB.prepare(`SELECT currency FROM stores WHERE id=?`).bind(storeId).first();
      const storeCurrency = (storeRow?.currency as string | null) ?? "EUR";
      const fxRate = await getFxRate(storeCurrency, "EUR");
      const fx = (v: number) => Math.round(v * fxRate * 100) / 100;

      // Optional per-country filter (e.g. ?country=FR for CEOFO)
      const country = url.searchParams.get("country") || "";
      const orderCC   = country ? "AND customer_country=?" : "";
      const adsCC     = country ? "AND country=?" : "AND (country='' OR country IS NULL)";
      const ob  = <T extends unknown[]>(base: T) => (country ? [...base, country] : base) as unknown[];
      const ab  = <T extends unknown[]>(base: T) => (country ? [...base, country] : base) as unknown[];

      const [overview, costRow, adsRow, returnsRow, disputesRow, trend, returnsTrend, adsTrend] = await Promise.all([
        env.DB.prepare(`
          SELECT COUNT(*) as orders,
                 COALESCE(SUM(revenue),0) as revenue,
                 COALESCE(SUM(net_revenue),0) as netRevenue
          FROM (
            SELECT MAX(revenue) as revenue, MAX(net_revenue) as net_revenue
            FROM orders
            WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
            ${orderCC}
            GROUP BY COALESCE(shopify_order_id, id)
          )
        `).bind(...ob([storeId, start, end])).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(pc.cost, oi.cost, 0)
          ), 0) as productCost
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          LEFT JOIN product_costs pc
            ON pc.product_title = oi.product_title AND pc.store_id = o.store_id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
            ${orderCC}
            AND o.revenue > 0
            AND NOT EXISTS (
              SELECT 1 FROM orders o2
              WHERE o2.shopify_order_id = o.shopify_order_id
                AND o2.store_id = o.store_id
                AND o2.rowid < o.rowid
                AND o.shopify_order_id IS NOT NULL
                AND o.shopify_order_id != ''
            )
        `).bind(...ob([storeId, start, end])).first(),

        env.DB.prepare(`
          SELECT COALESCE(SUM(spend),0) as adSpend,
                 COALESCE(SUM(clicks),0) as clicks,
                 COALESCE(SUM(impressions),0) as impressions,
                 COALESCE(SUM(conversions),0) as conversions,
                 CASE WHEN SUM(clicks)>0 THEN SUM(spend)/SUM(clicks) ELSE 0 END as cpc,
                 CASE WHEN SUM(impressions)>0 THEN CAST(SUM(clicks) AS REAL)/SUM(impressions)*100 ELSE 0 END as ctr
          FROM google_ads_daily
          WHERE store_id=? AND date>=? AND date<=? ${adsCC}
        `).bind(...ab([storeId, start, end])).first(),

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
          SELECT day, COALESCE(SUM(revenue),0) as revenue FROM (
            SELECT substr(created_at,1,10) as day, MAX(revenue) as revenue
            FROM orders
            WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
            ${orderCC}
            GROUP BY COALESCE(shopify_order_id, id)
          ) GROUP BY day ORDER BY day ASC
        `).bind(...ob([storeId, start, end])).all(),

        env.DB.prepare(`
          SELECT substr(created_at,1,10) as day, COALESCE(SUM(amount),0) as returnAmount
          FROM returns
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY day
        `).bind(storeId, start, end).all(),

        // Daily ad spend for profit trend (country-aware)
        env.DB.prepare(`
          SELECT date as day, COALESCE(SUM(spend),0) as adSpend
          FROM google_ads_daily
          WHERE store_id=? AND date>=? AND date<=? ${adsCC}
          GROUP BY date
        `).bind(...ab([storeId, start, end])).all(),
      ]);

      // Revenue values come from orders stored in store's local currency — apply FX to get EUR
      const grossRevenue = fx((overview?.revenue as number) ?? 0);
      const orders = (overview?.orders as number) ?? 0;
      const adSpend = (adsRow?.adSpend as number) ?? 0;          // ad spend is already in EUR
      const productCost = fx((costRow?.productCost as number) ?? 0); // COGs entered in store currency
      const returnAmount = fx((returnsRow?.returnAmount as number) ?? 0);
      const returnCount = (returnsRow?.returnCount as number) ?? 0;
      const disputeAmount = fx((disputesRow?.disputeAmount as number) ?? 0);
      const disputeCount = (disputesRow?.disputeCount as number) ?? 0;
      const netRevenue = Math.max(0, grossRevenue - returnAmount);
      const profit = netRevenue - adSpend - productCost;
      const aov = orders > 0 ? netRevenue / orders : 0;
      const roas = adSpend > 0 ? netRevenue / adSpend : 0;
      const returnRate = orders > 0 ? (returnCount / orders) * 100 : 0;
      const cpc = (adsRow?.cpc as number) ?? 0;
      const ctr = (adsRow?.ctr as number) ?? 0;
      const clicks = (adsRow?.clicks as number) ?? 0;
      const impressions = (adsRow?.impressions as number) ?? 0;

      // Break-even ROAS: the minimum ROAS needed to cover product costs
      // Formula: breakEven = revenue / (revenue - productCost) = 1 / gross_margin
      const grossMargin = grossRevenue > 0 && productCost > 0
        ? (grossRevenue - productCost) / grossRevenue : null;
      const breakEvenRoas = grossMargin && grossMargin > 0
        ? Math.round((1 / grossMargin) * 100) / 100 : null;

      // Cost ratio for estimating daily product cost
      const costRatio = grossRevenue > 0 && productCost > 0 ? productCost / grossRevenue : 0;

      // Build daily maps
      const returnsMap = new Map<string, number>();
      for (const r of (returnsTrend.results ?? []) as { day: string; returnAmount: number }[]) {
        returnsMap.set(r.day, r.returnAmount);
      }
      const adsMap = new Map<string, number>();
      for (const r of (adsTrend.results ?? []) as { day: string; adSpend: number }[]) {
        adsMap.set(r.day, r.adSpend);
      }

      // Build trend with both revenue and daily profit estimate (revenue converted to EUR)
      const netRevenueTrend = (trend.results ?? []).map((r) => {
        const row = r as { day: string; revenue: number };
        const dayRevenue = Math.max(0, fx(row.revenue) - (returnsMap.get(row.day) ?? 0));
        const dayAdSpend = adsMap.get(row.day) ?? 0;
        const dayProductCost = dayRevenue * costRatio;
        const dayProfit = Math.round((dayRevenue - dayAdSpend - dayProductCost) * 100) / 100;
        return { day: row.day, revenue: dayRevenue, profit: dayProfit };
      });

      return json({
        revenue: netRevenue,
        grossRevenue,
        netRevenue,
        orders, adSpend, productCost,
        returnAmount, returnCount, disputeAmount, disputeCount,
        profit, aov, roas, breakEvenRoas, returnRate, cpc, ctr, clicks, impressions,
        sessions: 0, cvr: 0,
        revenueTrend: netRevenueTrend,
        currency: "EUR", storeCurrency, fxRate,
      });
    }

    // ── GET /api/products/top ─────────────────────────────────────────────────
    if (path === "/api/products/top" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);
      const country = url.searchParams.get("country") || "";
      const cc = country ? "AND o.customer_country=?" : "";

      const products = await env.DB.prepare(`
        SELECT oi.product_title, oi.variant_title,
               SUM(oi.quantity) as sold,
               SUM(oi.revenue) as revenue,
               SUM((oi.revenue - COALESCE(oi.cost,0)) * oi.quantity) as profit,
               COALESCE(AVG(oi.cost),0) as unit_cost
        FROM order_items oi JOIN orders o ON oi.order_id=o.id
        WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
        ${cc}
        GROUP BY oi.product_title, oi.variant_title
        ORDER BY revenue DESC LIMIT 20
      `).bind(...(country ? [storeId, start, end, country] : [storeId, start, end])).all();

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

    // ── GET /api/product-milestones ──────────────────────────────────────────
    if (path === "/api/product-milestones" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const MILESTONES = [5, 20, 40];

      // First: delete milestone records for products that are now draft/archived
      await env.DB.prepare(`
        DELETE FROM product_milestones
        WHERE store_id=?
          AND EXISTS (
            SELECT 1 FROM shopify_products sp
            WHERE sp.title = product_milestones.product_title
              AND sp.store_id = product_milestones.store_id
              AND sp.status != 'active'
          )
      `).bind(storeId).run();

      // Total sold per ACTIVE products only (all time, deduped)
      const salesResult = await env.DB.prepare(`
        SELECT oi.product_title, SUM(oi.quantity) as total_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN shopify_products sp
          ON sp.title = oi.product_title AND sp.store_id = o.store_id
        WHERE o.store_id=?
          AND (sp.status IS NULL OR sp.status = 'active')
          AND NOT EXISTS (
            SELECT 1 FROM orders o2
            WHERE o2.shopify_order_id = o.shopify_order_id
              AND o2.store_id = o.store_id
              AND o2.rowid < o.rowid
              AND o.shopify_order_id IS NOT NULL
              AND o.shopify_order_id != ''
          )
        GROUP BY oi.product_title
        ORDER BY total_sold DESC
      `).bind(storeId).all();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products = (salesResult.results ?? []) as any[];

      // Record any newly crossed milestones (INSERT OR IGNORE = only once)
      for (const p of products) {
        for (const m of MILESTONES) {
          if (p.total_sold >= m) {
            const id = `${storeId}-${m}-${String(p.product_title).slice(0, 50)}`;
            await env.DB.prepare(`
              INSERT OR IGNORE INTO product_milestones
                (id,store_id,product_title,milestone,reached_at,notified)
              VALUES (?,?,?,?,?,0)
            `).bind(id, storeId, p.product_title, m, new Date().toISOString()).run();
          }
        }
      }

      // Fetch all recorded milestones (only active products)
      const milestonesResult = await env.DB.prepare(`
        SELECT pm.* FROM product_milestones pm
        LEFT JOIN shopify_products sp
          ON sp.title = pm.product_title AND sp.store_id = pm.store_id
        WHERE pm.store_id=?
          AND (sp.status IS NULL OR sp.status = 'active')
        ORDER BY pm.reached_at DESC
      `).bind(storeId).all();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const milestones = (milestonesResult.results ?? []) as any[];
      const soldMap = new Map(products.map((p) => [p.product_title, p.total_sold as number]));

      const alerts = milestones.map((m) => ({
        ...m,
        total_sold: soldMap.get(m.product_title) ?? m.milestone,
        is_new: m.notified === 0,
      }));

      // Products approaching the NEXT milestone (within 2 units away)
      const approaching = products
        .filter((p) => {
          const next = MILESTONES.find((m) => p.total_sold < m);
          return next !== undefined && next - p.total_sold <= 2;
        })
        .map((p) => ({
          product_title: p.product_title,
          total_sold: p.total_sold,
          next_milestone: MILESTONES.find((m) => p.total_sold < m)!,
        }));

      const newCount = alerts.filter((a) => a.is_new).length;
      return json({ alerts, approaching, newCount });
    }

    // ── POST /api/product-milestones/ack ─────────────────────────────────────
    if (path === "/api/product-milestones/ack" && method === "POST") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      await env.DB.prepare(
        `UPDATE product_milestones SET notified=1 WHERE store_id=? AND notified=0`
      ).bind(storeId).run();
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

    // ── GET /api/returns/analytics ────────────────────────────────────────────
    if (path === "/api/returns/analytics" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const days = parseInt(url.searchParams.get("days") ?? "90");
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

      const [totalsRow, productRows, reasonRows, weeklyRows, disputeRows, chargebackRows] = await Promise.all([
        env.DB.prepare(`
          SELECT
            COUNT(*) as return_count,
            COALESCE(SUM(amount),0) as refund_total,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
          FROM returns WHERE store_id=? AND created_at>=?
        `).bind(storeId, since).first(),
        env.DB.prepare(`
          SELECT product_title,
            COUNT(*) as return_count,
            COALESCE(SUM(amount),0) as refund_total,
            reason_category
          FROM returns WHERE store_id=? AND created_at>=?
          GROUP BY product_title
          ORDER BY return_count DESC LIMIT 30
        `).bind(storeId, since).all(),
        env.DB.prepare(`
          SELECT COALESCE(NULLIF(reason_category,''),'Onbekend') as category,
            COUNT(*) as count, COALESCE(SUM(amount),0) as total_amount
          FROM returns WHERE store_id=? AND created_at>=?
          GROUP BY category ORDER BY count DESC
        `).bind(storeId, since).all(),
        env.DB.prepare(`
          SELECT strftime('%Y-W%W', created_at) as week,
            COUNT(*) as count, COALESCE(SUM(amount),0) as amount
          FROM returns WHERE store_id=? AND created_at>=?
          GROUP BY week ORDER BY week ASC LIMIT 13
        `).bind(storeId, since).all(),
        env.DB.prepare(`
          SELECT status, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
          FROM disputes WHERE store_id=? AND (dispute_type='dispute' OR dispute_type IS NULL OR dispute_type='')
          GROUP BY status
        `).bind(storeId).all(),
        env.DB.prepare(`
          SELECT status, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
          FROM disputes WHERE store_id=? AND dispute_type='chargeback'
          GROUP BY status
        `).bind(storeId).all(),
      ]);

      // Compute top category per product
      const productStats = await Promise.all(
        (productRows.results ?? []).slice(0, 15).map(async (p: any) => {
          const topCat = await env.DB.prepare(`
            SELECT COALESCE(NULLIF(reason_category,''),'Onbekend') as category, COUNT(*) as cnt
            FROM returns WHERE store_id=? AND product_title=? AND created_at>=?
            GROUP BY category ORDER BY cnt DESC LIMIT 1
          `).bind(storeId, p.product_title, since).first();
          return { ...p, top_category: (topCat as any)?.category ?? "Onbekend" };
        })
      );

      const dStats = Object.fromEntries((disputeRows.results ?? []).map((r: any) => [r.status, { count: r.count, amount: r.amount }]));
      const dTotal = (disputeRows.results ?? []).reduce((s: number, r: any) => s + r.count, 0);
      const dWon = (dStats["won"]?.count ?? 0);
      const dLost = (dStats["lost"]?.count ?? 0);
      const cbTotal = (chargebackRows.results ?? []).reduce((s: number, r: any) => s + r.count, 0);
      const cbAmount = (chargebackRows.results ?? []).reduce((s: number, r: any) => s + r.amount, 0);

      return json({
        totals: {
          returns: (totalsRow as any)?.return_count ?? 0,
          refund_total: (totalsRow as any)?.refund_total ?? 0,
          pending: (totalsRow as any)?.pending ?? 0,
          disputes: dTotal,
          dispute_open: dStats["open"]?.count ?? 0,
          dispute_at_risk: dStats["open"]?.amount ?? 0,
          chargebacks: cbTotal,
          chargeback_amount: cbAmount,
          won: dWon,
          lost: dLost,
          win_rate: (dWon + dLost) > 0 ? Math.round(dWon / (dWon + dLost) * 100) : null,
        },
        product_stats: productStats,
        reason_breakdown: reasonRows.results ?? [],
        weekly_trends: weeklyRows.results ?? [],
      });
    }

    // ── POST /api/returns/import-csv ──────────────────────────────────────────
    // CSV format: order_id,product_title,reason,amount,event_type,date,country,source_platform
    if (path === "/api/returns/import-csv" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = body.store_id;
      const rows = body.rows as Array<{
        order_id?: string; product_title?: string; reason?: string;
        amount?: number; event_type?: string; date?: string;
        country?: string; source_platform?: string;
        customer_email?: string; status?: string; outcome?: string;
      }>;
      if (!storeId || !rows?.length) return json({ error: "Missing store_id or rows" }, 400);

      let imported = 0;
      for (const row of rows) {
        const eventType = row.event_type ?? "return";
        const category = classifyReason(row.reason ?? "");
        const date = row.date ?? new Date().toISOString();
        if (eventType === "chargeback" || eventType === "dispute") {
          const id = `dis-csv-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
          await env.DB.prepare(`
            INSERT OR IGNORE INTO disputes
              (id,order_id,store_id,customer_email,amount,reason,status,created_at,reason_category,country,source_platform,dispute_type)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(id, row.order_id ?? "", storeId, row.customer_email ?? "",
                  row.amount ?? 0, row.reason ?? "", row.status ?? "open",
                  date, category, row.country ?? "", row.source_platform ?? "csv", eventType).run();
        } else {
          const id = `ret-csv-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
          await env.DB.prepare(`
            INSERT OR IGNORE INTO returns
              (id,order_id,store_id,product_title,reason,amount,status,created_at,reason_category,country,source_platform,event_type)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(id, row.order_id ?? "", storeId, row.product_title ?? "",
                  row.reason ?? "", row.amount ?? 0, row.status ?? "refunded",
                  date, category, row.country ?? "", row.source_platform ?? "csv", eventType).run();
        }
        imported++;
      }
      return json({ ok: true, imported });
    }

    // ── POST /api/returns/reclassify ──────────────────────────────────────────
    if (path === "/api/returns/reclassify" && method === "POST") {
      const body = await request.json() as any;
      const storeId = body.store_id;
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const rows = await env.DB.prepare(
        `SELECT id, reason FROM returns WHERE store_id=?`
      ).bind(storeId).all();
      let updated = 0;
      for (const r of (rows.results ?? []) as any[]) {
        const cat = classifyReason(r.reason ?? "");
        await env.DB.prepare(`UPDATE returns SET reason_category=? WHERE id=?`).bind(cat, r.id).run();
        updated++;
      }
      const drows = await env.DB.prepare(
        `SELECT id, reason FROM disputes WHERE store_id=?`
      ).bind(storeId).all();
      for (const r of (drows.results ?? []) as any[]) {
        const cat = classifyReason(r.reason ?? "");
        await env.DB.prepare(`UPDATE disputes SET reason_category=? WHERE id=?`).bind(cat, r.id).run();
        updated++;
      }
      return json({ ok: true, updated });
    }

    // ── GET /api/returns ──────────────────────────────────────────────────────
    if (path === "/api/returns" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const returns = await env.DB.prepare(
        `SELECT * FROM returns WHERE store_id=? ORDER BY created_at DESC LIMIT 200`
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
      const category = classifyReason(body.reason ?? "");
      await env.DB.prepare(`
        INSERT INTO returns (id,order_id,store_id,product_title,variant_title,reason,amount,status,created_at,reason_category,source_platform,event_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(id, body.order_id ?? "", body.store_id, body.product_title ?? "",
              body.variant_title ?? "", body.reason ?? "", body.amount ?? 0,
              body.status ?? "pending", new Date().toISOString(),
              category, body.source_platform ?? "manual", body.event_type ?? "return").run();
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
        `SELECT * FROM disputes WHERE store_id=? ORDER BY created_at DESC LIMIT 200`
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
      const category = classifyReason(body.reason ?? "");
      await env.DB.prepare(`
        INSERT INTO disputes (id,order_id,store_id,customer_email,amount,reason,status,created_at,reason_category,source_platform,dispute_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).bind(id, body.order_id ?? "", body.store_id, body.customer_email ?? "",
              body.amount ?? 0, body.reason ?? "", "open", new Date().toISOString(),
              category, body.source_platform ?? "manual", body.dispute_type ?? "dispute").run();
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

    // ── GET /api/ads/today ────────────────────────────────────────────────────
    if (path === "/api/ads/today" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const today = new Date().toISOString().slice(0, 10);
      const row = await env.DB.prepare(
        `SELECT COALESCE(SUM(spend),0) as spend FROM google_ads_daily WHERE store_id=? AND date=? AND (country='' OR country IS NULL)`
      ).bind(storeId, today).first();
      return json({ date: today, spend: (row?.spend as number) ?? 0 });
    }

    // ── GET /api/ads/import-status ────────────────────────────────────────────
    if (path === "/api/ads/overview" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const rows = await env.DB.prepare(`
        SELECT date, spend, clicks, impressions, conversions, cpc, ctr, roas
        FROM google_ads_daily
        WHERE store_id=? AND date>=? AND date<=? AND (country='' OR country IS NULL)
        ORDER BY date DESC
      `).bind(storeId, start, end).all();

      const totals = await env.DB.prepare(`
        SELECT COALESCE(SUM(spend),0) as spend,
               COALESCE(SUM(clicks),0) as clicks,
               COALESCE(SUM(impressions),0) as impressions,
               COALESCE(SUM(conversions),0) as conversions,
               CASE WHEN SUM(clicks)>0 THEN SUM(spend)/SUM(clicks) ELSE 0 END as cpc,
               CASE WHEN SUM(impressions)>0 THEN CAST(SUM(clicks) AS REAL)/SUM(impressions)*100 ELSE 0 END as ctr
        FROM google_ads_daily WHERE store_id=? AND date>=? AND date<=? AND (country='' OR country IS NULL)
      `).bind(storeId, start, end).first();

      return json({ rows: rows.results ?? [], totals });
    }

    // ── POST /api/ads/import ──────────────────────────────────────────────────
    if (path === "/api/ads/import" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const force = body.force === true; // dashboard manual override bypasses protection
      const rows = body.rows as Array<{
        store_id: string; date: string; spend: number; clicks: number;
        impressions: number; conversions: number; cpc: number; ctr: number; roas: number;
        country?: string;
      }>;
      let count = 0;
      for (const row of rows ?? []) {
        const country = row.country ?? "";
        const id = country ? `${row.store_id}-${row.date}-${country}` : `${row.store_id}-${row.date}`;
        if (force) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO google_ads_daily
              (id,store_id,date,country,spend,clicks,impressions,conversions,cpc,ctr,roas)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `).bind(id, row.store_id, row.date, country, row.spend, row.clicks,
                  row.impressions, row.conversions, row.cpc, row.ctr, row.roas).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO google_ads_daily
              (id,store_id,date,country,spend,clicks,impressions,conversions,cpc,ctr,roas)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              spend       = CASE WHEN excluded.spend > spend THEN excluded.spend ELSE spend END,
              clicks      = excluded.clicks,
              impressions = excluded.impressions,
              conversions = excluded.conversions,
              cpc         = excluded.cpc,
              ctr         = excluded.ctr,
              roas        = excluded.roas
          `).bind(id, row.store_id, row.date, country, row.spend, row.clicks,
                  row.impressions, row.conversions, row.cpc, row.ctr, row.roas).run();
        }
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
      const customerName = `${body.customer?.first_name ?? ""} ${body.customer?.last_name ?? ""}`.trim();
      const customerPhone = body.customer?.phone ?? body.billing_address?.phone ?? "";
      const customerCity  = body.billing_address?.city ?? body.shipping_address?.city ?? "";
      const customerCountry = body.billing_address?.country_code ?? body.shipping_address?.country_code ?? "";
      const financialStatus  = body.financial_status ?? "paid";
      const fulfillmentStatus = body.fulfillment_status ?? "unfulfilled";
      // Tracking from first fulfillment if present
      const firstFulfillment = (body.fulfillments ?? [])[0];
      const trackingNumber = firstFulfillment?.tracking_number ?? "";
      const trackingUrl    = firstFulfillment?.tracking_url ?? "";

      await env.DB.prepare(`
        INSERT OR REPLACE INTO orders
          (id,shopify_order_id,order_number,email,currency,revenue,net_revenue,created_at,store_id,
           customer_name,customer_phone,customer_city,customer_country,
           financial_status,fulfillment_status,tracking_number,tracking_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(orderId, orderId, String(body.order_number ?? ""), body.email ?? "",
              body.currency ?? "EUR", revenue, netRevenue,
              body.created_at ?? new Date().toISOString(), storeId,
              customerName, customerPhone, customerCity, customerCountry,
              financialStatus, fulfillmentStatus, trackingNumber, trackingUrl).run();

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

    // ── POST /api/shopify/sync-orders ─────────────────────────────────────────
    // Pulls the last N orders from Shopify REST API and upserts them into D1.
    if (path === "/api/shopify/sync-orders" && method === "POST") {
      const body = await request.json() as { store_id: string; days?: number };
      const { store_id, days = 30 } = body;
      if (!store_id) return json({ error: "Missing store_id" }, 400);

      const store = await env.DB.prepare(`SELECT shopify_domain, shopify_access_token FROM stores WHERE id=?`).bind(store_id).first() as { shopify_domain: string; shopify_access_token: string } | null;
      if (!store?.shopify_domain || !store?.shopify_access_token) return json({ error: "Store not configured with Shopify credentials" }, 400);

      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      const shopifyBase = `https://${store.shopify_domain}/admin/api/2024-01`;
      const headers = { "X-Shopify-Access-Token": store.shopify_access_token, "Content-Type": "application/json" };

      let imported = 0;
      let pageInfo: string | null = null;

      for (let page = 0; page < 10; page++) {
        const qs = pageInfo
          ? `page_info=${pageInfo}&limit=250`
          : `limit=250&status=any&created_at_min=${sinceIso}&order=created_at+asc`;
        const res = await fetch(`${shopifyBase}/orders.json?${qs}`, { headers });
        if (!res.ok) return json({ error: `Shopify error ${res.status}` }, 502);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orders: any[] = data.orders ?? [];
        if (orders.length === 0) break;

        for (const o of orders) {
          const orderId = String(o.id);
          const revenue = parseFloat(o.total_price ?? "0");
          const netRevenue = parseFloat(o.subtotal_price ?? String(revenue));
          const customerName = `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim();
          const customerPhone = o.customer?.phone ?? o.billing_address?.phone ?? "";
          const customerCity = o.billing_address?.city ?? o.shipping_address?.city ?? "";
          const customerCountry = o.billing_address?.country_code ?? o.shipping_address?.country_code ?? "";
          const firstFulfillment = (o.fulfillments ?? [])[0];

          await env.DB.prepare(`
            INSERT OR REPLACE INTO orders
              (id,shopify_order_id,order_number,email,currency,revenue,net_revenue,created_at,store_id,
               customer_name,customer_phone,customer_city,customer_country,
               financial_status,fulfillment_status,tracking_number,tracking_url)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(orderId, orderId, String(o.order_number ?? ""), o.email ?? "",
                  o.currency ?? "EUR", revenue, netRevenue,
                  o.created_at ?? new Date().toISOString(), store_id,
                  customerName, customerPhone, customerCity, customerCountry,
                  o.cancelled_at ? "cancelled" : (o.financial_status ?? "paid"), o.fulfillment_status ?? "unfulfilled",
                  firstFulfillment?.tracking_number ?? "", firstFulfillment?.tracking_url ?? "").run();

          for (const item of o.line_items ?? []) {
            await env.DB.prepare(`
              INSERT OR REPLACE INTO order_items
                (id,order_id,product_id,variant_id,product_title,variant_title,quantity,revenue,cost,store_id)
              VALUES (?,?,?,?,?,?,?,?,?,?)
            `).bind(`${orderId}-item-${item.id}`, orderId, String(item.product_id ?? ""),
                    String(item.variant_id ?? ""), item.title ?? "", item.variant_title ?? "",
                    item.quantity ?? 1, parseFloat(item.price ?? "0") * (item.quantity ?? 1),
                    0, store_id).run();
          }
          imported++;
        }

        // Check for next page via Link header
        const link = res.headers.get("Link") ?? "";
        const nextMatch = link.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (nextMatch) { pageInfo = nextMatch[1]; } else { break; }
      }

      return json({ ok: true, imported });
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

      // Sum all transactions (handles partial refunds)
      const amount = (body.transactions ?? []).reduce(
        (sum: number, t: { amount?: string }) => sum + parseFloat(t.amount ?? "0"), 0
      );
      const orderId = String(body.order_id ?? "");
      const id = `ret-shopify-${body.id}`;

      // Build product title from all refunded line items
      const refundedTitles = (body.refund_line_items ?? [])
        .map((l: { line_item?: { title?: string } }) => l.line_item?.title ?? "")
        .filter(Boolean)
        .join(", ");
      const firstLine = body.refund_line_items?.[0];

      const refundReason = body.note ?? "Shopify refund";
      const refundCategory = classifyReason(refundReason);
      await env.DB.prepare(`
        INSERT OR REPLACE INTO returns
          (id,order_id,store_id,product_title,variant_title,reason,amount,status,created_at,reason_category,source_platform,event_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(id, orderId, storeId,
              refundedTitles || firstLine?.line_item?.title || "Unknown",
              firstLine?.line_item?.variant_title ?? "",
              refundReason, amount, "refunded",
              body.created_at ?? new Date().toISOString(),
              refundCategory, "shopify", "refund").run();

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

    // ── GET /api/orders ───────────────────────────────────────────────────────
    if (path === "/api/orders" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const [ordersResult, itemsResult, todayResult, yesterdayResult, adsToday] = await Promise.all([
        env.DB.prepare(`
          SELECT id, order_number, email, currency, revenue, net_revenue, created_at
          FROM orders o
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
            AND NOT EXISTS (
              SELECT 1 FROM orders o2
              WHERE o2.shopify_order_id = o.shopify_order_id
                AND o2.store_id = o.store_id
                AND o2.rowid < o.rowid
                AND o.shopify_order_id IS NOT NULL
                AND o.shopify_order_id != ''
            )
          ORDER BY created_at DESC LIMIT 500
        `).bind(storeId, start, end).all(),

        env.DB.prepare(`
          SELECT oi.order_id, oi.product_title, oi.variant_title, oi.quantity, oi.revenue
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
        `).bind(storeId, start, end).all(),

        // Today's stats (deduplicated by shopify_order_id)
        env.DB.prepare(`
          SELECT COUNT(*) as orders, COALESCE(SUM(revenue),0) as revenue FROM (
            SELECT MAX(revenue) as revenue
            FROM orders WHERE store_id=? AND substr(created_at,1,10)=?
            GROUP BY COALESCE(shopify_order_id, id)
          )
        `).bind(storeId, getAmsterdamDate(0)).first(),

        // Yesterday's stats (deduplicated by shopify_order_id)
        env.DB.prepare(`
          SELECT COUNT(*) as orders, COALESCE(SUM(revenue),0) as revenue FROM (
            SELECT MAX(revenue) as revenue
            FROM orders WHERE store_id=? AND substr(created_at,1,10)=?
            GROUP BY COALESCE(shopify_order_id, id)
          )
        `).bind(storeId, getAmsterdamDate(-1)).first(),

        // Today's ad spend
        env.DB.prepare(`
          SELECT COALESCE(SUM(spend),0) as spend
          FROM google_ads_daily WHERE store_id=? AND date=? AND (country='' OR country IS NULL)
        `).bind(storeId, getAmsterdamDate(0)).first(),
      ]);

      // Merge items into orders
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemMap = new Map<string, any[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (itemsResult.results ?? []) as any[]) {
        if (!itemMap.has(item.order_id)) itemMap.set(item.order_id, []);
        itemMap.get(item.order_id)!.push(item);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orders = ((ordersResult.results ?? []) as any[]).map(o => ({
        ...o,
        items: itemMap.get(o.id) ?? [],
      }));

      const todayAdSpend = (adsToday?.spend as number) ?? 0;
      const todayRevenue = (todayResult?.revenue as number) ?? 0;
      const todayOrders  = (todayResult?.orders as number) ?? 0;
      const yestRevenue  = (yesterdayResult?.revenue as number) ?? 0;
      const yestOrders   = (yesterdayResult?.orders as number) ?? 0;

      return json({
        orders,
        today: {
          orders: todayOrders,
          revenue: todayRevenue,
          adSpend: todayAdSpend,
          roas: todayAdSpend > 0 ? Math.round((todayRevenue / todayAdSpend) * 100) / 100 : null,
        },
        yesterday: { orders: yestOrders, revenue: yestRevenue },
      });
    }

    // ── GET /api/products/stats ───────────────────────────────────────────────
    if (path === "/api/products/stats" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      // Previous period — same duration, ending the day before `start`
      const startMs   = new Date(start + "T12:00:00Z").getTime();
      const durMs     = new Date(end   + "T12:00:00Z").getTime() - startMs;
      const prevEnd   = new Date(startMs - 86_400_000).toISOString().slice(0, 10);
      const prevStart = new Date(startMs - 86_400_000 - durMs).toISOString().slice(0, 10);

      const dedupeWhere = `AND NOT EXISTS (
            SELECT 1 FROM orders o2
            WHERE o2.shopify_order_id = o.shopify_order_id
              AND o2.store_id = o.store_id
              AND o2.rowid < o.rowid
              AND o.shopify_order_id IS NOT NULL
              AND o.shopify_order_id != ''
          )`;

      const [orderStats, returnStats, adStats, costData, prevOrderStats, prevAdStats] = await Promise.all([
        env.DB.prepare(`
          SELECT oi.product_title, SUM(oi.quantity) as sold, SUM(oi.revenue) as revenue
          FROM order_items oi JOIN orders o ON oi.order_id = o.id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
          ${dedupeWhere}
          GROUP BY oi.product_title ORDER BY revenue DESC
        `).bind(storeId, start, end).all(),

        env.DB.prepare(`
          SELECT product_title, COUNT(*) as return_count, COALESCE(SUM(amount),0) as return_amount
          FROM returns
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY product_title
        `).bind(storeId, start, end).all(),

        env.DB.prepare(`
          SELECT product_title,
                 COALESCE(SUM(spend),0)       as ad_spend,
                 COALESCE(SUM(clicks),0)      as ad_clicks,
                 COALESCE(SUM(impressions),0) as ad_impressions
          FROM google_ads_products
          WHERE store_id=? AND date>=? AND date<=?
          GROUP BY product_title
        `).bind(storeId, start, end).all(),

        env.DB.prepare(`
          SELECT product_title, cost, updated_at FROM product_costs WHERE store_id=?
        `).bind(storeId).all(),

        // Previous period orders (for WoW trend)
        env.DB.prepare(`
          SELECT oi.product_title, SUM(oi.quantity) as sold, SUM(oi.revenue) as revenue
          FROM order_items oi JOIN orders o ON oi.order_id = o.id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
          ${dedupeWhere}
          GROUP BY oi.product_title
        `).bind(storeId, prevStart, prevEnd).all(),

        // Previous period ad spend (for ROAS trend)
        env.DB.prepare(`
          SELECT product_title, COALESCE(SUM(spend),0) as ad_spend
          FROM google_ads_products
          WHERE store_id=? AND date>=? AND date<=?
          GROUP BY product_title
        `).bind(storeId, prevStart, prevEnd).all(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const returnsMap = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (returnStats.results ?? []) as any[]) returnsMap.set(r.product_title, r);

      // Build aggregated ad map + fuzzy prefix lookup (Google Ads adds variant/brand to titles)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function buildAgg(rows: any[]): Map<string, any> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = new Map<string, any>();
        for (const r of rows) {
          const ex = m.get(r.product_title);
          if (ex) {
            ex.ad_spend       += r.ad_spend       ?? 0;
            ex.ad_clicks      += r.ad_clicks      ?? 0;
            ex.ad_impressions += r.ad_impressions ?? 0;
          } else {
            m.set(r.product_title, { ad_spend: r.ad_spend ?? 0, ad_clicks: r.ad_clicks ?? 0, ad_impressions: r.ad_impressions ?? 0 });
          }
        }
        return m;
      }

      // Track which adsAgg keys are claimed by an order product (for finding ad-only products)
      const claimedAdTitles = new Set<string>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function fuzzyFind(agg: Map<string, any>, title: string, claimed?: Set<string>): any {
        if (agg.has(title)) {
          claimed?.add(title);
          return agg.get(title);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hits: any[] = [];
        for (const [k, v] of agg) {
          if (k.startsWith(title) || title.startsWith(k)) {
            hits.push(v);
            claimed?.add(k);
          }
        }
        if (!hits.length) return { ad_spend: 0, ad_clicks: 0, ad_impressions: 0 };
        return hits.reduce((a, c) => ({
          ad_spend:       a.ad_spend       + c.ad_spend,
          ad_clicks:      a.ad_clicks      + c.ad_clicks,
          ad_impressions: a.ad_impressions + c.ad_impressions,
        }), { ad_spend: 0, ad_clicks: 0, ad_impressions: 0 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adsAgg     = buildAgg((adStats.results     ?? []) as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevAdsAgg = buildAgg((prevAdStats.results ?? []) as any[]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const costsMap = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (costData.results ?? []) as any[]) costsMap.set(r.product_title, r);

      const prevOrderMap = new Map<string, { sold: number; revenue: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (prevOrderStats.results ?? []) as any[])
        prevOrderMap.set(r.product_title, { sold: r.sold ?? 0, revenue: r.revenue ?? 0 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products = ((orderStats.results ?? []) as any[]).map(p => {
        const ret       = returnsMap.get(p.product_title) ?? { return_count: 0, return_amount: 0 };
        const ads       = fuzzyFind(adsAgg, p.product_title, claimedAdTitles);
        const prevAds   = fuzzyFind(prevAdsAgg, p.product_title);
        const costEntry = costsMap.get(p.product_title) ?? { cost: 0, updated_at: null };
        const prevOrder = prevOrderMap.get(p.product_title) ?? { sold: 0, revenue: 0 };

        const netRevenue  = Math.max(0, (p.revenue ?? 0) - (ret.return_amount ?? 0));
        const totalCost   = (costEntry.cost ?? 0) * (p.sold ?? 0);
        const grossMargin = netRevenue > 0 && costEntry.cost > 0
          ? ((netRevenue - totalCost) / netRevenue) * 100 : null;
        const profit      = costEntry.cost > 0 ? netRevenue - totalCost - (ads.ad_spend ?? 0) : null;
        const roas        = (ads.ad_spend ?? 0) > 0 ? Math.round((netRevenue / ads.ad_spend) * 100) / 100 : null;
        const returnRate  = (p.sold ?? 0) > 0 ? ((ret.return_count ?? 0) / p.sold) * 100 : 0;
        const prevRoas    = (prevAds.ad_spend ?? 0) > 0
          ? Math.round(((prevOrder.revenue ?? 0) / prevAds.ad_spend) * 100) / 100 : null;

        return {
          product_title:   p.product_title,
          sold:            p.sold ?? 0,
          revenue:         Math.round((p.revenue ?? 0) * 100) / 100,
          net_revenue:     Math.round(netRevenue * 100) / 100,
          cost:            costEntry.cost ?? 0,
          cost_updated_at: costEntry.updated_at,
          total_cost:      Math.round(totalCost * 100) / 100,
          gross_margin:    grossMargin !== null ? Math.round(grossMargin * 10) / 10 : null,
          profit:          profit !== null ? Math.round(profit * 100) / 100 : null,
          return_count:    ret.return_count ?? 0,
          return_amount:   Math.round((ret.return_amount ?? 0) * 100) / 100,
          return_rate:     Math.round(returnRate * 10) / 10,
          ad_spend:        Math.round((ads.ad_spend ?? 0) * 100) / 100,
          ad_clicks:       ads.ad_clicks ?? 0,
          ad_impressions:  ads.ad_impressions ?? 0,
          roas,
          revenue_prev:    Math.round((prevOrder.revenue ?? 0) * 100) / 100,
          sold_prev:       prevOrder.sold ?? 0,
          roas_prev:       prevRoas,
        };
      });

      // Add products that only appear in Google Ads (0 orders) — these are "Burning" budget
      for (const [adTitle, adData] of adsAgg.entries()) {
        if (claimedAdTitles.has(adTitle)) continue;
        if ((adData.ad_spend ?? 0) <= 0) continue;
        const costEntry = costsMap.get(adTitle) ?? { cost: 0, updated_at: null };
        products.push({
          product_title:   adTitle,
          sold:            0,
          revenue:         0,
          net_revenue:     0,
          cost:            costEntry.cost ?? 0,
          cost_updated_at: costEntry.updated_at,
          total_cost:      0,
          gross_margin:    null,
          profit:          null,
          return_count:    0,
          return_amount:   0,
          return_rate:     0,
          ad_spend:        Math.round((adData.ad_spend ?? 0) * 100) / 100,
          ad_clicks:       adData.ad_clicks ?? 0,
          ad_impressions:  adData.ad_impressions ?? 0,
          roas:            null,
          revenue_prev:    0,
          sold_prev:       0,
          roas_prev:       null,
        });
      }

      return json({ products });
    }

    // ── GET /api/ads/products ─────────────────────────────────────────────────
    if (path === "/api/ads/products" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const [adsRows, orderRows] = await Promise.all([
        env.DB.prepare(`
          SELECT product_title,
                 COALESCE(SUM(spend),0) as spend,
                 COALESCE(SUM(clicks),0) as clicks,
                 COALESCE(SUM(impressions),0) as impressions,
                 COALESCE(SUM(conversions),0) as conversions,
                 CASE WHEN SUM(clicks)>0 THEN SUM(spend)/SUM(clicks) ELSE 0 END as cpc,
                 CASE WHEN SUM(impressions)>0 THEN CAST(SUM(clicks) AS REAL)/SUM(impressions)*100 ELSE 0 END as ctr
          FROM google_ads_products
          WHERE store_id=? AND date>=? AND date<=?
          GROUP BY product_title
          ORDER BY spend DESC
        `).bind(storeId, start, end).all(),

        env.DB.prepare(`
          SELECT oi.product_title,
                 COALESCE(SUM(oi.quantity), 0) as orders,
                 COALESCE(SUM(oi.revenue), 0) as revenue
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.store_id=? AND substr(o.created_at,1,10)>=? AND substr(o.created_at,1,10)<=?
          GROUP BY oi.product_title
        `).bind(storeId, start, end).all(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderMap = new Map<string, { orders: number; revenue: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (orderRows.results as any[]) ?? []) {
        orderMap.set(r.product_title, { orders: r.orders, revenue: r.revenue });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products = ((adsRows.results as any[]) ?? []).map(r => {
        const od = orderMap.get(r.product_title) ?? { orders: 0, revenue: 0 };
        return {
          ...r,
          orders: od.orders,
          revenue: Math.round(od.revenue * 100) / 100,
          roas: r.spend > 0 ? Math.round((od.revenue / r.spend) * 100) / 100 : 0,
        };
      });

      return json({ products });
    }

    // ── POST /api/ads/products/import ─────────────────────────────────────────
    if (path === "/api/ads/products/import" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const rows = (body.rows ?? []) as Array<{
        store_id: string; date: string; product_title: string;
        spend: number; clicks: number; impressions: number;
        conversions: number; cpc: number; ctr: number;
      }>;
      const CHUNK = 100;
      let count = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const stmts = chunk.map(row => {
          const id = `${row.store_id}-${row.date}-${row.product_title.slice(0, 40)}`;
          return env.DB.prepare(`
            INSERT OR REPLACE INTO google_ads_products
              (id,store_id,date,product_title,spend,clicks,impressions,conversions,cpc,ctr)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `).bind(id, row.store_id, row.date, row.product_title,
                  row.spend, row.clicks, row.impressions, row.conversions, row.cpc, row.ctr);
        });
        await env.DB.batch(stmts);
        count += chunk.length;
      }
      return json({ ok: true, imported: count });
    }

    // ── POST /api/webhooks/shopify/orders-cancelled ──────────────────────────
    if (path === "/api/webhooks/shopify/orders-cancelled" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ ok: true });
      const orderId = String(body.id ?? "");
      if (orderId) {
        await env.DB.prepare(
          `UPDATE orders SET financial_status='cancelled' WHERE shopify_order_id=? AND store_id=?`
        ).bind(orderId, storeId).run();
      }
      return json({ ok: true });
    }

    // ── POST /api/webhooks/shopify/orders-updated ────────────────────────────
    // Re-syncs revenue + line_items on every order update (catches AfterSell upsells)
    if (path === "/api/webhooks/shopify/orders-updated" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ ok: true });
      const orderId = String(body.id ?? "");
      if (!orderId) return json({ ok: true });

      const cancelled = body.cancelled_at || body.financial_status === "voided" || body.financial_status === "refunded";

      if (cancelled) {
        await env.DB.prepare(
          `UPDATE orders SET financial_status='cancelled' WHERE shopify_order_id=? AND store_id=?`
        ).bind(orderId, storeId).run();
        return json({ ok: true });
      }

      // Re-sync revenue so AfterSell upsells (added as extra line_items) are counted
      const revenue = parseFloat(body.current_total_price ?? body.total_price ?? "0");
      const netRevenue = parseFloat(body.subtotal_price ?? String(revenue));
      const firstFulfillment = (body.fulfillments ?? [])[0];
      const trackingNumber = firstFulfillment?.tracking_number ?? "";
      const trackingUrl    = firstFulfillment?.tracking_url ?? "";

      await env.DB.prepare(`
        UPDATE orders
        SET revenue=?, net_revenue=?,
            financial_status=?, fulfillment_status=?,
            tracking_number=CASE WHEN ?='' THEN tracking_number ELSE ? END,
            tracking_url=CASE WHEN ?='' THEN tracking_url ELSE ? END
        WHERE shopify_order_id=? AND store_id=?
      `).bind(
        revenue, netRevenue,
        body.financial_status ?? "paid", body.fulfillment_status ?? "unfulfilled",
        trackingNumber, trackingNumber,
        trackingUrl, trackingUrl,
        orderId, storeId
      ).run();

      // Upsert all current line_items (AfterSell adds new ones after order creation)
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

      return json({ ok: true });
    }

    // ── POST /api/webhooks/shopify/fulfillments-create ───────────────────────
    if (path === "/api/webhooks/shopify/fulfillments-create" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ ok: true });
      const orderId = String(body.order_id ?? "");
      const trackingNumber = body.tracking_number ?? "";
      const trackingUrl    = body.tracking_url ?? "";
      if (orderId) {
        await env.DB.prepare(
          `UPDATE orders SET fulfillment_status='fulfilled', tracking_number=?, tracking_url=? WHERE shopify_order_id=? AND store_id=?`
        ).bind(trackingNumber, trackingUrl, orderId, storeId).run();
      }
      return json({ ok: true });
    }

    // ── POST /api/shopify/order-action ───────────────────────────────────────
    // Actions: cancel, refund (full), mark_shipped
    if (path === "/api/shopify/order-action" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const { store_id, shopify_order_id, action } = body as { store_id: string; shopify_order_id: string; action: string };
      if (!store_id || !shopify_order_id || !action) return json({ error: "Missing fields" }, 400);

      const store = await env.DB.prepare(`SELECT shopify_domain, shopify_access_token FROM stores WHERE id=?`).bind(store_id).first() as { shopify_domain: string; shopify_access_token: string } | null;
      if (!store?.shopify_domain || !store?.shopify_access_token) return json({ error: "Store not configured with Shopify credentials" }, 400);

      const shopifyBase = `https://${store.shopify_domain}/admin/api/2024-01`;
      const headers = { "X-Shopify-Access-Token": store.shopify_access_token, "Content-Type": "application/json" };

      if (action === "cancel") {
        const r = await fetch(`${shopifyBase}/orders/${shopify_order_id}/cancel.json`, { method: "POST", headers, body: JSON.stringify({ reason: "customer" }) });
        const d = await r.json() as Record<string, unknown>;
        if (d.order) await env.DB.prepare(`UPDATE orders SET financial_status='cancelled' WHERE shopify_order_id=? AND store_id=?`).bind(shopify_order_id, store_id).run();
        return json({ ok: r.ok });
      }

      if (action === "refund") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { refund_type, amount: partialAmount } = body as any;
        const isPartial = refund_type === "partial" && partialAmount > 0;

        const orderRes = await fetch(`${shopifyBase}/orders/${shopify_order_id}.json`, { headers });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orderData = await orderRes.json() as any;
        const order = orderData.order;
        if (!order) return json({ error: "Order not found in Shopify" }, 404);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let refundBody: any;

        if (isPartial) {
          // Partial refund via transaction — find the original payment transaction
          const txRes = await fetch(`${shopifyBase}/orders/${shopify_order_id}/transactions.json`, { headers });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txData = await txRes.json() as any;
          const transactions: any[] = txData.transactions ?? [];
          const parentTx = transactions.find((t: any) => t.kind === "sale" || t.kind === "capture");
          if (!parentTx) return json({ error: "No payment transaction found for this order" }, 400);
          refundBody = {
            refund: {
              currency: order.currency,
              note: `Partial refund of ${order.currency} ${(partialAmount as number).toFixed(2)} via Sentinel`,
              transactions: [{ parent_id: parentTx.id, amount: (partialAmount as number).toFixed(2), kind: "refund", gateway: parentTx.gateway }],
            },
          };
        } else {
          // Full refund — refund all line items + shipping
          const refundLineItems = (order.line_items ?? []).map((li: { id: number; quantity: number }) => ({
            line_item_id: li.id, quantity: li.quantity, restock_type: "return",
          }));
          refundBody = { refund: { note: "Full refund via Sentinel", refund_line_items: refundLineItems, shipping: { full_refund: true } } };
        }

        const r = await fetch(`${shopifyBase}/orders/${shopify_order_id}/refunds.json`, {
          method: "POST", headers, body: JSON.stringify(refundBody),
        });
        if (r.ok) {
          const newStatus = isPartial ? "partially_refunded" : "refunded";
          await env.DB.prepare(`UPDATE orders SET financial_status=? WHERE shopify_order_id=? AND store_id=?`).bind(newStatus, shopify_order_id, store_id).run();
        }
        return json({ ok: r.ok });
      }

      return json({ error: "Unknown action" }, 400);
    }

    // ── GET /api/cs/tickets ───────────────────────────────────────────────────
    if (path === "/api/cs/tickets" && method === "GET") {
      const storeId  = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const status   = url.searchParams.get("status");
      const category = url.searchParams.get("category");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any[] = [];
      let sql = `SELECT * FROM cs_tickets`;
      if (storeId !== "all") { sql += ` WHERE store_id=?`; params.push(storeId); }
      else { sql += ` WHERE 1=1`; }
      if (status)   { sql += ` AND status=?`;   params.push(status); }
      if (category) { sql += ` AND category=?`; params.push(category); }
      sql += ` ORDER BY created_at DESC LIMIT 500`;

      const result = await env.DB.prepare(sql).bind(...params).all();
      return json({ tickets: result.results ?? [] });
    }

    // ── POST /api/cs/tickets ──────────────────────────────────────────────────
    if (path === "/api/cs/tickets" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      if (!body.store_id || !body.category) return json({ error: "Missing fields" }, 400);
      const id  = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO cs_tickets
          (id,store_id,order_number,customer_email,category,priority,status,
           subject,description,product_title,resolution,tags,source,thread_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(id, body.store_id, body.order_number ?? "", body.customer_email ?? "",
              body.category, body.priority ?? "medium", "open",
              body.subject ?? "", body.description ?? "",
              body.product_title ?? "", "",
              JSON.stringify(body.tags ?? []),
              body.source ?? "manual", body.thread_id ?? "", now, now).run();
      return json({ ok: true, id });
    }

    // ── PUT /api/cs/tickets/:id ───────────────────────────────────────────────
    if (path.startsWith("/api/cs/tickets/") && method === "PUT") {
      const id   = path.split("/").pop()!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const now  = new Date().toISOString();
      const resolvedAt = body.status === "resolved" ? now : null;
      await env.DB.prepare(`
        UPDATE cs_tickets SET
          status=COALESCE(?,status), priority=COALESCE(?,priority),
          resolution=COALESCE(?,resolution), tags=COALESCE(?,tags),
          updated_at=?, resolved_at=COALESCE(resolved_at, ?)
        WHERE id=?
      `).bind(body.status ?? null, body.priority ?? null,
              body.resolution ?? null,
              body.tags !== undefined ? JSON.stringify(body.tags) : null,
              now, resolvedAt, id).run();
      return json({ ok: true });
    }

    // ── DELETE /api/cs/tickets/:id ────────────────────────────────────────────
    if (path.startsWith("/api/cs/tickets/") && method === "DELETE") {
      const id = path.split("/").pop()!;
      await env.DB.prepare(`DELETE FROM cs_tickets WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── GET /api/cs/stats ─────────────────────────────────────────────────────
    if (path === "/api/cs/stats" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);

      const [byCategory, byProduct, byDay, summary] = await Promise.all([
        // Breakdown by category
        env.DB.prepare(`
          SELECT category, COUNT(*) as count,
                 SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved
          FROM cs_tickets
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY category ORDER BY count DESC
        `).bind(storeId, start, end).all(),

        // Most complained-about products
        env.DB.prepare(`
          SELECT product_title, COUNT(*) as count,
                 category,
                 SUM(CASE WHEN priority IN ('high','urgent') THEN 1 ELSE 0 END) as high_priority
          FROM cs_tickets
          WHERE store_id=? AND product_title != ''
            AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY product_title ORDER BY count DESC LIMIT 10
        `).bind(storeId, start, end).all(),

        // Daily ticket volume (trend)
        env.DB.prepare(`
          SELECT substr(created_at,1,10) as day, COUNT(*) as count,
                 SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved
          FROM cs_tickets
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
          GROUP BY day ORDER BY day ASC
        `).bind(storeId, start, end).all(),

        // Overall summary
        env.DB.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
            SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved_count,
            SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END) as urgent_count,
            SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) as high_count,
            AVG(
              CASE WHEN resolved_at IS NOT NULL AND resolved_at != ''
              THEN (julianday(resolved_at) - julianday(created_at)) * 24
              ELSE NULL END
            ) as avg_resolution_hours
          FROM cs_tickets
          WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
        `).bind(storeId, start, end).first(),
      ]);

      return json({
        byCategory: byCategory.results ?? [],
        byProduct:  byProduct.results ?? [],
        byDay:      byDay.results ?? [],
        summary,
      });
    }

    // ── GET /api/insights/products ───────────────────────────────────────────
    if (path === "/api/insights/products" && method === "GET") {
      const storeId = url.searchParams.get("store_id") || "martaline";

      const [salesRows, costsRows, returnsRows, adsRows] = await Promise.all([
        env.DB.prepare(`
          SELECT oi.product_title, SUM(oi.quantity) as sold, SUM(oi.revenue) as revenue
          FROM order_items oi JOIN orders o ON oi.order_id = o.id
          WHERE o.store_id=?
            AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.shopify_order_id=o.shopify_order_id AND o2.store_id=o.store_id AND o2.rowid<o.rowid AND o.shopify_order_id IS NOT NULL AND o.shopify_order_id!='')
            AND NOT EXISTS (
              SELECT 1 FROM shopify_products sp
              WHERE sp.store_id=o.store_id AND LOWER(sp.title)=LOWER(oi.product_title)
                AND sp.status != 'active'
            )
          GROUP BY oi.product_title ORDER BY revenue DESC
        `).bind(storeId).all(),
        env.DB.prepare(`SELECT product_title, cost FROM product_costs WHERE store_id=?`).bind(storeId).all(),
        env.DB.prepare(`
          SELECT product_title, COUNT(*) as return_count, SUM(amount) as return_amount
          FROM returns WHERE store_id=? GROUP BY product_title
        `).bind(storeId).all(),
        env.DB.prepare(`
          SELECT product_title, SUM(spend) as ad_spend FROM google_ads_products
          WHERE store_id=? GROUP BY product_title
        `).bind(storeId).all(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const costMap   = new Map((costsRows.results   ?? []) as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const returnMap = new Map(((returnsRows.results ?? []) as any[]).map((r: any) => [r.product_title, r]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adsMap    = new Map(((adsRows.results    ?? []) as any[]).map((r: any) => [r.product_title, r.ad_spend as number]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insights = ((salesRows.results ?? []) as any[]).map((p: any) => {
        const cost       = (costMap.get(p.product_title) as { cost?: number })?.cost ?? 0;
        const totalCost  = cost * (p.sold as number);
        const adSpend    = adsMap.get(p.product_title) ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retData    = returnMap.get(p.product_title) as any;
        const returnAmt  = retData?.return_amount ?? 0;
        const netRev     = Math.max(0, (p.revenue as number) - returnAmt);
        const profit     = netRev - totalCost - adSpend;
        const margin     = netRev > 0 ? Math.round((profit / netRev) * 100) : 0;
        const roas       = adSpend > 0 ? netRev / adSpend : null;

        let label = "MONITOR"; let severity = "info"; let recommendation = "";
        if (adSpend > 20 && (roas === null || roas < 1)) {
          label = "KILL"; severity = "critical";
          recommendation = `Spending €${adSpend.toFixed(0)} with ROAS ${roas ? roas.toFixed(2) + "x" : "n/a"} — pause this product immediately to stop bleeding budget.`;
        } else if (roas !== null && roas >= 3 && margin >= 20) {
          label = "SCALE"; severity = "success";
          recommendation = `ROAS ${roas.toFixed(2)}x with ${margin}% margin — strong performer. Increase ad budget 20-30% and test higher bids.`;
        } else if (margin > 0 && margin < 15 && p.sold >= 5) {
          label = "FIX MARGIN"; severity = "warning";
          recommendation = `Margin is only ${margin}% — negotiate with supplier or raise price by €${Math.ceil(netRev * 0.1 / (p.sold as number))} per unit to reach 25%.`;
        } else if (cost === 0 && p.sold >= 3) {
          label = "SET COST"; severity = "warning";
          recommendation = "No cost entered for this product — go to Product Insights and set your COGS to get accurate margin calculations.";
        } else if (roas !== null && roas >= 2 && roas < 3) {
          label = "OPTIMIZE"; severity = "info";
          recommendation = `ROAS ${roas.toFixed(2)}x — decent but room to improve. Try optimising ad creatives or testing a higher price point.`;
        } else if (p.sold === 0) {
          label = "DEAD"; severity = "critical";
          recommendation = "Zero sales — consider removing from your feed or testing a new creative before cutting it entirely.";
        } else {
          label = "MONITOR"; severity = "info";
          recommendation = `${p.sold} units sold at ${margin}% margin. Keep monitoring — needs more data before making a scaling decision.`;
        }

        return {
          product_title: p.product_title, sold: p.sold, revenue: p.revenue,
          net_revenue: netRev, unit_cost: cost, total_cost: totalCost,
          ad_spend: adSpend, profit, margin, roas, return_amount: returnAmt,
          label, severity, recommendation,
        };
      });

      return json({ insights });
    }

    // ── POST /api/ai/chat ─────────────────────────────────────────────────────
    if (path === "/api/ai/chat" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const message  = String(body.message ?? "").toLowerCase();
      const storeId  = String(body.store_id ?? "martaline");
      const today    = getAmsterdamDate(0);
      const month    = today.slice(0, 7) + "-01";

      // Load context
      const [todayRow, topProducts, killSignals, milestones, adsRow] = await Promise.all([
        env.DB.prepare(`
          SELECT COUNT(*) as orders, COALESCE(SUM(revenue),0) as revenue FROM (
            SELECT MAX(revenue) as revenue FROM orders WHERE store_id=? AND substr(created_at,1,10)=?
            GROUP BY COALESCE(shopify_order_id, id))
        `).bind(storeId, today).first(),
        env.DB.prepare(`
          SELECT oi.product_title, SUM(oi.quantity) as sold, SUM(oi.revenue) as revenue
          FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.store_id=? AND substr(o.created_at,1,10)>=?
            AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.shopify_order_id=o.shopify_order_id AND o2.store_id=o.store_id AND o2.rowid<o.rowid AND o.shopify_order_id IS NOT NULL AND o.shopify_order_id!='')
          GROUP BY oi.product_title ORDER BY revenue DESC LIMIT 5
        `).bind(storeId, month).all(),
        env.DB.prepare(`
          SELECT gap.product_title, SUM(gap.spend) as spend
          FROM google_ads_products gap
          WHERE gap.store_id=? AND gap.date>=?
          GROUP BY gap.product_title HAVING SUM(gap.spend)>8 AND NOT EXISTS (
            SELECT 1 FROM order_items oi JOIN orders o ON oi.order_id=o.id
            WHERE o.store_id=gap.store_id AND oi.product_title=gap.product_title AND substr(o.created_at,1,10)>=?
          ) LIMIT 5
        `).bind(storeId, month, month).all(),
        env.DB.prepare(`
          SELECT product_title, milestone FROM product_milestones WHERE store_id=? AND notified=0 ORDER BY milestone DESC LIMIT 3
        `).bind(storeId).all(),
        env.DB.prepare(`
          SELECT COALESCE(SUM(spend),0) as spend FROM google_ads_daily WHERE store_id=? AND date=? AND (country='' OR country IS NULL)
        `).bind(storeId, today).first(),
      ]);

      const todayOrders  = (todayRow?.orders  as number) ?? 0;
      const todayRev     = (todayRow?.revenue as number) ?? 0;
      const todaySpend   = (adsRow?.spend     as number) ?? 0;
      const todayRoas    = todaySpend > 0 ? (todayRev / todaySpend).toFixed(2) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tops  = (topProducts.results ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kills = (killSignals.results  ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const miles = (milestones.results   ?? []) as any[];

      let reply = "";

      // Pattern match questions
      const isAbout = (...terms: string[]) => terms.some(t => message.includes(t));

      if (isAbout("today", "vandaag", "now", "nu")) {
        reply = `**Today's performance (${storeId})** 📊\n\n`;
        reply += `• Orders: **${todayOrders}**\n`;
        reply += `• Revenue: **€${todayRev.toFixed(2)}**\n`;
        reply += todaySpend > 0 ? `• Ad spend: **€${todaySpend.toFixed(2)}** → ROAS **${todayRoas}x**\n` : `• Ad spend: not yet synced\n`;
        if (todayOrders === 0) reply += `\n⚠️ No orders yet today — check if your campaigns are running.`;

      } else if (isAbout("kill", "stop", "pause", "pauzeer")) {
        if (kills.length === 0) {
          reply = `✅ No kill signals right now! All products with meaningful spend have orders.`;
        } else {
          reply = `🔴 **Kill signals — pause these now:**\n\n`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          kills.forEach((k: any) => {
            reply += `• **${k.product_title}** — €${(k.spend as number).toFixed(0)} spent with 0 orders this month\n`;
          });
          reply += `\nAction: Go to Google Ads and pause these product groups immediately to stop wasting budget.`;
        }

      } else if (isAbout("scale", "schaal", "best", "top", "winner")) {
        if (tops.length === 0) {
          reply = `No top products found for this month yet. Come back when there's more sales data.`;
        } else {
          reply = `🚀 **Your top products this month:**\n\n`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tops.slice(0, 5).forEach((p: any, i: number) => {
            reply += `${i + 1}. **${p.product_title}** — ${p.sold} sold · €${(p.revenue as number).toFixed(2)}\n`;
          });
          reply += `\nThese are your proven winners — prioritise them in your Shopping feed and consider increasing bids by 15-20%.`;
        }

      } else if (isAbout("milestone", "sales", "verkopen", "reached")) {
        if (miles.length === 0) {
          reply = `No new milestones reached yet. Keep pushing — check the Milestones page to see upcoming ones.`;
        } else {
          reply = `🏆 **New milestones reached:**\n\n`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          miles.forEach((m: any) => {
            const actions: Record<number, string> = {
              5:  "Check COG and margins",
              20: "Contact supplier for better pricing",
              40: "Renegotiate pricing with supplier",
            };
            reply += `• **${m.product_title}** reached **${m.milestone} sales** → ${actions[m.milestone as number] ?? "great job!"}\n`;
          });
        }

      } else if (isAbout("roas", "return on ad", "advertentie")) {
        reply = todayRoas
          ? `Today's ROAS is **${todayRoas}x** (€${todayRev.toFixed(2)} revenue / €${todaySpend.toFixed(2)} ad spend).\n\n`
          : `No ad spend data synced for today yet.\n\n`;
        reply += tops.length > 0
          ? `This month's top products: ${tops.slice(0,3).map((p: { product_title: string }) => p.product_title.split(" ").slice(0,4).join(" ")).join(", ")}.`
          : "";

      } else if (isAbout("margin", "profit", "winst", "marge")) {
        reply = `To see full margin and profit data, go to **Product Insights** — you can set your cost per product there and see net margin after returns and ad spend.\n\nTip: any product below 20% margin should be flagged for supplier renegotiation.`;

      } else if (isAbout("supplier", "leverancier", "cost", "inkoop")) {
        const milestones20 = miles.filter((m: { milestone: number }) => m.milestone >= 20);
        if (milestones20.length > 0) {
          reply = `💡 **Supplier negotiation opportunities:**\n\n`;
          milestones20.forEach((m: { product_title: string; milestone: number }) => {
            reply += `• **${m.product_title}** — ${m.milestone}+ sales, time to negotiate better pricing!\n`;
          });
        } else {
          reply = `No products have hit 20+ sales yet. Once they do, Sentinel will flag them automatically in the Milestones page.`;
        }

      } else if (isAbout("help", "what can", "wat kan", "commands", "options")) {
        reply = `**Sentinel AI — I can answer:**\n\n`;
        reply += `• "How is today going?" — today's orders, revenue & ROAS\n`;
        reply += `• "Which products should I kill?" — zero-sale ad wasters\n`;
        reply += `• "What are my best products?" — top performers this month\n`;
        reply += `• "What milestones did I reach?" — 5/20/40 sales alerts\n`;
        reply += `• "What's my ROAS today?" — ad performance\n`;
        reply += `• "Which suppliers should I contact?" — negotiation targets\n`;
        reply += `• "How do I improve my margin?" — margin advice\n`;

      } else {
        reply = `I understand you're asking about: "*${body.message}*"\n\n`;
        reply += `Here's a quick store snapshot for ${storeId}:\n`;
        reply += `• Today: **${todayOrders}** orders · **€${todayRev.toFixed(2)}** revenue\n`;
        if (todayRoas) reply += `• ROAS today: **${todayRoas}x**\n`;
        if (kills.length > 0) reply += `• ⚠️ ${kills.length} kill signal${kills.length > 1 ? "s" : ""} — products wasting budget\n`;
        if (tops.length > 0) reply += `• 🏆 Top product: ${tops[0].product_title.split(" ").slice(0, 5).join(" ")}\n`;
        reply += `\nType "help" to see all questions I can answer.`;
      }

      return json({ ok: true, reply });
    }

    // ── GET /api/overhead ─────────────────────────────────────────────────────
    if (path === "/api/overhead" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const rows = await env.DB.prepare(
        `SELECT * FROM overhead_costs WHERE store_id=? ORDER BY category, name`
      ).bind(storeId).all();
      return json({ costs: rows.results ?? [] });
    }

    // ── POST /api/overhead ────────────────────────────────────────────────────
    if (path === "/api/overhead" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const id  = `oh-${uid()}`;
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO overhead_costs (id,store_id,name,category,amount,recurring,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,?,?)
      `).bind(id, body.store_id, body.name, body.category ?? "other",
              parseFloat(body.amount) || 0, body.recurring ?? "monthly", now, now).run();
      return json({ ok: true, id });
    }

    // ── PUT /api/overhead/:id ─────────────────────────────────────────────────
    if (path.startsWith("/api/overhead/") && method === "PUT") {
      const id = path.slice("/api/overhead/".length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      await env.DB.prepare(`
        UPDATE overhead_costs SET name=?,category=?,amount=?,recurring=?,active=?,updated_at=? WHERE id=?
      `).bind(body.name, body.category ?? "other", parseFloat(body.amount) || 0,
              body.recurring ?? "monthly", body.active ?? 1, new Date().toISOString(), id).run();
      return json({ ok: true });
    }

    // ── DELETE /api/overhead/:id ──────────────────────────────────────────────
    if (path.startsWith("/api/overhead/") && method === "DELETE") {
      const id = path.slice("/api/overhead/".length);
      await env.DB.prepare(`DELETE FROM overhead_costs WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── GET /api/pnl ──────────────────────────────────────────────────────────
    if (path === "/api/pnl" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const year = url.searchParams.get("year") ?? new Date().getFullYear().toString();

      const [revenueRows, returnsRows, adsRows, costsRows, overheadRows] = await Promise.all([
        env.DB.prepare(`
          SELECT month, COUNT(*) as orders, SUM(revenue) as gross_revenue FROM (
            SELECT substr(created_at,1,7) as month, MAX(revenue) as revenue
            FROM orders WHERE store_id=? AND substr(created_at,1,4)=?
            GROUP BY COALESCE(shopify_order_id, id)
          ) GROUP BY month
        `).bind(storeId, year).all(),

        env.DB.prepare(`
          SELECT substr(created_at,1,7) as month, SUM(amount) as return_amount
          FROM returns WHERE store_id=? AND substr(created_at,1,4)=?
          GROUP BY month
        `).bind(storeId, year).all(),

        env.DB.prepare(`
          SELECT substr(date,1,7) as month, SUM(spend) as ad_spend
          FROM google_ads_daily WHERE store_id=? AND substr(date,1,4)=? AND (country='' OR country IS NULL)
          GROUP BY month
        `).bind(storeId, year).all(),

        env.DB.prepare(`
          SELECT substr(o.created_at,1,7) as month,
                 SUM(oi.quantity * COALESCE(pc.cost, oi.cost, 0)) as product_cost
          FROM order_items oi JOIN orders o ON oi.order_id=o.id
          LEFT JOIN product_costs pc ON pc.product_title=oi.product_title AND pc.store_id=o.store_id
          WHERE o.store_id=? AND substr(o.created_at,1,4)=?
            AND o.revenue > 0
            AND NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.shopify_order_id=o.shopify_order_id AND o2.store_id=o.store_id AND o2.rowid<o.rowid AND o.shopify_order_id IS NOT NULL AND o.shopify_order_id!='')
          GROUP BY month
        `).bind(storeId, year).all(),

        env.DB.prepare(`SELECT * FROM overhead_costs WHERE store_id=? AND active=1`).bind(storeId).all(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toMap = (rows: any[], key: string, val: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new Map((rows as any[]).map((r: any) => [r[key], r[val] as number]));

      const revMap  = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((revenueRows.results ?? []) as any[]).map((r: any) => [r.month, r])
      );
      const retMap  = toMap(returnsRows.results ?? [], "month", "return_amount");
      const adsMap  = toMap(adsRows.results ?? [],     "month", "ad_spend");
      const costMap = toMap(costsRows.results ?? [],   "month", "product_cost");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const overheadList = (overheadRows.results ?? []) as any[];
      const monthlyOverhead = overheadList.reduce((sum: number, c: { amount: number; recurring: string }) => {
        if (c.recurring === "monthly") return sum + c.amount;
        if (c.recurring === "yearly")  return sum + c.amount / 12;
        return sum;
      }, 0);

      const months = Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, "0")}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rev = (revMap.get(m) as any) ?? { orders: 0, gross_revenue: 0 };
        const gross    = rev.gross_revenue as number;
        const returns  = retMap.get(m)  ?? 0;
        const adSpend  = adsMap.get(m)  ?? 0;
        const prodCost = costMap.get(m) ?? 0;
        const net      = Math.max(0, gross - returns);
        const overhead = gross > 0 ? monthlyOverhead : 0;
        const profit   = net - adSpend - prodCost - overhead;
        const margin   = net > 0 ? Math.round((profit / net) * 100) : 0;
        return { month: m, orders: rev.orders as number, gross_revenue: gross, return_amount: returns, net_revenue: net, ad_spend: adSpend, product_cost: prodCost, overhead, profit, margin };
      });

      const totals = months.reduce((acc, m) => ({
        orders: acc.orders + m.orders,
        gross_revenue: acc.gross_revenue + m.gross_revenue,
        return_amount: acc.return_amount + m.return_amount,
        net_revenue: acc.net_revenue + m.net_revenue,
        ad_spend: acc.ad_spend + m.ad_spend,
        product_cost: acc.product_cost + m.product_cost,
        overhead: acc.overhead + m.overhead,
        profit: acc.profit + m.profit,
      }), { orders: 0, gross_revenue: 0, return_amount: 0, net_revenue: 0, ad_spend: 0, product_cost: 0, overhead: 0, profit: 0 });

      return json({ year, months, totals });
    }

    // ── GET /api/customers/stats ──────────────────────────────────────────────
    if (path === "/api/customers/stats" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const [customersRows, repeatRow, todayNewRow] = await Promise.all([
        env.DB.prepare(`
          SELECT email,
                 COUNT(DISTINCT id) as order_count,
                 SUM(revenue) as total_revenue,
                 MIN(created_at) as first_order,
                 MAX(created_at) as last_order
          FROM orders
          WHERE store_id=? AND email != '' AND email IS NOT NULL
          GROUP BY lower(email)
          ORDER BY order_count DESC, total_revenue DESC
          LIMIT 100
        `).bind(storeId).all(),

        env.DB.prepare(`
          SELECT
            COUNT(DISTINCT lower(email)) as total_customers,
            SUM(CASE WHEN cnt > 1 THEN 1 ELSE 0 END) as repeat_customers
          FROM (
            SELECT lower(email) as email, COUNT(DISTINCT id) as cnt
            FROM orders WHERE store_id=? AND email!='' AND email IS NOT NULL
            GROUP BY lower(email)
          )
        `).bind(storeId).first(),

        env.DB.prepare(`
          SELECT COUNT(DISTINCT lower(email)) as new_today
          FROM orders
          WHERE store_id=? AND substr(created_at,1,10)=?
            AND lower(email) NOT IN (
              SELECT lower(email) FROM orders
              WHERE store_id=? AND substr(created_at,1,10)<?
              AND email!='' AND email IS NOT NULL
            )
        `).bind(storeId, getAmsterdamDate(0), storeId, getAmsterdamDate(0)).first(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customers     = (customersRows.results ?? []) as any[];
      const totalCustomers  = (repeatRow?.total_customers  as number) ?? 0;
      const repeatCustomers = (repeatRow?.repeat_customers as number) ?? 0;
      const newToday        = (todayNewRow?.new_today      as number) ?? 0;
      const repeatRate      = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;
      const avgLtv          = totalCustomers > 0
        ? customers.reduce((s: number, c: { total_revenue: number }) => s + c.total_revenue, 0) / totalCustomers
        : 0;

      return json({ customers, totalCustomers, repeatCustomers, repeatRate, newToday, avgLtv });
    }

    // ── GET /api/notifications/settings ──────────────────────────────────────
    if (path === "/api/notifications/settings" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const row = await env.DB.prepare(
        `SELECT * FROM notification_settings WHERE store_id=?`
      ).bind(storeId).first();
      return json(row ?? { store_id: storeId, slack_webhook: "", whatsapp_phone: "", notify_milestones: 1, notify_kill_signals: 1, notify_cs_urgent: 1, notify_daily_digest: 0 });
    }

    // ── POST /api/notifications/settings ─────────────────────────────────────
    if (path === "/api/notifications/settings" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const storeId = body.store_id;
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      await env.DB.prepare(`
        INSERT OR REPLACE INTO notification_settings
          (store_id, slack_webhook, whatsapp_phone, notify_milestones, notify_kill_signals, notify_cs_urgent, notify_daily_digest, updated_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(storeId, body.slack_webhook ?? "", body.whatsapp_phone ?? "",
              body.notify_milestones ?? 1, body.notify_kill_signals ?? 1,
              body.notify_cs_urgent ?? 1, body.notify_daily_digest ?? 0,
              new Date().toISOString()).run();
      return json({ ok: true });
    }

    // ── POST /api/notifications/test ──────────────────────────────────────────
    if (path === "/api/notifications/test" && method === "POST") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await request.json() as any;
      const results: Record<string, string> = {};

      if (body.slack_webhook) {
        try {
          const r = await fetch(body.slack_webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "✅ *Sentinel test* — Slack notifications are working!" }),
          });
          results.slack = r.ok ? "ok" : `error ${r.status}`;
        } catch { results.slack = "error"; }
      }

      if (body.whatsapp_phone) {
        try {
          const phone = body.whatsapp_phone.replace(/\D/g, "");
          const r = await fetch(
            `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent("✅ Sentinel test — WhatsApp notifications are working!")}&apikey=${body.whatsapp_apikey ?? ""}`,
          );
          results.whatsapp = r.ok ? "ok" : `error ${r.status}`;
        } catch { results.whatsapp = "error"; }
      }

      return json({ ok: true, results });
    }

    // ── POST /api/admin/dedup-orders ─────────────────────────────────────────
    // One-time (and safe to re-run) cleanup: removes duplicate orders that share
    // the same shopify_order_id + store_id, keeping only the first-inserted row.
    if (path === "/api/admin/dedup-orders" && method === "POST") {
      const deletedOrders = await env.DB.prepare(`
        DELETE FROM orders
        WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM orders
          GROUP BY
            CASE WHEN shopify_order_id IS NOT NULL AND shopify_order_id != ''
                 THEN shopify_order_id || '|' || store_id
                 ELSE id || '|' || store_id
            END
        )
      `).run();

      // Also remove orphaned order_items left behind by deleted duplicate orders
      const deletedItems = await env.DB.prepare(`
        DELETE FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)
      `).run();

      return json({
        ok: true,
        deletedOrders: deletedOrders.meta?.changes ?? 0,
        deletedItems: deletedItems.meta?.changes ?? 0,
      });
    }

    // ── GET /api/inbox/oauth/gmail-url ──────────────────────────────────────
    if (path === "/api/inbox/oauth/gmail-url" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      if (!env.GMAIL_CLIENT_ID) return json({ error: "GMAIL_CLIENT_ID not configured" }, 503);
      const state = btoa(JSON.stringify({ store_id: storeId }));
      const redirect = "https://sentinel-app.tssheets1.workers.dev/auth/gmail/callback";
      const scope = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" ");
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GMAIL_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
      return json({ url: authUrl });
    }

    // ── GET /api/inbox/oauth/outlook-url ────────────────────────────────────
    if (path === "/api/inbox/oauth/outlook-url" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      if (!env.OUTLOOK_CLIENT_ID) return json({ error: "OUTLOOK_CLIENT_ID not configured" }, 503);
      const state = btoa(JSON.stringify({ store_id: storeId }));
      const redirect = "https://sentinel-app.tssheets1.workers.dev/auth/outlook/callback";
      const scope = "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read offline_access";
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${env.OUTLOOK_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      return json({ url: authUrl });
    }

    // ── POST /api/inbox/oauth/callback ──────────────────────────────────────
    if (path === "/api/inbox/oauth/callback" && method === "POST") {
      const body = await request.json() as { provider: string; code: string; store_id: string };
      const { provider, code, store_id } = body;

      let accessToken = ""; let refreshToken = ""; let tokenExpiry = ""; let email = "";

      if (provider === "gmail") {
        const redirect = "https://sentinel-app.tssheets1.workers.dev/auth/gmail/callback";
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: env.GMAIL_CLIENT_ID ?? "", client_secret: env.GMAIL_CLIENT_SECRET ?? "", redirect_uri: redirect, grant_type: "authorization_code" }),
        });
        const d = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
        if (d.error || !d.access_token) return json({ ok: false, error: d.error_description ?? d.error ?? "OAuth failed" }, 400);
        accessToken  = d.access_token;
        refreshToken = d.refresh_token ?? "";
        tokenExpiry  = new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString();
        const pr = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
        const pd = await pr.json() as { email?: string };
        email = pd.email ?? "";
      } else if (provider === "outlook") {
        const redirect = "https://sentinel-app.tssheets1.workers.dev/auth/outlook/callback";
        const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: env.OUTLOOK_CLIENT_ID ?? "", client_secret: env.OUTLOOK_CLIENT_SECRET ?? "", redirect_uri: redirect, grant_type: "authorization_code", scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read offline_access" }),
        });
        const d = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
        if (d.error || !d.access_token) return json({ ok: false, error: d.error_description ?? d.error ?? "OAuth failed" }, 400);
        accessToken  = d.access_token;
        refreshToken = d.refresh_token ?? "";
        tokenExpiry  = new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString();
        const pr = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${accessToken}` } });
        const pd = await pr.json() as { mail?: string; userPrincipalName?: string };
        email = pd.mail ?? pd.userPrincipalName ?? "";
      } else {
        return json({ ok: false, error: "Unknown provider" }, 400);
      }

      // Check if account already exists for this email+store
      const existing = await env.DB.prepare(
        "SELECT id FROM email_accounts WHERE store_id=? AND provider=? AND email=?"
      ).bind(store_id, provider, email).first() as { id: string } | null;

      const accountId = existing?.id ?? `acc-${uid()}`;
      await env.DB.prepare(`INSERT OR REPLACE INTO email_accounts (id,store_id,provider,email,access_token,refresh_token,token_expiry,connected_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(accountId, store_id, provider, email, accessToken, refreshToken, tokenExpiry, new Date().toISOString()).run();

      return json({ ok: true, email, provider });
    }

    // ── GET /api/inbox/accounts ──────────────────────────────────────────────
    if (path === "/api/inbox/accounts" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      const rows = await env.DB.prepare("SELECT id,store_id,provider,email,connected_at FROM email_accounts WHERE store_id=?").bind(storeId).all();
      return json({ accounts: rows.results ?? [] });
    }

    // ── DELETE /api/inbox/accounts/:id ──────────────────────────────────────
    if (path.startsWith("/api/inbox/accounts/") && method === "DELETE") {
      const accountId = path.slice("/api/inbox/accounts/".length);
      await env.DB.prepare("DELETE FROM email_accounts WHERE id=?").bind(accountId).run();
      return json({ ok: true });
    }

    // ── POST /api/inbox/sync ─────────────────────────────────────────────────
    if (path === "/api/inbox/sync" && method === "POST") {
      const body = await request.json() as { store_id: string };
      const accounts = ((await env.DB.prepare("SELECT * FROM email_accounts WHERE store_id=?").bind(body.store_id).all()).results ?? []) as Record<string, string>[];
      let synced = 0;

      for (const account of accounts) {
        let token = account.access_token;
        if (account.token_expiry && new Date(account.token_expiry) < new Date(Date.now() + 60_000)) {
          try {
            const refreshed = await refreshOAuthToken(account.provider, account.refresh_token, env);
            token = refreshed.accessToken;
            await env.DB.prepare("UPDATE email_accounts SET access_token=?,token_expiry=? WHERE id=?").bind(token, refreshed.expiry, account.id).run();
          } catch { continue; }
        }
        if (account.provider === "gmail")   synced += await syncGmailAccount(account, token, body.store_id, env.DB);
        if (account.provider === "outlook") synced += await syncOutlookAccount(account, token, body.store_id, env.DB);
      }
      return json({ ok: true, synced });
    }

    // ── GET /api/inbox/threads ───────────────────────────────────────────────
    if (path === "/api/inbox/threads" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      const status  = url.searchParams.get("status") ?? "open";
      const q       = url.searchParams.get("q") ?? "";

      let sql = `SELECT t.*,COALESCE(t.priority,'normal') as priority,a.provider,a.email as account_email FROM email_threads t LEFT JOIN email_accounts a ON t.account_id=a.id WHERE t.store_id=?`;
      const params: string[] = [storeId];
      if (status !== "all") { sql += " AND t.status=?"; params.push(status); }
      if (q) { sql += " AND (t.subject LIKE ? OR t.customer_email LIKE ? OR t.customer_name LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      sql += " ORDER BY t.last_message_at DESC LIMIT 100";

      const rows = await env.DB.prepare(sql).bind(...params).all();
      return json({ threads: rows.results ?? [] });
    }

    // ── GET /api/inbox/threads/:id ───────────────────────────────────────────
    if (path.match(/^\/api\/inbox\/threads\/[^/]+$/) && method === "GET" && !path.endsWith("/reply")) {
      const threadId = path.split("/").pop() ?? "";
      const [thread, msgs] = await Promise.all([
        env.DB.prepare("SELECT t.*,a.provider,a.email as account_email FROM email_threads t LEFT JOIN email_accounts a ON t.account_id=a.id WHERE t.id=?").bind(threadId).first(),
        env.DB.prepare("SELECT * FROM email_messages WHERE thread_id=? ORDER BY sent_at ASC").bind(threadId).all(),
      ]);
      return json({ thread, messages: msgs.results ?? [] });
    }

    // ── PUT /api/inbox/threads/:id ───────────────────────────────────────────
    if (path.match(/^\/api\/inbox\/threads\/[^/]+$/) && method === "PUT") {
      const threadId = path.split("/").pop() ?? "";
      const body = await request.json() as { status?: string };
      if (body.status) await env.DB.prepare("UPDATE email_threads SET status=? WHERE id=?").bind(body.status, threadId).run();
      return json({ ok: true });
    }

    // ── POST /api/inbox/threads/:id/reply ────────────────────────────────────
    if (path.match(/^\/api\/inbox\/threads\/[^/]+\/reply$/) && method === "POST") {
      const parts = path.split("/");
      const threadId = parts[parts.length - 2] ?? "";
      const body = await request.json() as { text: string };

      const thread = await env.DB.prepare(`SELECT t.*,a.access_token,a.refresh_token,a.token_expiry,a.provider,a.email as account_email,a.id as account_id FROM email_threads t JOIN email_accounts a ON t.account_id=a.id WHERE t.id=?`).bind(threadId).first() as Record<string, string> | null;
      if (!thread) return json({ error: "Thread not found" }, 404);

      let token = thread.access_token;
      if (thread.token_expiry && new Date(thread.token_expiry) < new Date(Date.now() + 60_000)) {
        try {
          const refreshed = await refreshOAuthToken(thread.provider, thread.refresh_token, env);
          token = refreshed.accessToken;
          await env.DB.prepare("UPDATE email_accounts SET access_token=?,token_expiry=? WHERE id=?").bind(token, refreshed.expiry, thread.account_id).run();
        } catch (e) {
          return json({ ok: false, error: "Token refresh failed" }, 500);
        }
      }

      let ok = false;
      const replySubject = thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject ?? ""}`;

      if (thread.provider === "gmail") {
        const emailStr = [
          `To: ${thread.customer_email}`,
          `From: ${thread.account_email}`,
          `Subject: ${replySubject}`,
          `Content-Type: text/plain; charset=utf-8`,
          `MIME-Version: 1.0`,
          ``,
          body.text,
        ].join("\r\n");
        const raw = encodeBase64Url(emailStr);
        const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw, threadId: thread.provider_thread_id }),
        });
        ok = sendRes.ok;
      } else if (thread.provider === "outlook") {
        const sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject: replySubject,
              body: { contentType: "Text", content: body.text },
              toRecipients: [{ emailAddress: { address: thread.customer_email } }],
            },
          }),
        });
        ok = sendRes.status === 202 || sendRes.ok;
      }

      if (ok) {
        await env.DB.prepare(`INSERT OR IGNORE INTO email_messages (id,thread_id,from_email,to_email,body_text,direction,sent_at) VALUES (?,?,?,?,?,'outbound',?)`)
          .bind(`msg-${uid()}`, threadId, thread.account_email, thread.customer_email, body.text, new Date().toISOString()).run();
        await env.DB.prepare("UPDATE email_threads SET last_message_at=?,message_count=message_count+1 WHERE id=?")
          .bind(new Date().toISOString(), threadId).run();
      }
      return json({ ok });
    }

    // ── GET /api/inbox/canned ────────────────────────────────────────────────
    if (path === "/api/inbox/canned" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      const rows = await env.DB.prepare("SELECT * FROM canned_responses WHERE store_id=? ORDER BY title ASC").bind(storeId).all();
      return json({ canned: rows.results ?? [] });
    }

    // ── POST /api/inbox/canned ───────────────────────────────────────────────
    if (path === "/api/inbox/canned" && method === "POST") {
      const body = await request.json() as { store_id: string; title: string; body: string };
      const id = `cr-${uid()}`;
      await env.DB.prepare("INSERT INTO canned_responses (id,store_id,title,body,created_at) VALUES (?,?,?,?,?)").bind(id, body.store_id, body.title, body.body, new Date().toISOString()).run();
      return json({ ok: true, id });
    }

    // ── DELETE /api/inbox/canned/:id ─────────────────────────────────────────
    if (path.startsWith("/api/inbox/canned/") && method === "DELETE") {
      const cannedId = path.slice("/api/inbox/canned/".length);
      await env.DB.prepare("DELETE FROM canned_responses WHERE id=?").bind(cannedId).run();
      return json({ ok: true });
    }

    // ── GET /api/inbox/customer ──────────────────────────────────────────────
    if (path === "/api/inbox/customer" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      const email   = url.searchParams.get("email") ?? "";
      if (!email) return json({ customer: null }, 200);

      const [ordersRes, ticketsRes, threadRes] = await Promise.all([
        env.DB.prepare(`
          SELECT o.id, o.shopify_order_id, o.order_number, o.created_at, o.revenue, o.net_revenue, o.currency,
                 o.customer_name, o.customer_phone, o.customer_city, o.customer_country,
                 o.financial_status, o.fulfillment_status, o.tracking_number, o.tracking_url
          FROM orders o
          WHERE o.store_id=? AND LOWER(o.email)=LOWER(?)
          GROUP BY COALESCE(o.shopify_order_id, o.id)
          ORDER BY o.created_at DESC LIMIT 20
        `).bind(storeId, email).all(),

        env.DB.prepare(`
          SELECT id, subject, status, priority, created_at FROM cs_tickets
          WHERE store_id=? AND LOWER(customer_email)=LOWER(?)
          ORDER BY created_at DESC LIMIT 5
        `).bind(storeId, email).all(),

        env.DB.prepare(`
          SELECT customer_name FROM email_threads
          WHERE store_id=? AND LOWER(customer_email)=LOWER(?) AND customer_name != ''
          ORDER BY last_message_at DESC LIMIT 1
        `).bind(storeId, email).first(),
      ]);

      const orders = (ordersRes.results ?? []) as Record<string, unknown>[];
      // Fetch items for each order
      const ordersWithItems = await Promise.all(orders.map(async o => {
        const itemsRes = await env.DB.prepare(
          `SELECT product_title, variant_title, quantity, revenue FROM order_items WHERE order_id=? LIMIT 5`
        ).bind(o.id ?? o.shopify_order_id).all();
        return { ...o, items: itemsRes.results ?? [] };
      }));

      const tickets = (ticketsRes.results ?? []) as Record<string, unknown>[];
      const threadName = (threadRes as Record<string, string> | null)?.customer_name ?? "";
      const totalSpend = orders.reduce((s, o) => s + ((o.revenue as number) ?? 0), 0);
      // Customer profile from most recent order
      const latestOrder = orders[0] as Record<string, string> | undefined;
      const customerName  = threadName || (latestOrder?.customer_name as string) || "";
      const customerPhone = (latestOrder?.customer_phone as string) || "";
      const customerCity  = (latestOrder?.customer_city as string) || "";
      const customerCountry = (latestOrder?.customer_country as string) || "";

      return json({
        customer: {
          email,
          name: customerName,
          phone: customerPhone,
          city: customerCity,
          country: customerCountry,
          total_orders: orders.length,
          total_spend: totalSpend,
          ticket_count: tickets.length,
          tickets,
          orders: ordersWithItems,
        },
      });
    }

    // ── POST /api/inbox/threads/:id/create-ticket ────────────────────────────
    if (path.match(/^\/api\/inbox\/threads\/[^/]+\/create-ticket$/) && method === "POST") {
      const threadId = path.split("/")[4] ?? "";
      const thread = await env.DB.prepare(
        "SELECT * FROM email_threads WHERE id=?"
      ).bind(threadId).first() as Record<string, string> | null;
      if (!thread) return json({ error: "Thread not found" }, 404);

      const firstMsg = await env.DB.prepare(
        "SELECT body_text FROM email_messages WHERE thread_id=? AND direction='inbound' ORDER BY sent_at ASC LIMIT 1"
      ).bind(threadId).first() as { body_text: string } | null;

      const priority = (thread.priority as string) === "urgent" ? "urgent"
                     : (thread.priority as string) === "high"   ? "high"
                     : "medium";

      // Auto-merge: check if open ticket already exists for this customer
      const existing = await env.DB.prepare(
        `SELECT id FROM cs_tickets WHERE store_id=? AND LOWER(customer_email)=LOWER(?) AND status='open' AND source='inbox' ORDER BY created_at DESC LIMIT 1`
      ).bind(thread.store_id, thread.customer_email ?? "").first() as { id: string } | null;

      if (existing) {
        // Update existing ticket with new thread info instead of creating duplicate
        const now2 = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE cs_tickets SET description=description||'\n\n--- Nieuwe email ---\n'||?, updated_at=? WHERE id=?`
        ).bind(firstMsg?.body_text?.slice(0, 300) ?? "(geen tekst)", now2, existing.id).run();
        return json({ ok: true, ticket_id: existing.id, merged: true });
      }

      const id  = `cs-${uid()}`;
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO cs_tickets
          (id,store_id,order_number,customer_email,category,priority,status,
           subject,description,product_title,resolution,tags,source,thread_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(id, thread.store_id, "", thread.customer_email ?? "",
              "inbox", priority, "open",
              thread.subject ?? "", firstMsg?.body_text?.slice(0, 500) ?? "",
              "", "", "[]", "inbox", threadId, now, now).run();

      return json({ ok: true, ticket_id: id, merged: false });
    }

    // ── GET /api/inbox/overview ──────────────────────────────────────────────
    if (path === "/api/inbox/overview" && method === "GET") {
      const storeId = url.searchParams.get("store_id") ?? "";
      if (!storeId) return json({ error: "Missing store_id" }, 400);

      const [statusRow, responseRow, volumeRow, dailyRows, priorityRow] = await Promise.all([
        env.DB.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN status='open'    THEN 1 ELSE 0 END),0) as open_count,
            COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) as pending_count,
            COALESCE(SUM(CASE WHEN status='closed'  THEN 1 ELSE 0 END),0) as closed_count,
            COUNT(*) as total
          FROM email_threads WHERE store_id=?
        `).bind(storeId).first(),

        env.DB.prepare(`
          SELECT
            AVG(diff_h) as avg_response_hours,
            AVG(CASE WHEN is_closed=1 THEN total_h END) as avg_resolution_hours
          FROM (
            SELECT
              (julianday(MIN(CASE WHEN direction='outbound' THEN sent_at END)) -
               julianday(MIN(CASE WHEN direction='inbound'  THEN sent_at END))) * 24 as diff_h,
              (julianday(MAX(sent_at)) - julianday(MIN(CASE WHEN direction='inbound' THEN sent_at END))) * 24 as total_h,
              t.status = 'closed' as is_closed
            FROM email_messages m
            JOIN email_threads t ON t.id = m.thread_id
            WHERE t.store_id=?
            GROUP BY m.thread_id
            HAVING diff_h > 0 AND diff_h < 720
          )
        `).bind(storeId).first(),

        env.DB.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN last_message_at >= date('now','-7 days')  THEN 1 ELSE 0 END),0) as this_week,
            COALESCE(SUM(CASE WHEN last_message_at >= date('now','-30 days') THEN 1 ELSE 0 END),0) as this_month
          FROM email_threads WHERE store_id=?
        `).bind(storeId).first(),

        env.DB.prepare(`
          SELECT substr(last_message_at,1,10) as day, COUNT(*) as count,
            SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed
          FROM email_threads
          WHERE store_id=? AND last_message_at >= date('now','-14 days')
          GROUP BY day ORDER BY day ASC
        `).bind(storeId).all(),

        env.DB.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END),0) as urgent_count,
            COALESCE(SUM(CASE WHEN priority='high'   THEN 1 ELSE 0 END),0) as high_count
          FROM email_threads WHERE store_id=? AND status != 'closed'
        `).bind(storeId).first(),
      ]);

      return json({
        status:                statusRow,
        avg_response_hours:    (responseRow?.avg_response_hours    as number | null) ?? null,
        avg_resolution_hours:  (responseRow?.avg_resolution_hours  as number | null) ?? null,
        this_week:             (volumeRow?.this_week  as number) ?? 0,
        this_month:            (volumeRow?.this_month as number) ?? 0,
        urgent_open:           (priorityRow?.urgent_count as number) ?? 0,
        high_open:             (priorityRow?.high_count   as number) ?? 0,
        daily:                 dailyRows.results ?? [],
      });
    }

    // ── GET /api/roas-tracker ─────────────────────────────────────────────────
    // ?country=FR  → filter revenue by country; spend = manual-only (no ads bleed-over)
    // ?multi=1     → multi-country store; never use total google_ads_daily as auto-spend
    // ?multi=0     → single-country store; use google_ads_daily as auto-spend fallback
    if (path === "/api/roas-tracker" && method === "GET") {
      const storeId = url.searchParams.get("store_id");
      if (!storeId) return json({ error: "Missing store_id" }, 400);
      const { start, end } = getDateFilter(url);
      const country = url.searchParams.get("country") ?? "";

      // FX: convert revenue to EUR
      const rtStoreRow = await env.DB.prepare(`SELECT currency FROM stores WHERE id=?`).bind(storeId).first();
      const rtCurrency = (rtStoreRow?.currency as string | null) ?? "EUR";
      const rtFxRate = await getFxRate(rtCurrency, "EUR");
      const rtFx = (v: number) => Math.round(v * rtFxRate * 100) / 100;

      type OrderRow = { day: string; revenue: number; orders: number };
      type AdsRow   = { date: string; spend: number; clicks: number; impressions: number; ctr: number; cpc: number };
      type ManRow   = { date: string; ad_spend: number; revenue: number; orders: number; clicks: number; impressions: number; notes: string; is_manual: number };

      // Revenue: always filtered by country when country is set
      const ordersRows = country
        ? await env.DB.prepare(`
            SELECT day, SUM(rev) as revenue, SUM(cnt) as orders FROM (
              SELECT substr(created_at,1,10) as day, MAX(revenue) as rev, 1 as cnt
              FROM orders
              WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
                AND customer_country=?
              GROUP BY COALESCE(shopify_order_id, id)
            ) GROUP BY day
          `).bind(storeId, start, end, country).all()
        : await env.DB.prepare(`
            SELECT day, SUM(rev) as revenue, SUM(cnt) as orders FROM (
              SELECT substr(created_at,1,10) as day, MAX(revenue) as rev, 1 as cnt
              FROM orders
              WHERE store_id=? AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
              GROUP BY COALESCE(shopify_order_id, id)
            ) GROUP BY day
          `).bind(storeId, start, end).all();

      // Ad spend:
      // - country tab active → read per-country rows from google_ads_daily WHERE country=?
      //   (Google Ads Script must send per-country rows for this to auto-fill)
      // - no country (global view) → auto-fill from untagged google_ads_daily (country='' or NULL)
      const adsRows = country
        ? await env.DB.prepare(`
            SELECT date, spend, clicks, impressions,
              CASE WHEN impressions>0 THEN CAST(clicks AS REAL)/impressions*100 ELSE 0 END as ctr,
              CASE WHEN clicks>0 THEN spend/clicks ELSE 0 END as cpc
            FROM google_ads_daily
            WHERE store_id=? AND date>=? AND date<=? AND country=?
          `).bind(storeId, start, end, country).all()
        : await env.DB.prepare(`
            SELECT date, spend, clicks, impressions,
              CASE WHEN impressions>0 THEN CAST(clicks AS REAL)/impressions*100 ELSE 0 END as ctr,
              CASE WHEN clicks>0 THEN spend/clicks ELSE 0 END as cpc
            FROM google_ads_daily
            WHERE store_id=? AND date>=? AND date<=? AND (country='' OR country IS NULL)
          `).bind(storeId, start, end).all();

      // Manual overrides
      const manualRows = country
        ? await env.DB.prepare(`
            SELECT * FROM roas_tracker_country
            WHERE store_id=? AND country=? AND date>=? AND date<=?
          `).bind(storeId, country, start, end).all()
        : await env.DB.prepare(`
            SELECT * FROM roas_tracker WHERE store_id=? AND date>=? AND date<=?
          `).bind(storeId, start, end).all();

      const ordersMap = new Map<string, OrderRow>();
      for (const r of (ordersRows.results ?? []) as OrderRow[]) ordersMap.set(r.day, r);

      const adsMap = new Map<string, AdsRow>();
      for (const r of (adsRows.results ?? []) as AdsRow[]) adsMap.set(r.date, r);

      const manualMap = new Map<string, ManRow>();
      for (const r of (manualRows.results ?? []) as ManRow[]) manualMap.set(r.date, r);

      const rows: unknown[] = [];
      const cur = new Date(start + "T00:00:00Z");
      const endDate = new Date(end + "T00:00:00Z");
      while (cur <= endDate) {
        const d = cur.toISOString().slice(0, 10);
        cur.setUTCDate(cur.getUTCDate() + 1);

        const o = ordersMap.get(d);
        const a = adsMap.get(d);
        const m = manualMap.get(d);

        const autoSpend   = a?.spend       ?? 0;
        const autoRevenue = rtFx(o?.revenue ?? 0);
        const autoOrders  = o?.orders      ?? 0;
        const autoClicks  = a?.clicks      ?? 0;
        const autoImp     = a?.impressions ?? 0;
        const autoCtr     = a?.ctr         ?? 0;
        const autoCpc     = a?.cpc         ?? 0;

        const isManual = m ? (m.is_manual === 1) : false;
        const spend    = m?.ad_spend    != null ? m.ad_spend    : autoSpend;
        const revenue  = m?.revenue     != null ? rtFx(m.revenue) : autoRevenue;
        const orders   = m?.orders      != null ? m.orders      : autoOrders;
        const clicks   = m?.clicks      != null ? m.clicks      : autoClicks;
        const imp      = m?.impressions != null ? m.impressions : autoImp;
        const ctr      = imp > 0 ? (clicks / imp) * 100 : autoCtr;
        const cpc      = clicks > 0 ? spend / clicks : autoCpc;
        const roas     = spend > 0 ? revenue / spend : 0;

        rows.push({
          date: d, is_manual: isManual, country,
          ad_spend: spend, revenue, orders, clicks, impressions: imp,
          ctr, cpc, roas,
          notes: m?.notes ?? "",
          auto_spend: autoSpend, auto_revenue: autoRevenue,
        });
      }

      return json({ rows });
    }

    // ── POST /api/roas-tracker ────────────────────────────────────────────────
    // Upsert a manual override row for one date. Optional country field for per-country view.
    if (path === "/api/roas-tracker" && method === "POST") {
      const body = await request.json() as {
        store_id: string; date: string; country?: string;
        ad_spend?: number; revenue?: number; orders?: number;
        clicks?: number; impressions?: number; notes?: string;
        is_manual?: boolean;
      };
      if (!body.store_id || !body.date) return json({ error: "Missing store_id or date" }, 400);
      const now = new Date().toISOString();
      const country = body.country ?? "";

      if (country) {
        // Per-country upsert
        const id = `${body.store_id}_${body.date}_${country}`;
        await env.DB.prepare(`
          INSERT INTO roas_tracker_country (id, store_id, date, country, ad_spend, revenue, orders, clicks, impressions, notes, is_manual, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(store_id, date, country) DO UPDATE SET
            ad_spend=excluded.ad_spend, revenue=excluded.revenue, orders=excluded.orders,
            clicks=excluded.clicks, impressions=excluded.impressions, notes=excluded.notes,
            is_manual=excluded.is_manual, updated_at=excluded.updated_at
        `).bind(
          id, body.store_id, body.date, country,
          body.ad_spend ?? 0, body.revenue ?? 0, body.orders ?? 0,
          body.clicks ?? 0, body.impressions ?? 0,
          body.notes ?? "", body.is_manual === false ? 0 : 1,
          now, now,
        ).run();
      } else {
        // Global upsert (no country)
        const id = `${body.store_id}_${body.date}`;
        await env.DB.prepare(`
          INSERT INTO roas_tracker (id, store_id, date, ad_spend, revenue, orders, clicks, impressions, notes, is_manual, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(store_id, date) DO UPDATE SET
            ad_spend=excluded.ad_spend, revenue=excluded.revenue, orders=excluded.orders,
            clicks=excluded.clicks, impressions=excluded.impressions, notes=excluded.notes,
            is_manual=excluded.is_manual, updated_at=excluded.updated_at
        `).bind(
          id, body.store_id, body.date,
          body.ad_spend ?? 0, body.revenue ?? 0, body.orders ?? 0,
          body.clicks ?? 0, body.impressions ?? 0,
          body.notes ?? "", body.is_manual === false ? 0 : 1,
          now, now,
        ).run();
      }
      return json({ ok: true });
    }

    // ── DELETE /api/roas-tracker/:date ────────────────────────────────────────
    // Remove manual override — reverts to auto data.
    if (path.startsWith("/api/roas-tracker/") && method === "DELETE") {
      const storeId = url.searchParams.get("store_id");
      const country = url.searchParams.get("country") ?? "";
      const date = path.replace("/api/roas-tracker/", "");
      if (!storeId || !date) return json({ error: "Missing params" }, 400);
      if (country) {
        await env.DB.prepare(`DELETE FROM roas_tracker_country WHERE store_id=? AND date=? AND country=?`).bind(storeId, date, country).run();
      } else {
        await env.DB.prepare(`DELETE FROM roas_tracker WHERE store_id=? AND date=?`).bind(storeId, date).run();
      }
      return json({ ok: true });
    }

    // ── GET /api/stock ────────────────────────────────────────────────────────
    if (path === "/api/stock" && method === "GET") {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_title TEXT NOT NULL UNIQUE,
        purchased_qty INTEGER NOT NULL DEFAULT 0,
        low_stock_alert INTEGER NOT NULL DEFAULT 5,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();

      const stocks = await env.DB.prepare(`SELECT * FROM product_stock ORDER BY purchased_qty DESC`).all();

      const result = [];
      for (const item of (stocks.results as any[])) {
        // Use product_titles_json if available, otherwise fall back to product_title
        const titles: string[] = item.product_titles_json
          ? JSON.parse(item.product_titles_json)
          : [item.product_title];

        let totalSold = 0;
        for (const title of titles) {
          const sold = await env.DB.prepare(`
            SELECT COALESCE(SUM(oi.quantity),0) as units_sold
            FROM order_items oi
            JOIN orders o ON o.id=oi.order_id
            WHERE oi.product_title=? AND o.financial_status NOT IN ('refunded','voided','cancelled')
          `).bind(title).first() as any;
          totalSold += sold?.units_sold ?? 0;
        }
        result.push({
          ...item,
          linked_titles: titles,
          units_sold: totalSold,
          remaining: item.purchased_qty - totalSold,
        });
      }
      return json({ stock: result });
    }

    // ── POST /api/stock/bulk ──────────────────────────────────────────────────
    if (path === "/api/stock/bulk" && method === "POST") {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_title TEXT NOT NULL UNIQUE,
        purchased_qty INTEGER NOT NULL DEFAULT 0,
        low_stock_alert INTEGER NOT NULL DEFAULT 5,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();

      const body = await request.json() as any;
      const items = body.items ?? [];
      let updated = 0;
      for (const item of items) {
        await env.DB.prepare(`
          INSERT INTO product_stock (product_title, purchased_qty, low_stock_alert, notes)
          VALUES (?,?,?,?)
          ON CONFLICT(product_title) DO UPDATE SET
            purchased_qty=excluded.purchased_qty,
            low_stock_alert=excluded.low_stock_alert,
            notes=COALESCE(excluded.notes, product_stock.notes)
        `).bind(item.product_title, item.purchased_qty, item.low_stock_alert ?? 5, item.notes ?? null).run();
        updated++;
      }
      return json({ ok: true, updated });
    }

    // ── PUT /api/stock/:id ────────────────────────────────────────────────────
    if (path.startsWith("/api/stock/") && method === "PUT") {
      const id = path.split("/api/stock/")[1];
      const body = await request.json() as any;
      await env.DB.prepare(`
        UPDATE product_stock SET purchased_qty=?, low_stock_alert=?, notes=? WHERE id=?
      `).bind(body.purchased_qty, body.low_stock_alert, body.notes ?? null, id).run();
      return json({ ok: true });
    }

    // ── POST /api/sync/cancellations — mark Shopify-cancelled orders in D1 ──
    if (path === "/api/sync/cancellations" && method === "POST") {
      const marked = await syncCancellations(env, url.searchParams.get("store_id") || undefined);
      return json({ ok: true, marked });
    }

    return json({ error: "Not found", path }, 404);
  },

  // Cron: keep D1 in sync with Shopify cancellations so stock stays correct.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncCancellations(env));
  },
};
