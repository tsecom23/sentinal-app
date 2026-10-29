/**
 * SENTINEL — Google Ads Auto-Sync Script (DOREVY ONLY, geo-view versie)
 * ───────────────────────────────────────────────────────────────────────
 * Doel van deze versie: land-splitsing komt NIET meer uit campagne-naam
 * (fragiel, mist DE spend en kent multi-land PMax verkeerd toe), maar uit
 * Google's eigen GEO_PERFORMANCE_REPORT (country_criterion_id per campagne).
 *
 * Gebruik:
 *  1. Ga naar ads.google.com (Dorevy's Google Ads account) → ⚙ Scripts
 *  2. Open het bestaande Sentinel-script en vervang de volledige inhoud
 *     door dit bestand.
 *  3. Autoriseer, Opslaan, zet frequentie op "Dagelijks".
 *  4. Martaline/CEOFO blijven op `google-ads-script.js` (name-parsing).
 *
 * Payload-shape naar /api/ads/import is identiek aan de oude versie:
 *   { store_id, date, country, spend, clicks, impressions, conversions, cpc, ctr, roas }
 *   country=""  → dagtotaal (globale dashboard)
 *   country="XX" → per-land breakdown (ISO 2-letter, maar GB wordt teruggemapt
 *                   naar "UK" voor consistentie met bestaande D1-rows)
 * ───────────────────────────────────────────────────────────────────────
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "dorevy";

// Google location CriteriaId → ISO 2-letter.
// Beperkt tot landen die Dorevy ooit zou kunnen targeten (EU + UK + nabij).
// Alles wat hier NIET in staat wordt gebucketed als "" (en zit al in de
// dagtotaal-rij) i.p.v. verloren te gaan.
var COUNTRY_ID_TO_CODE = {
  "2056": "BE",
  "2040": "AT",
  "2124": "CA",
  "2203": "CZ",
  "2208": "DK",
  "2246": "FI",
  "2250": "FR",
  "2276": "DE",
  "2300": "GR",
  "2348": "HU",
  "2372": "IE",
  "2380": "IT",
  "2442": "LU",
  "2528": "NL",
  "2578": "NO",
  "2616": "PL",
  "2620": "PT",
  "2642": "RO",
  "2724": "ES",
  "2752": "SE",
  "2756": "CH",
  "2826": "UK", // GB → UK voor compat met bestaande rows
  "2840": "US",
  "2036": "AU",
  "2554": "NZ"
};

// ── Helpers ─────────────────────────────────────────────────────────────

function normaliseDate(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[1] + "-" + m[2];
  try {
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch (e) { return null; }
}

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function addTo(bucket, spend, clicks, impressions, conversions) {
  bucket.spend       += spend;
  bucket.clicks      += clicks;
  bucket.impressions += impressions;
  bucket.conversions += conversions;
}

function emptyBucket() {
  return { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  // byDate[date][country] — "" = globaal dagtotaal; ISO-code = per land
  var byDate = {};

  // Datumbereik: vandaag t/m 90 dagen geleden (AWQL formaat: yyyyMMdd)
  var tz        = AdsApp.currentAccount().getTimeZone();
  var endDate   = new Date();
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  var dateRange = Utilities.formatDate(startDate, tz, "yyyyMMdd") + "," +
                  Utilities.formatDate(endDate,   tz, "yyyyMMdd");

  // ── 1) Dagtotaal (voor "" rij — globaal dashboard) ────────────────────
  var totalReport = AdsApp.report(
    "SELECT Date, Cost, Clicks, Impressions, Conversions " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    "DURING " + dateRange
  );

  var iter1 = totalReport.rows();
  while (iter1.hasNext()) {
    var r = iter1.next();
    var date = normaliseDate(r["Date"]);
    if (!date) continue;
    if (!byDate[date]) byDate[date] = {};
    if (!byDate[date][""]) byDate[date][""] = emptyBucket();
    addTo(
      byDate[date][""],
      parseNum(r["Cost"]),
      Math.round(parseNum(r["Clicks"])),
      Math.round(parseNum(r["Impressions"])),
      parseNum(r["Conversions"])
    );
  }

  // ── 2) Per-land breakdown via GAQL user_location_view ────────────────
  // Modern GAQL (via AdsApp.search), user_location_view = fysieke locatie
  // van de user tijdens de klik (location-of-presence), inclusief landen
  // die je niet target. Dit is wat we willen voor DE spend.
  //
  // Waarom NIET AWQL GEO_PERFORMANCE_REPORT:
  //   - Default = area-of-interest (waar je getarget hebt), DE mist dan.
  //   - `WHERE IsTargetingLocation = false` gaf in deze PMax-account 0 rijen
  //     (zie run 20:52, 91 rijen = alleen dagtotalen).
  // Waarom NIET AWQL USER_LOCATION_PERFORMANCE_REPORT: bestaat niet in AWQL
  // (InputError: Report not mapped, zie run 20:58).
  var gaqlStart = Utilities.formatDate(startDate, tz, "yyyy-MM-dd");
  var gaqlEnd   = Utilities.formatDate(endDate,   tz, "yyyy-MM-dd");

  var geoQuery =
    "SELECT segments.date, user_location_view.country_criterion_id, " +
    "metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
    "FROM user_location_view " +
    "WHERE segments.date BETWEEN '" + gaqlStart + "' AND '" + gaqlEnd + "'";

  var iter2 = AdsApp.search(geoQuery);

  var unknownIds = {};
  while (iter2.hasNext()) {
    var r = iter2.next();
    var date = r.segments && r.segments.date;
    if (!date) continue;
    var countryId = String(
      (r.userLocationView && r.userLocationView.countryCriterionId) || ""
    ).trim();
    var code  = COUNTRY_ID_TO_CODE[countryId];
    var spend = ((r.metrics && r.metrics.costMicros) || 0) / 1000000;

    if (!code) {
      if (spend > 0) {
        unknownIds[countryId] = (unknownIds[countryId] || 0) + spend;
      }
      continue;
    }

    if (!byDate[date]) byDate[date] = {};
    if (!byDate[date][code]) byDate[date][code] = emptyBucket();
    addTo(
      byDate[date][code],
      spend,
      Number((r.metrics && r.metrics.clicks)      || 0),
      Number((r.metrics && r.metrics.impressions) || 0),
      Number((r.metrics && r.metrics.conversions) || 0)
    );
  }

  // Troubleshooting: log onbekende country-id's zodat je ze kan toevoegen
  var unknownKeys = Object.keys(unknownIds);
  if (unknownKeys.length > 0) {
    Logger.log("⚠ GEO rows met niet-gemapte CountryCriteriaId (voeg toe aan COUNTRY_ID_TO_CODE):");
    for (var k = 0; k < unknownKeys.length; k++) {
      Logger.log("  → id=" + unknownKeys[k] + " (€" + round2(unknownIds[unknownKeys[k]]) + ")");
    }
  }

  // ── Payload bouwen ────────────────────────────────────────────────────
  var payload = [];
  var dates = Object.keys(byDate);
  for (var i = 0; i < dates.length; i++) {
    var date = dates[i];
    var countries = Object.keys(byDate[date]);
    for (var j = 0; j < countries.length; j++) {
      var c = countries[j];
      var d = byDate[date][c];
      if (d.spend === 0 && d.clicks === 0) continue;
      payload.push({
        store_id:    STORE_ID,
        date:        date,
        country:     c,
        spend:       round2(d.spend),
        clicks:      d.clicks,
        impressions: d.impressions,
        conversions: round2(d.conversions),
        cpc:         d.clicks > 0      ? round2(d.spend / d.clicks)               : 0,
        ctr:         d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
        roas:        0 // Sentinel berekent ROAS zelf vanuit Shopify orders
      });
    }
  }

  if (payload.length === 0) {
    Logger.log("Geen spend data gevonden.");
    return;
  }

  var response = UrlFetchApp.fetch(SENTINEL_API + "/api/ads/import", {
    method:             "post",
    contentType:        "application/json",
    payload:            JSON.stringify({ rows: payload }),
    muteHttpExceptions: true
  });

  Logger.log(
    "✅ Sentinel sync klaar (Dorevy, geo-view) — " + payload.length +
    " rijen voor " + dates.length + " dagen. HTTP status: " + response.getResponseCode()
  );
}
