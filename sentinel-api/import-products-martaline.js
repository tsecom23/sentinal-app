const fs = require("fs");
const path = require("path");

const API_URL = "https://sentinel-api.tssheets1.workers.dev";
const STORE_ID = "martaline";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node import-products-martaline.js <products.csv>");
  process.exit(1);
}

const content = fs.readFileSync(path.resolve(file), "utf-8");
const lines = content.split("\n").filter((l) => l.trim());
const headers = parseCSVLine(lines[0]);

const productsMap = new Map();

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length < 2) continue;

  const obj = {};
  headers.forEach((h, idx) => {
    obj[h.trim()] = (row[idx] || "").trim();
  });

  const handle = obj["Handle"] || obj["handle"];
  const title = obj["Title"] || obj["title"];
  if (!handle || !title) continue;

  if (!productsMap.has(handle)) {
    productsMap.set(handle, {
      id: handle,
      handle,
      title,
      status: (obj["Status"] || obj["status"] || "active").toLowerCase(),
      vendor: obj["Vendor"] || obj["vendor"] || "",
      product_type: obj["Type"] || obj["type"] || "",
      tags: obj["Tags"] || obj["tags"] || "",
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      image: { src: obj["Image Src"] || obj["image_src"] || "" },
      variants: [],
    });
  }

  const variantTitle = obj["Option1 Value"] || obj["Variant Title"] || "Default";
  const price = obj["Variant Price"] || obj["variant_price"] || "0";
  const sku = obj["Variant SKU"] || obj["variant_sku"] || "";
  const qty = obj["Variant Inventory Qty"] || obj["variant_inventory_qty"] || "0";

  productsMap.get(handle).variants.push({
    id: `${handle}-${i}`,
    title: variantTitle,
    sku,
    price,
    inventory_quantity: parseInt(qty) || 0,
  });
}

const products = Array.from(productsMap.values());
console.log(`Found ${products.length} products to import...`);

(async () => {
  let ok = 0;
  let fail = 0;

  for (const product of products) {
    const res = await fetch(
      `${API_URL}/api/webhooks/shopify/products-create?store_id=${STORE_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      }
    );
    const json = await res.json();
    if (json.ok) {
      console.log(`✓ ${product.title}`);
      ok++;
    } else {
      console.log(`✗ ${product.title}:`, json);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} imported, ${fail} failed.`);
})();

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
