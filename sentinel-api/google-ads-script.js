/**
 * SENTINEL — Google Ads Auto-Sync Script (met land-segmentatie)
 * ─────────────────────────────────────────────────────────────
 * Instellen:
 *  1. Ga naar ads.google.com → rechtsboven Instellingen (⚙) → Scripts
 *  2. Klik op + (nieuw script) of open het bestaande
 *  3. Plak deze volledige code
 *  4. Pas STORE_ID aan ("ceofo" / "dorevy" / "martaline")
 *  5. Controleer dat je campagne-namen herkend worden (zie COUNTRY_RULES)
 *  6. Klik "Autoriseren" en "Opslaan"
 *  7. Zet frequentie op "Dagelijks" (rechts naast het script)
 *
 * Het script stuurt per dag:
 *  - Één totaalrij (voor het globale dashboard)
 *  - Één rij per land (voor de land-tabs in de ROAS tracker)
 * ─────────────────────────────────────────────────────────────
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "ceofo"; // ← aanpassen: "ceofo" / "dorevy" / "martaline"

// ── Land-detectie vanuit campagne-naam ───────────────────────────────────────
// Voeg hier je eigen campagne-keywords toe als ze er niet bij staan.
// Volgorde maakt uit: eerste match wint.
var COUNTRY_RULES = [
  { keywords: ["france", "frankrijk", "français", "française", "_fr_", "-fr-", "|fr|", " fr "], code: "FR" },
  { keywords: ["spain", "spanje", "espagne", "español", "_es_", "-es-", "|es|", " es "],        code: "ES" },
  { keywords: ["italy", "italië", "italie", "italiano", "_it_", "-it-", "|it|", " it "],        code: "IT" },
  { keywords: ["canada", "_ca_", "-ca-", "|ca|", " ca "],                                       code: "CA" },
  { keywords: ["united states", "usa", "_us_", "-us-", "|us|", " us "],                         code: "US" },
  { keywords: ["belgium", "belgique", "belgië", "_be_", "-be-"],                                code: "BE" },
  { keywords: ["netherlands", "nederland", "pays-bas", "_nl_", "-nl-"],                         code: "NL" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return null; // land niet herkend
}

function normaliseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();
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
  return parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
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

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // byDate[date][country] — country "" = grand total; "FR"/"ES"/etc. = per land
  var byDate = {};

  // Datumbereik: vandaag t/m 90 dagen geleden (AWQL formaat: yyyyMMdd)
  var tz        = AdsApp.currentAccount().getTimeZone();
  var endDate   = new Date(); // vandaag (data t/m nu)
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  var dateRange = Utilities.formatDate(startDate, tz, "yyyyMMdd") + "," +
                  Utilities.formatDate(endDate,   tz, "yyyyMMdd");

  var report = AdsApp.report(
    "SELECT CampaignName, Date, Cost, Clicks, Impressions, Conversions " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    "DURING " + dateRange
  );

  var unknownCampaigns = {};
  var iter = report.rows();

  while (iter.hasNext()) {
    var r = iter.next();
    var date = normaliseDate(r["Date"] || r["day"] || "");
    if (!date) continue;

    var campaignName = r["CampaignName"] || "";
    var country      = detectCountry(campaignName);
    var spend        = parseNum(r["Cost"]);
    var clicks       = Math.round(parseNum(r["Clicks"]));
    var impressions  = Math.round(parseNum(r["Impressions"]));
    var conversions  = parseNum(r["Conversions"]);

    if (!byDate[date]) byDate[date] = {};

    // Totaalrij (country='') — altijd bijhouden voor het globale dashboard
    if (!byDate[date][""]) byDate[date][""] = emptyBucket();
    addTo(byDate[date][""], spend, clicks, impressions, conversions);

    // Per-land rij — alleen als land herkend
    if (country) {
      if (!byDate[date][country]) byDate[date][country] = emptyBucket();
      addTo(byDate[date][country], spend, clicks, impressions, conversions);
    } else {
      // Log campagnes zonder land-herkenning (alleen eerste datum)
      if (spend > 0 && !unknownCampaigns[campaignName]) {
        unknownCampaigns[campaignName] = spend;
      }
    }
  }

  // Rapporteer ongekende campagnes (handig voor troubleshooting)
  var unknownNames = Object.keys(unknownCampaigns);
  if (unknownNames.length > 0) {
    Logger.log("⚠ Campagnes zonder land-herkenning (voeg keywords toe aan COUNTRY_RULES):");
    for (var k = 0; k < unknownNames.length; k++) {
      Logger.log("  → " + unknownNames[k] + " (€" + round2(unknownCampaigns[unknownNames[k]]) + ")");
    }
  }

  // Bouw payload
  var payload = [];
  var dates = Object.keys(byDate);
  for (var i = 0; i < dates.length; i++) {
    var date     = dates[i];
    var countries = Object.keys(byDate[date]);
    for (var j = 0; j < countries.length; j++) {
      var c = countries[j];
      var d = byDate[date][c];
      if (d.spend === 0 && d.clicks === 0) continue; // lege dag overslaan
      payload.push({
        store_id:    STORE_ID,
        date:        date,
        country:     c,                 // "" = totaal, "FR"/"ES"/etc. = per land
        spend:       round2(d.spend),
        clicks:      d.clicks,
        impressions: d.impressions,
        conversions: round2(d.conversions),
        cpc:         d.clicks > 0      ? round2(d.spend / d.clicks)               : 0,
        ctr:         d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
        roas:        0, // Sentinel berekent ROAS zelf vanuit Shopify orders
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
    muteHttpExceptions: true,
  });

  Logger.log(
    "✅ Sentinel sync klaar — " + payload.length + " rijen (totaal + per land) voor " + dates.length + " dagen. " +
    "HTTP status: " + response.getResponseCode()
  );
}
