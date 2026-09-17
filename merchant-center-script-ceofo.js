/**
 * SENTINEL — Google Ads Script voor CEOFO / Melvoire
 * ────────────────────────────────────────────────────
 * Sectie 1: Dagelijkse totalen per land (campaign-level)  → /api/ads/import
 * Sectie 2: Per-product data                              → /api/ads/products/import
 *   – Probeert eerst shopping_performance_view (PMax/Shopping)
 *   – Val terug op ad-group niveau als Search-only account (Melvoire)
 *
 * Frequentie: Dagelijks
 */

var SENTINEL_API = "https://sentinel-api.tssheets1.workers.dev";
var STORE_ID     = "ceofo";
var DAYS_BACK    = 90;

// Detecteer campagne-categorie op naam (pas aan op jouw campaign-namen)
var CAMPAIGN_CATEGORIES = [
  { keywords: ["fashion", "mode", "vêtement", "vetement", "kleding", "clothing"], label: "Fashion" },
  { keywords: ["kids", "kind", "kinderen", "enfant", "enfants", "children", "baby", "toys", "jouets", "speelgoed"], label: "Kids" },
];

function detectCampaignCategory(name) {
  var lower = name.toLowerCase();
  for (var i = 0; i < CAMPAIGN_CATEGORIES.length; i++) {
    for (var j = 0; j < CAMPAIGN_CATEGORIES[i].keywords.length; j++) {
      if (lower.indexOf(CAMPAIGN_CATEGORIES[i].keywords[j]) !== -1) return CAMPAIGN_CATEGORIES[i].label;
    }
  }
  return "";
}

var COUNTRY_RULES = [
  { keywords: ["france", "frankrijk", "français", "française", "_fr_", "-fr-", "|fr|", " fr "], code: "FR" },
  { keywords: ["spain", "spanje", "espagne", "español", "_es_", "-es-", "|es|", " es "],        code: "ES" },
  { keywords: ["italy", "italië", "italie", "italiano", "_it_", "-it-", "|it|", " it "],        code: "IT" },
  { keywords: ["belgium", "belgique", "belgië", "_be_", "-be-"],                                code: "BE" },
  { keywords: ["netherlands", "nederland", "pays-bas", "_nl_", "-nl-"],                         code: "NL" },
  { keywords: ["united kingdom", "uk", "_uk_", "-uk-"],                                         code: "UK" },
];

var BRAND_RE = /\s*-\s*(martaline|ceofo|dorevy|melvoire)\s*$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectCountry(name) {
  var lower = name.toLowerCase();
  for (var i = 0; i < COUNTRY_RULES.length; i++) {
    for (var j = 0; j < COUNTRY_RULES[i].keywords.length; j++) {
      if (lower.indexOf(COUNTRY_RULES[i].keywords[j]) !== -1) return COUNTRY_RULES[i].code;
    }
  }
  return null;
}

function normaliseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[1] + "-" + m[2];
  try { var d = new Date(raw); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); } catch(e) { return null; }
}

function parseNum(s) {
  return parseFloat(String(s || 0).replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
}

function round2(n) { return Math.round(n * 100) / 100; }

function postRows(endpoint, rows) {
  if (rows.length === 0) return;
  var BATCH = 500;
  for (var b = 0; b < rows.length; b += BATCH) {
    var resp = UrlFetchApp.fetch(SENTINEL_API + endpoint, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({ rows: rows.slice(b, b + BATCH) }),
      muteHttpExceptions: true,
    });
    Logger.log(endpoint + " batch " + (Math.floor(b / BATCH) + 1) + " → HTTP " + resp.getResponseCode());
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  var tz       = AdsApp.currentAccount().getTimeZone();
  var endDate  = new Date();
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_BACK);
  var startStr  = Utilities.formatDate(startDate, tz, "yyyy-MM-dd");
  var endStr    = Utilities.formatDate(endDate,   tz, "yyyy-MM-dd");
  var duringStr = Utilities.formatDate(startDate, tz, "yyyyMMdd") + "," +
                  Utilities.formatDate(endDate,   tz, "yyyyMMdd");

  // ── 1. Dagelijkse totalen per land + per campaign-categorie ─────────────
  var byDate = {};    // { date: { country: { spend, clicks, ... } } }
  var byCamp = {};    // { date: { campaign: { spend, clicks, ... } } }
  var report = AdsApp.report(
    "SELECT CampaignName, Date, Cost, Clicks, Impressions, Conversions " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT DURING " + duringStr
  );
  var iter = report.rows();
  while (iter.hasNext()) {
    var r       = iter.next();
    var date    = normaliseDate(r["Date"] || r["day"] || "");
    if (!date) continue;
    var country  = detectCountry(r["CampaignName"] || "");
    var campCat  = detectCampaignCategory(r["CampaignName"] || "");
    var spend    = parseNum(r["Cost"]);
    var clicks   = Math.round(parseNum(r["Clicks"]));
    var impr     = Math.round(parseNum(r["Impressions"]));
    var conv     = parseNum(r["Conversions"]);
    // per-country totals (unchanged)
    if (!byDate[date]) byDate[date] = {};
    ["", country].forEach(function(c) {
      if (c === null) return;
      if (!byDate[date][c]) byDate[date][c] = { spend:0, clicks:0, impressions:0, conversions:0 };
      byDate[date][c].spend       += spend;
      byDate[date][c].clicks      += clicks;
      byDate[date][c].impressions += impr;
      byDate[date][c].conversions += conv;
    });
    // per-campaign totals (only when we know the category)
    if (campCat) {
      if (!byCamp[date]) byCamp[date] = {};
      if (!byCamp[date][campCat]) byCamp[date][campCat] = { spend:0, clicks:0, impressions:0, conversions:0 };
      byCamp[date][campCat].spend       += spend;
      byCamp[date][campCat].clicks      += clicks;
      byCamp[date][campCat].impressions += impr;
      byCamp[date][campCat].conversions += conv;
    }
  }
  var dailyRows = [];
  Object.keys(byDate).forEach(function(date) {
    Object.keys(byDate[date]).forEach(function(c) {
      var d = byDate[date][c];
      if (d.spend === 0 && d.clicks === 0) return;
      dailyRows.push({
        store_id: STORE_ID, date: date, country: c,
        spend: round2(d.spend), clicks: d.clicks, impressions: d.impressions,
        conversions: round2(d.conversions),
        cpc:  d.clicks      > 0 ? round2(d.spend / d.clicks)               : 0,
        ctr:  d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
        roas: 0,
      });
    });
  });
  // per-campaign rows toevoegen
  Object.keys(byCamp).forEach(function(date) {
    Object.keys(byCamp[date]).forEach(function(camp) {
      var d = byCamp[date][camp];
      if (d.spend === 0 && d.clicks === 0) return;
      dailyRows.push({
        store_id: STORE_ID, date: date, country: "", campaign: camp,
        spend: round2(d.spend), clicks: d.clicks, impressions: d.impressions,
        conversions: round2(d.conversions),
        cpc:  d.clicks      > 0 ? round2(d.spend / d.clicks)               : 0,
        ctr:  d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
        roas: 0,
      });
    });
  });
  postRows("/api/ads/import", dailyRows);
  Logger.log("✅ Daily totals: " + dailyRows.length + " rijen incl. campaign-splits (" + DAYS_BACK + " dagen)");

  // ── 2. Per-product data ───────────────────────────────────────────────────
  var byProduct = {};
  var shoppingFound = false;

  // Poging 1: Shopping / PMax (werkt als er een Merchant Center feed actief is)
  try {
    var shopReport = AdsApp.search(
      "SELECT segments.product_title, segments.date, " +
      "metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
      "FROM shopping_performance_view " +
      "WHERE segments.date BETWEEN '" + startStr + "' AND '" + endStr + "' " +
      "  AND metrics.impressions > 0"
    );
    while (shopReport.hasNext()) {
      var s     = shopReport.next();
      var title = (s.segments.productTitle || "").replace(BRAND_RE, "").trim();
      var date  = s.segments.date;
      if (!title || !date) continue;
      var key = title + "|" + date;
      if (!byProduct[key]) byProduct[key] = { title:title, date:date, spend:0, clicks:0, impressions:0, conversions:0 };
      byProduct[key].spend       += (s.metrics.costMicros || 0) / 1e6;
      byProduct[key].clicks      += parseInt(s.metrics.clicks      || 0, 10);
      byProduct[key].impressions += parseInt(s.metrics.impressions || 0, 10);
      byProduct[key].conversions += parseFloat(s.metrics.conversions || 0);
      shoppingFound = true;
    }
  } catch(e) {
    Logger.log("⚠ shopping_performance_view overgeslagen: " + e);
  }

  // Poging 2: Ad-group niveau (fallback voor Search-only accounts zoals Melvoire)
  // Gebruikt de ad-group naam als product-proxy.
  if (!shoppingFound) {
    Logger.log("ℹ Geen Shopping/PMax data — gebruik ad-group niveau als product-proxy");
    try {
      var agReport = AdsApp.search(
        "SELECT ad_group.name, segments.date, " +
        "metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
        "FROM ad_group " +
        "WHERE segments.date BETWEEN '" + startStr + "' AND '" + endStr + "' " +
        "  AND metrics.impressions > 0 " +
        "  AND campaign.advertising_channel_type = 'SEARCH' " +
        "  AND ad_group.status = 'ENABLED'"
      );
      while (agReport.hasNext()) {
        var ag    = agReport.next();
        var title = (ag.adGroup.name || "").replace(BRAND_RE, "").trim();
        var date  = ag.segments.date;
        if (!title || !date) continue;
        var key = title + "|" + date;
        if (!byProduct[key]) byProduct[key] = { title:title, date:date, spend:0, clicks:0, impressions:0, conversions:0 };
        byProduct[key].spend       += (ag.metrics.costMicros || 0) / 1e6;
        byProduct[key].clicks      += parseInt(ag.metrics.clicks      || 0, 10);
        byProduct[key].impressions += parseInt(ag.metrics.impressions || 0, 10);
        byProduct[key].conversions += parseFloat(ag.metrics.conversions || 0);
      }
    } catch(e2) {
      Logger.log("⚠ Ad-group fallback mislukt: " + e2);
    }
  }

  var productRows = [];
  Object.keys(byProduct).forEach(function(k) {
    var d = byProduct[k];
    if (d.spend === 0 && d.clicks === 0) return;
    productRows.push({
      store_id:      STORE_ID,
      product_title: d.title,
      date:          d.date,
      spend:         round2(d.spend),
      clicks:        d.clicks,
      impressions:   d.impressions,
      conversions:   round2(d.conversions),
      cpc:           d.clicks      > 0 ? round2(d.spend / d.clicks)               : 0,
      ctr:           d.impressions > 0 ? round2((d.clicks / d.impressions) * 100) : 0,
    });
  });

  postRows("/api/ads/products/import", productRows);
  Logger.log(
    "✅ Product stats: " + productRows.length + " rijen (" +
    (shoppingFound ? "Shopping/PMax data" : "ad-group fallback") + ")"
  );
}
