/**
 * SENTINEL — Google Ads Auto-Sync Script
 * ─────────────────────────────────────────────────────────────
 * Instellen:
 *  1. Ga naar ads.google.com → rechtsboven Instellingen (⚙) → Scripts
 *  2. Klik op + (nieuw script)
 *  3. Plak deze volledige code
 *  4. Pas STORE_ID aan ("ceofo" of "martaline")
 *  5. Klik "Autoriseren" en daarna "Opslaan"
 *  6. Zet frequentie op "Dagelijks" (rechts naast het script)
 *
 * Dat is alles. Het script pusht elke dag automatisch alle ad stats
 * naar je Sentinel dashboard. Geen API-goedkeuring nodig.
 * ─────────────────────────────────────────────────────────────
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "ceofo"; // ← aanpassen: "ceofo" of "martaline"
var DAYS_BACK    = 90;       // hoeveel dagen terug bij eerste run (daarna alleen 2 dagen voor safety)

function main() {
  var rows = {};

  // Haal alle campagnes op, gesommeerd per dag
  var report = AdsApp.report(
    "SELECT Date, Cost, Clicks, Impressions, Conversions, AverageCpc, Ctr " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    "DURING LAST_90_DAYS"
  );

  var iter = report.rows();
  while (iter.hasNext()) {
    var r = iter.next();

    // Google Ads geeft datum terug als "2026-05-10" of "05/10/2026"
    var rawDate = r["Date"] || r["day"] || "";
    var date = normaliseDate(rawDate);
    if (!date) continue;

    if (!rows[date]) {
      rows[date] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    }

    rows[date].spend       += parseNum(r["Cost"]);
    rows[date].clicks      += Math.round(parseNum(r["Clicks"]));
    rows[date].impressions += Math.round(parseNum(r["Impressions"]));
    rows[date].conversions += parseNum(r["Conversions"]);
  }

  var payload = [];
  var keys = Object.keys(rows);
  for (var i = 0; i < keys.length; i++) {
    var date = keys[i];
    var d = rows[date];
    payload.push({
      store_id:    STORE_ID,
      date:        date,
      spend:       round2(d.spend),
      clicks:      d.clicks,
      impressions: d.impressions,
      conversions: round2(d.conversions),
      cpc:         d.clicks > 0 ? round2(d.spend / d.clicks) : 0,
      ctr:         d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
      roas:        0,
    });
  }

  if (payload.length === 0) {
    Logger.log("Geen data gevonden voor de afgelopen 90 dagen.");
    return;
  }

  var response = UrlFetchApp.fetch(SENTINEL_API + "/api/ads/import", {
    method:             "post",
    contentType:        "application/json",
    payload:            JSON.stringify({ rows: payload }),
    muteHttpExceptions: true,
  });

  Logger.log(
    "✓ Sentinel sync klaar — " + payload.length + " dagen gepusht. " +
    "Status: " + response.getResponseCode() + ". " +
    "Response: " + response.getContentText()
  );
}

// ── helpers ────────────────────────────────────────────────────

function normaliseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();
  // "2026-05-10" → prima
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // "05/10/2026" → "2026-05-10"
  var m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[1] + "-" + m[2];
  // Fallback: probeer Date parse
  try {
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch (e) { return null; }
}

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
