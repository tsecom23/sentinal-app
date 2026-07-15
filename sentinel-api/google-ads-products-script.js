/**
 * SENTINEL — Google Ads Products Script
 * ─────────────────────────────────────────────────────────────
 * Instellen:
 *  1. Ga naar ads.google.com → Instellingen (⚙) → Scripts
 *  2. Klik op + (nieuw script)
 *  3. Plak deze volledige code
 *  4. Pas STORE_ID aan ("ceofo" of "martaline")
 *  5. Klik "Autoriseren" en daarna "Opslaan"
 *  6. Zet frequentie op "Uurlijks"
 *
 * Vereist: Google Shopping campagnes.
 * Bij alleen Search campagnes is product-level data niet beschikbaar.
 * ─────────────────────────────────────────────────────────────
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "martaline"; // ← aanpassen: "ceofo" of "martaline"

function main() {
  var rows = {};

  // Build explicit date range — DURING keyword not supported in shopping_performance_view
  // 14 days is enough for daily updates; run hourly to keep data fresh
  var today = new Date();
  var startDate = new Date(today);
  startDate.setDate(today.getDate() - 14);
  function fmt(d) {
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }
  var dateRange = "segments.date >= '" + fmt(startDate) + "' AND segments.date <= '" + fmt(today) + "'";

  try {
    var query =
      "SELECT segments.product_title, segments.date, " +
      "metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
      "FROM shopping_performance_view " +
      "WHERE " + dateRange;

    var result = AdsApp.search(query);

    while (result.hasNext()) {
      var r = result.next();

      var title = (r.segments && r.segments.productTitle) ? r.segments.productTitle : "Unknown";
      var date  = (r.segments && r.segments.date)         ? r.segments.date         : "";
      if (!date) continue;

      var key = date + "|" + title;
      if (!rows[key]) {
        rows[key] = {
          date:          date,
          product_title: title,
          spend:         0,
          clicks:        0,
          impressions:   0,
          conversions:   0,
        };
      }

      rows[key].spend       += ((r.metrics && r.metrics.costMicros) ? r.metrics.costMicros : 0) / 1000000;
      rows[key].clicks      += (r.metrics && r.metrics.clicks)      ? parseInt(r.metrics.clicks, 10)      : 0;
      rows[key].impressions += (r.metrics && r.metrics.impressions) ? parseInt(r.metrics.impressions, 10) : 0;
      rows[key].conversions += (r.metrics && r.metrics.conversions) ? parseFloat(r.metrics.conversions)   : 0;
    }

  } catch (e) {
    Logger.log("Shopping query mislukt: " + e);
    Logger.log("Heb je Shopping campagnes? Dit script werkt alleen met Google Shopping.");
    return;
  }

  var payload = [];
  var keys = Object.keys(rows);

  for (var i = 0; i < keys.length; i++) {
    var d = rows[keys[i]];
    payload.push({
      store_id:      STORE_ID,
      date:          d.date,
      product_title: d.product_title,
      spend:         round2(d.spend),
      clicks:        d.clicks,
      impressions:   d.impressions,
      conversions:   round2(d.conversions),
      cpc:           d.clicks > 0 ? round2(d.spend / d.clicks) : 0,
      ctr:           d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
    });
  }

  if (payload.length === 0) {
    Logger.log("Geen product-level shopping data gevonden.");
    return;
  }

  // Stuur in chunks van 1000 — voorkomt payload-limiet en Worker timeout
  var BATCH_SIZE = 1000;
  var batches = Math.ceil(payload.length / BATCH_SIZE);
  for (var b = 0; b < batches; b++) {
    var batch = payload.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    UrlFetchApp.fetch(SENTINEL_API + "/api/ads/products/import", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ rows: batch }),
      muteHttpExceptions: true,
    });
  }

  Logger.log("✓ " + payload.length + " product-dagen gepusht voor " + STORE_ID + " (" + batches + " batches)");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
