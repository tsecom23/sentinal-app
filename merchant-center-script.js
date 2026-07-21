/**
 * SENTINEL — Google Merchant Center / Shopping Product Sync
 * ──────────────────────────────────────────────────────────
 * Instellen:
 *  1. Ga naar ads.google.com → Instellingen (⚙) → Scripts
 *  2. Plak deze code in een nieuw script
 *  3. Pas STORE_ID aan per account
 *  4. Klik "Autoriseren" en "Opslaan"
 *  5. Frequentie: Dagelijks
 *
 * Dit script haalt per product op:
 *  - Impressies, kliks, spend, conversies (laatste 90 dagen)
 *  - Gesplitst per dag
 * ──────────────────────────────────────────────────────────
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "martaline"; // ← aanpassen: "ceofo" / "dorevy" / "martaline"
var DAYS_BACK    = 90;

function main() {
  var tz        = AdsApp.currentAccount().getTimeZone();
  var endDate   = new Date();
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_BACK);

  var startStr = Utilities.formatDate(startDate, tz, "yyyy-MM-dd");
  var endStr   = Utilities.formatDate(endDate,   tz, "yyyy-MM-dd");

  var query =
    "SELECT " +
    "  segments.product_title, " +
    "  segments.date, " +
    "  metrics.impressions, " +
    "  metrics.clicks, " +
    "  metrics.cost_micros, " +
    "  metrics.conversions " +
    "FROM shopping_performance_view " +
    "WHERE segments.date BETWEEN '" + startStr + "' AND '" + endStr + "' " +
    "  AND metrics.impressions > 0";

  var result = AdsApp.search(query);

  // Aggregeer per product+dag
  var byKey = {};

  while (result.hasNext()) {
    var row = result.next();

    var title       = row["segments.product_title"] || "";
    var date        = row["segments.date"]          || "";
    var impressions = parseInt(row["metrics.impressions"]  || 0);
    var clicks      = parseInt(row["metrics.clicks"]       || 0);
    var costMicros  = parseFloat(row["metrics.cost_micros"]  || 0);
    var conversions = parseFloat(row["metrics.conversions"]  || 0);

    if (!title || !date) continue;

    var key = date + "||" + title;
    if (!byKey[key]) {
      byKey[key] = {
        date:        date,
        product_title: title,
        impressions: 0,
        clicks:      0,
        spend:       0,
        conversions: 0
      };
    }

    byKey[key].impressions += impressions;
    byKey[key].clicks      += clicks;
    byKey[key].spend       += costMicros / 1000000;
    byKey[key].conversions += conversions;
  }

  // Bouw payload
  var payload = [];
  var keys = Object.keys(byKey);

  for (var i = 0; i < keys.length; i++) {
    var d = byKey[keys[i]];
    var cpc = d.clicks > 0      ? round2(d.spend / d.clicks)               : 0;
    var ctr = d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0;

    payload.push({
      store_id:      STORE_ID,
      date:          d.date,
      product_title: d.product_title,
      spend:         round2(d.spend),
      clicks:        d.clicks,
      impressions:   d.impressions,
      conversions:   round2(d.conversions),
      cpc:           cpc,
      ctr:           ctr
    });
  }

  if (payload.length === 0) {
    Logger.log("Geen product data gevonden.");
    return;
  }

  // Verstuur in batches van 200
  var BATCH = 200;
  var totalSent = 0;

  for (var b = 0; b < payload.length; b += BATCH) {
    var batch = payload.slice(b, b + BATCH);
    var response = UrlFetchApp.fetch(SENTINEL_API + "/api/ads/products/import", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ rows: batch }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log("❌ Fout bij batch " + (b / BATCH + 1) + ": " + response.getContentText());
    } else {
      totalSent += batch.length;
    }
  }

  Logger.log(
    "✅ Product sync klaar — " + totalSent + " rijen voor " +
    keys.length + " product+dag combinaties. " +
    "Periode: " + startStr + " t/m " + endStr
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
