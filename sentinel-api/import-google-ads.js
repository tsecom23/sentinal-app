/**
 * Google Ads CSV Import
 * Export from Google Ads: Reports → Campaigns → download as CSV
 * Then run: node import-google-ads.js <file.csv> <store_id>
 */
const fs = require("fs");

const API_URL = "https://sentinel-api.tssheets1.workers.dev";
const file = process.argv[2];
const storeId = process.argv[3] || "ceofo";

if (!file) {
  console.error("Usage: node import-google-ads.js <google_ads_export.csv> <store_id>");
  console.error("Example: node import-google-ads.js ads_may.csv martaline");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf-8");
const lines = content.split("\n").filter(l => l.trim());
const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));

console.log("Headers found:", headers.join(", "));

const col = (name) => {
  // Try exact and fuzzy match for common Google Ads column names
  const aliases = {
    date: ["day", "date", "datum"],
    spend: ["cost", "spend", "kosten", "costs"],
    clicks: ["clicks", "klicks"],
    impressions: ["impressions", "vertoningen"],
    conversions: ["conversions", "conversies", "conv"],
    cpc: ["avg_cpc", "cpc", "gemiddelde_cpc"],
    ctr: ["ctr", "click_through_rate"],
  };
  for (const [key, alts] of Object.entries(aliases)) {
    if (key === name && alts.some(a => headers.includes(a))) {
      return headers.findIndex(h => alts.includes(h));
    }
  }
  return headers.indexOf(name);
};

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
}

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const r = lines[i].split(",");
  const dateStr = r[col("date")]?.trim();
  if (!dateStr || dateStr === "Total" || dateStr === "Totaal") continue;

  // Try to parse date (Google Ads: "May 1, 2026" or "2026-05-01")
  let date;
  try {
    date = new Date(dateStr).toISOString().slice(0, 10);
    if (isNaN(Date.parse(dateStr))) continue;
  } catch { continue; }

  const spend = parseNum(r[col("spend")]);
  const clicks = parseInt(r[col("clicks")] || "0");
  const impressions = parseInt(r[col("impressions")] || "0");
  const conversions = parseNum(r[col("conversions")]);
  const cpc = clicks > 0 ? spend / clicks : parseNum(r[col("cpc")]);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : parseNum(r[col("ctr")]);

  rows.push({ store_id: storeId, date, spend, clicks, impressions, conversions, cpc, ctr, roas: 0 });
}

console.log(`Parsed ${rows.length} days of ad data for store: ${storeId}`);
if (rows.length === 0) {
  console.log("No data found. Check that your CSV has: Date, Cost, Clicks, Impressions columns.");
  process.exit(0);
}

rows.slice(0, 3).forEach(r => console.log(" →", r.date, `€${r.spend.toFixed(2)} spend, ${r.clicks} clicks`));

(async () => {
  const res = await fetch(`${API_URL}/api/ads/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  const json = await res.json();
  console.log(`\n✓ Imported ${json.imported} days of Google Ads data.`);
})();
