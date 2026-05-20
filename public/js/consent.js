/**
 * Cookie & analytics consent banner.
 *
 * Implements Google Consent Mode v2: every consent signal defaults to
 * "denied" before gtag.js loads, then is updated based on the user's
 * choice. Replaces the inline gtag.js boot blocks that used to live on
 * every page.
 *
 * Persistence: localStorage.ibConsent = { analytics: bool, ts: ISO,
 * version: number }. Bumping CONSENT_VERSION forces the banner to
 * reappear (e.g. after a material change to what we collect).
 *
 * Honors the Global Privacy Control (GPC) browser signal as a
 * "decline" preference per CCPA/CPRA — no banner shown, no analytics
 * cookies set.
 */
(function () {
  "use strict";

  var GA_ID = "G-S1TC1QLYNN";
  var STORAGE_KEY = "ibConsent";
  var CONSENT_VERSION = 1;

  // Stand up dataLayer + gtag immediately so any consent calls below
  // queue correctly even before gtag.js finishes loading.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // ALL consent signals default to denied. Google Consent Mode v2
  // requires this to fire BEFORE gtag.js loads so pre-consent pings
  // are properly anonymized.
  gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500,
  });

  // Load gtag.js itself once consent defaults are in place.
  (function loadGtag() {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", GA_ID, { anonymize_ip: true });
  })();

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.version !== CONSENT_VERSION) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeStored(analytics) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          analytics: !!analytics,
          version: CONSENT_VERSION,
          ts: new Date().toISOString(),
        }),
      );
    } catch (_) { /* private mode / quota — fail silently */ }
  }

  function applyChoice(analytics) {
    gtag("consent", "update", {
      analytics_storage: analytics ? "granted" : "denied",
      // We never set advertising cookies; keep these denied always.
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }

  function gpcRequested() {
    try {
      return navigator.globalPrivacyControl === true;
    } catch (_) {
      return false;
    }
  }

  function injectBanner() {
    if (document.getElementById("ib-consent-banner")) return;

    var banner = document.createElement("div");
    banner.id = "ib-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute(
      "aria-label",
      "Cookie consent — choose whether to allow analytics cookies on this site",
    );
    banner.innerHTML =
      '<div class="ib-consent-banner__inner">' +
        '<p class="ib-consent-banner__copy">' +
          "We use cookies to keep the site running and, with your permission, to measure aggregate traffic. " +
          'See our <a href="/legal/cookies">Cookie Policy</a> and <a href="/legal/privacy">Privacy Policy</a>.' +
        "</p>" +
        '<div class="ib-consent-banner__buttons">' +
          '<button type="button" class="ib-consent-banner__btn ib-consent-banner__btn--secondary" id="ib-consent-reject">Reject non-essential</button>' +
          '<button type="button" class="ib-consent-banner__btn ib-consent-banner__btn--primary" id="ib-consent-accept">Accept all</button>' +
        "</div>" +
      "</div>";

    // Minimal inline CSS so the banner survives even on pages that don't
    // pull in css/styles.css (e.g. /legal pages that load legal.css only).
    var style = document.createElement("style");
    style.textContent =
      "#ib-consent-banner{" +
        "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;" +
        "background:#0f172a;color:#f8fafc;border-radius:12px;" +
        "box-shadow:0 10px 30px rgba(0,0,0,0.35);" +
        "font:14px/1.5 'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "max-width:760px;margin:0 auto;padding:14px 18px;" +
      "}" +
      "#ib-consent-banner.is-hidden{display:none}" +
      ".ib-consent-banner__inner{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}" +
      ".ib-consent-banner__copy{margin:0;flex:1 1 320px;color:#cbd5e1}" +
      ".ib-consent-banner__copy a{color:#93c5fd;text-decoration:underline}" +
      ".ib-consent-banner__buttons{display:flex;gap:8px;flex-wrap:wrap}" +
      ".ib-consent-banner__btn{" +
        "border:0;border-radius:8px;cursor:pointer;font:inherit;padding:9px 14px;" +
        "font-weight:600;letter-spacing:0.01em;" +
      "}" +
      ".ib-consent-banner__btn--primary{background:#3b82f6;color:#fff}" +
      ".ib-consent-banner__btn--primary:hover{background:#2563eb}" +
      ".ib-consent-banner__btn--secondary{background:transparent;color:#e2e8f0;border:1px solid #475569}" +
      ".ib-consent-banner__btn--secondary:hover{background:rgba(255,255,255,0.06)}" +
      "@media (max-width:480px){" +
        ".ib-consent-banner__buttons{width:100%;justify-content:stretch}" +
        ".ib-consent-banner__btn{flex:1}" +
      "}";

    document.head.appendChild(style);
    document.body.appendChild(banner);

    function dismiss(analytics) {
      writeStored(analytics);
      applyChoice(analytics);
      banner.classList.add("is-hidden");
    }
    document.getElementById("ib-consent-accept").addEventListener("click", function () { dismiss(true); });
    document.getElementById("ib-consent-reject").addEventListener("click", function () { dismiss(false); });
  }

  function init() {
    // 1) Honor browser-level Global Privacy Control as a "deny" signal —
    //    no banner, defaults stay denied, no analytics cookies.
    if (gpcRequested()) {
      writeStored(false);
      // Defaults already denied; no consent update needed.
      return;
    }

    // 2) Apply previously-saved choice silently.
    var stored = readStored();
    if (stored) {
      applyChoice(!!stored.analytics);
      return;
    }

    // 3) No choice yet → show the banner once the DOM is ready.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectBanner, { once: true });
    } else {
      injectBanner();
    }
  }

  init();

  // Expose a tiny API for /legal/cookies to call when a visitor wants
  // to revisit their choice.
  window.ibConsent = {
    revoke: function () {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      var existing = document.getElementById("ib-consent-banner");
      if (existing) existing.classList.remove("is-hidden");
      else injectBanner();
    },
    get: function () {
      return readStored();
    },
  };
})();
