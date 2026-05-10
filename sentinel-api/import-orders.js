const fs = require("fs");
const path = require("path");

const API_URL = "https://sentinel-api.tssheets1.workers.dev";
const STORE_ID = "martaline";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node import-orders.js <orders.csv>");
  process.exit(1);
}

const content = fs.readFileSync(path.resolve(file), "utf-8");
const lines = content.split("\n").filter((l) => l.trim());
const headers = parseCSVLine(lines[0]);

// Group rows by order name since Shopify repeats order rows per line item
const ordersMap = new Map();

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length < 2) continue;

  const obj = {};
  headers.forEach((h, idx) => {
    obj[h.trim()] = (row[idx] || "").trim();
  });

  const name = obj["Name"] || obj["name"];
  if (!name) continue;

  if (!ordersMap.has(name)) {
    ordersMap.set(name, {
      id: name.replace("#", "order-"),
      shopify_order_id: name.replace("#", ""),
      order_number: name,
      email: obj["Email"] || obj["email"] || "",
      currency: obj["Currency"] || "EUR",
      revenue: parseFloat(obj["Total"] || obj["total"] || "0"),
      net_revenue: parseFloat(obj["Subtotal"] || obj["subtotal"] || "0"),
      created_at: toISO(obj["Created at"] || obj["Paid at"] || obj["created_at"]),
      line_items: [],
    });
  }

  const title = obj["Lineitem name"] || obj["lineitem_name"];
  const qty = parseInt(obj["Lineitem quantity"] || obj["lineitem_quantity"] || "1");
  const price = parseFloat(obj["Lineitem price"] || obj["lineitem_price"] || "0");

  if (title) {
    ordersMap.get(name).line_items.push({
      id: `${i}`,
      title,
      variant_title: obj["Lineitem variant"] || obj["lineitem_variant"] || "",
      quantity: qty,
      price: price.toFixed(2),
      product_id: "",
      variant_id: "",
    });
  }
}

const orders = Array.from(ordersMap.values());
console.log(`Found ${orders.length} orders to import...`);

(async () => {
  let ok = 0;
  let fail = 0;

  for (const order of orders) {
    const res = await fetch(
      `${API_URL}/api/webhooks/shopify/orders-create?store_id=${STORE_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      }
    );
    const json = await res.json();
    if (json.ok) {
      console.log(`✓ ${order.order_number} — €${order.revenue}`);
      ok++;
    } else {
      console.log(`✗ ${order.order_number}:`, json);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} imported, ${fail} failed.`);
})();

function toISO(dateStr) {
  if (!dateStr) return new Date().toISOString();
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function parseCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
