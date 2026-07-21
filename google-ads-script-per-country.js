// ============================================================
// SENTINEL — Google Ads Script (per-country spend)
// Paste in: Google Ads → Tools → Scripts → + New script
// Schedule: Daily (bijv. elke dag om 06:00)
// ============================================================
//
// SETUP (pas aan per account):
// 1. Zet STORE_ID op de juiste winkel
// 2. Voeg campagne-name keywords toe als ze nog niet staan
// 3. Sla op en klik "Run" om te testen
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────────────────────

var API_URL  = "https://sentinel-api.tssheets1.workers.dev";

// Welke store is dit Google Ads account?
// Opties: "ceofo"  /  "dorevy"  /  "martaline"
var STORE_ID = "ceofo"; // <-- verander dit per account

// Detectie: als de campagne-naam één van deze woorden bevat → dat land
// Volgorde maakt uit: eerste match wint. Langere/specifiekere woorden bovenaan zetten.
var COUNTRY_RULES = [
  // ── CEOFO ────────────────────────────────────────────────
  { keywords: ["france", "français", "française", "_fr_", "-fr-", "|fr|", " fr "], code: "FR" },
  { keywords: ["spain", "espagne", "espagnol", "_es_", "-es-", "|es|", " es "],    code: "ES" },
  { keywords: ["italy", "italie", "italien", "_it_", "-it-", "|it|", " it "],      code: "IT" },
  // ── DOREVY ───────────────────────────────────────────────
  { keywords: ["canada", "_ca_", "-ca-", "|ca|"],                                  code: "CA" },
  { keywords: ["united states", "usa", "_us_", "-us-", "|us|"],                    code: "US" },
  // ── MARTALINE ────────────────────────────────────────────
  // (ook "france" / "fr" matcht hierop, geen aparte rij nodig)
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function detectCountry(campaignName) {
  var lower = campaignName.toLowerCase();
  for (var i = 0; i < COUNTRY_RULES.length; i++) {
    var rule = COUNTRY_RULES[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (lower.indexOf(rule.keywords[j]) !== -1) {
        return rule.code;
      }
    }
  }
  return ""; // geen land gevonden → gaat als totaal (zonder country-tag)
}

function dateStr(d) {
  return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

function main() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var date = dateStr(yesterday);

  Logger.log("=== Sentinel spend import voor " + STORE_ID + " op " + date + " ===");

  // Aggregeer spend per land
  var byCountry = {}; // { "FR": { spend, clicks, impressions, conversions }, ... }

  var iter = AdsApp.campaigns()
    .withCondition("Status = ENABLED")
    .get();

  while (iter.hasNext()) {
    var campaign = iter.next();
    var name     = campaign.getName();
    var country  = detectCountry(name);
    var stats    = campaign.getStatsFor(date, date);
    var spend    = stats.getCost();

    if (spend === 0) continue; // geen spend → skip

    if (!byCountry[country]) {
      byCountry[country] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    }
    byCountry[country].spend       += spend;
    byCountry[country].clicks      += stats.getClicks();
    byCountry[country].impressions += stats.getImpressions();
    byCountry[country].conversions += stats.getConversions();

    Logger.log("  " + name + " → " + (country || "TOTAAL") + " €" + spend.toFixed(2));
  }

  // Bouw de rows array
  var rows = [];
  for (var c in byCountry) {
    var s   = byCountry[c];
    var cpc = s.clicks      > 0 ? s.spend / s.clicks      : 0;
    var ctr = s.impressions > 0 ? s.clicks / s.impressions : 0;
    var roas = 0; // ROAS wordt berekend in Sentinel op basis van Shopify orders

    rows.push({
      store_id:    STORE_ID,
      date:        date,
      country:     c,           // "" = geen land-tag (totaal), "FR" / "ES" / etc. = per land
      spend:       Math.round(s.spend       * 100) / 100,
      clicks:      s.clicks,
      impressions: s.impressions,
      conversions: Math.round(s.conversions * 100) / 100,
      cpc:         Math.round(cpc           * 100) / 100,
      ctr:         Math.round(ctr           * 10000) / 10000,
      roas:        roas,
    });
  }

  if (rows.length === 0) {
    Logger.log("Geen spend data voor " + date + ". Script klaar.");
    return;
  }

  // POST naar Sentinel API
  var payload = JSON.stringify({ rows: rows });
  var response = UrlFetchApp.fetch(API_URL + "/api/ads/import", {
    method:          "POST",
    contentType:     "application/json",
    payload:         payload,
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code === 200 || code === 201) {
    Logger.log("✅ Geïmporteerd: " + rows.length + " land-rijen voor " + date);
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      Logger.log("   " + (r.country || "TOTAAL") + " → €" + r.spend + " (" + r.clicks + " clicks)");
    }
  } else {
    Logger.log("❌ API fout " + code + ": " + body);
  }
}
