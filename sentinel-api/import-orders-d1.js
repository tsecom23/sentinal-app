const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const STORE_ID = "martaline";
const file = process.argv[2] || "/Users/tobias/Downloads/orders_export_1.csv";

console.log("Parsing orders CSV...");
const content = fs.readFileSync(path.resolve(file), "utf-8");

// Proper CSV parser — handles multiline quoted fields (Notes, etc.)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else { field += ch; }
    }
  }
  if (row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(content);
const headers = rows[0].map(h => h.trim());

const col = (name) => headers.indexOf(name);
const NAME        = col("Name");
const EMAIL       = col("Email");
const CURRENCY    = col("Currency");
const SUBTOTAL    = col("Subtotal");
const TOTAL       = col("Total");
const CREATED     = col("Created at");
const SHOPIFY_ID  = col("Id");
const LI_QTY      = col("Lineitem quantity");
const LI_NAME     = col("Lineitem name");
const LI_PRICE    = col("Lineitem price");
const LI_SKU      = col("Lineitem sku");
const FIN_STATUS  = col("Financial Status");

const ordersMap = new Map();

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[NAME]) continue;

  const name = r[NAME].trim();
  if (!name.startsWith("#")) continue; // skip malformed rows

  if (!ordersMap.has(name)) {
    const rawDate = r[CREATED]?.trim() || "";
    const isoDate = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();

    ordersMap.set(name, {
      id: "mrt-" + name.replace("#", ""),
      shopify_order_id: r[SHOPIFY_ID]?.trim() || name,
      order_number: name,
      email: r[EMAIL]?.trim() || "",
      currency: r[CURRENCY]?.trim() || "EUR",
      revenue: parseFloat(r[TOTAL]?.trim() || "0"),
      net_revenue: parseFloat(r[SUBTOTAL]?.trim() || "0"),
      created_at: isoDate,
      line_items: [],
    });
  }

  const lineName = r[LI_NAME]?.trim() || "";
  if (lineName) {
    const order = ordersMap.get(name);
    const lineQty = parseInt(r[LI_QTY]?.trim() || "1");
    const linePrice = parseFloat(r[LI_PRICE]?.trim() || "0");

    // Split "Product Title - Variant" on last " - "
    let productTitle = lineName;
    let variantTitle = "";
    const dashIdx = lineName.lastIndexOf(" - ");
    if (dashIdx > 0) {
      productTitle = lineName.slice(0, dashIdx);
      variantTitle = lineName.slice(dashIdx + 3);
    }

    order.line_items.push({
      idx: order.line_items.length,
      productTitle,
      variantTitle,
      sku: r[LI_SKU]?.trim() || "",
      qty: lineQty,
      price: linePrice,
    });
  }
}

const orders = Array.from(ordersMap.values());
const totalItems = orders.reduce((s, o) => s + o.line_items.length, 0);
console.log(`Parsed ${orders.length} orders, ${totalItems} line items.`);

// Show today's orders
const today = new Date().toISOString().slice(0, 10);
const todayOrders = orders.filter(o => o.created_at.startsWith(today));
console.log(`Today's orders (${today}): ${todayOrders.length}`);
todayOrders.forEach(o => console.log(`  ${o.order_number} — €${o.revenue} — ${o.email}`));

const escape = (s) => String(s ?? "").replace(/'/g, "''");

const orderRows = orders.map(o =>
  `('${escape(o.id)}','${escape(o.shopify_order_id)}','${escape(o.order_number)}','${escape(o.email)}','${escape(o.currency)}',${o.revenue},${o.net_revenue},'${escape(o.created_at)}','${STORE_ID}')`
);

const itemRows = [];
orders.forEach(o => {
  o.line_items.forEach(item => {
    const itemId = `${o.id}-item-${item.idx}`;
    itemRows.push(
      `('${escape(itemId)}','${escape(o.id)}','','','${escape(item.productTitle)}','${escape(item.variantTitle)}',${item.qty},${item.price * item.qty},0,'${STORE_ID}')`
    );
  });
});

function runBatch(table, cols, valueRows, label) {
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < valueRows.length; i += batchSize) {
    const batch = valueRows.slice(i, i + batchSize);
    const sql = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES ${batch.join(",")};`;
    const tmpFile = `/tmp/sentinel_orders_${Date.now()}.sql`;
    fs.writeFileSync(tmpFile, sql);
    try {
      execSync(
        `npx wrangler d1 execute sentinel_db --remote --file="${tmpFile}"`,
        { cwd: path.join(__dirname), stdio: "pipe" }
      );
      inserted += batch.length;
      process.stdout.write(`\r${label}: ${inserted}/${valueRows.length}`);
    } catch (e) {
      console.error(`\nBatch failed at ${i}:`, e.stderr?.toString().slice(0, 300));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
  console.log(`\n${label}: done.`);
}

console.log("Inserting into D1...");
runBatch(
  "orders",
  "id,shopify_order_id,order_number,email,currency,revenue,net_revenue,created_at,store_id",
  orderRows,
  "Orders"
);
runBatch(
  "order_items",
  "id,order_id,product_id,variant_id,product_title,variant_title,quantity,revenue,cost,store_id",
  itemRows,
  "Line items"
);

console.log("\nImport complete!");
