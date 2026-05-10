const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const STORE_ID = "martaline";
const file = process.argv[2] || "/Users/tobias/Downloads/products_export_1-2.csv";

console.log("Parsing CSV...");
const content = fs.readFileSync(path.resolve(file), "utf-8");

// Proper CSV parser that handles multiline quoted fields
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
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(content);
const headers = rows[0].map(h => h.trim());

const col = (name) => headers.indexOf(name);
const H = col("Handle");
const TITLE = col("Title");
const STATUS = col("Status");
const VENDOR = col("Vendor");
const TYPE = col("Type");
const TAGS = col("Tags");
const IMAGE = col("Image Src");
const OPT1_VAL = col("Option1 Value");
const OPT2_VAL = col("Option2 Value");
const PRICE = col("Variant Price");
const SKU = col("Variant SKU");
const COST = col("Cost per item");

const productsMap = new Map();

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length < 5) continue;

  const handle = r[H]?.trim();
  const title = r[TITLE]?.trim();

  if (!handle) continue;

  if (!productsMap.has(handle)) {
    productsMap.set(handle, {
      handle,
      title: title || handle,
      status: r[STATUS]?.trim() || "active",
      vendor: r[VENDOR]?.trim() || "",
      type: r[TYPE]?.trim() || "",
      tags: r[TAGS]?.trim() || "",
      image_url: r[IMAGE]?.trim() || "",
      variants: [],
    });
  }

  const opt1 = r[OPT1_VAL]?.trim() || "";
  const opt2 = r[OPT2_VAL]?.trim() || "";
  const variantTitle = [opt1, opt2].filter(Boolean).join(" / ") || "Default";
  const price = parseFloat(r[PRICE]?.trim() || "0");
  const sku = r[SKU]?.trim() || "";
  const cost = parseFloat(r[COST]?.trim() || "0");

  productsMap.get(handle).variants.push({ variantTitle, price, sku, cost });
}

const products = Array.from(productsMap.values());
console.log(`Parsed ${products.length} unique products.`);

// Generate SQL in batches of 50
const escape = (s) => String(s || "").replace(/'/g, "''");

const productRows = products.map(p =>
  `('${escape(p.handle)}','${escape(p.title)}','${escape(p.handle)}','${escape(p.status)}','${escape(p.vendor)}','${escape(p.type)}','${escape(p.tags)}',datetime('now'),datetime('now'),datetime('now'),'${escape(p.image_url)}','${STORE_ID}')`
);

const variantRows = [];
products.forEach((p) => {
  p.variants.forEach((v, idx) => {
    const id = `${p.handle}-v${idx}`;
    variantRows.push(
      `('${escape(id)}','${escape(p.handle)}','${escape(id)}','${escape(v.variantTitle)}','${escape(v.sku)}',${v.price || 0},0)`
    );
  });
});

console.log(`Generated ${productRows.length} products, ${variantRows.length} variants.`);
console.log("Inserting into D1...");

// Write SQL to temp file and execute via wrangler
function runBatch(table, cols, valueRows, label) {
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < valueRows.length; i += batchSize) {
    const batch = valueRows.slice(i, i + batchSize);
    const sql = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES ${batch.join(",")};`;
    const tmpFile = `/tmp/sentinel_import_${Date.now()}.sql`;
    fs.writeFileSync(tmpFile, sql);
    try {
      execSync(
        `npx wrangler d1 execute sentinel_db --remote --file="${tmpFile}"`,
        { cwd: path.join(__dirname), stdio: "pipe" }
      );
      inserted += batch.length;
      process.stdout.write(`\r${label}: ${inserted}/${valueRows.length}`);
    } catch (e) {
      console.error(`\nBatch failed at ${i}:`, e.stderr?.toString().slice(0, 200));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }
  console.log(`\n${label}: done.`);
}

runBatch(
  "shopify_products",
  "id,title,handle,status,vendor,product_type,tags,created_at,published_at,updated_at,image_url,store_id",
  productRows,
  "Products"
);

runBatch(
  "shopify_product_variants",
  "id,product_id,variant_id,title,sku,price,inventory_quantity",
  variantRows,
  "Variants"
);

console.log("\nImport complete!");
