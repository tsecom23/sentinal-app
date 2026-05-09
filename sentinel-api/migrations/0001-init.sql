CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  shopify_order_id TEXT NOT NULL,
  order_number TEXT,
  email TEXT,
  currency TEXT,
  revenue REAL DEFAULT 0,
  net_revenue REAL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  product_title TEXT,
  variant_title TEXT,
  quantity INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0
);