/*
 * Price lock banner (Nov 12 - Nov 30 2026). Self-contained, no dependencies.
 *
 * Until the deadline (Mon Nov 30 2026, 11:59pm Pacific) it shows a slim banner
 * at the top of every public page: "Prices go up Nov 30. Lock today's price
 * forever." with a live countdown and a trial button. From the deadline on it
 * removes itself and swaps any <span data-ib-price="..."> to the new price, so
 * nothing has to change by hand at midnight.
 *
 * Loaded by src/app/layout.tsx (Next.js pages) and injected into every static
 * public/*.html page by scripts/inject-price-lock.mjs. The dashboard has its
 * own audience-aware banner, so this one skips /dashboard.
 */
(function () {
  "use strict";
  var END = Date.parse("2026-12-01T08:00:00Z"); // = Nov 30 2026 11:59:59pm PST + 1s
  var DISMISS_KEY = "ib_price_lock_dismissed_day";

  // New prices for static copy, keyed by data-ib-price.
  var NEXT = {
    "beginner-solo-monthly": "$29.99",
    "beginner-solo-annual": "$299",
    "beginner-trio-monthly": "$53.99",
    "beginner-trio-annual": "$539",
    "beginner-agency-monthly": "$239",
    "beginner-agency-annual": "$2,390",
    "power-solo-monthly": "$49",
    "power-solo-annual": "$490",
    "power-trio-monthly": "$83",
    "power-trio-annual": "$830",
    "power-team-monthly": "$155",
    "power-team-annual": "$1,550",
    "power-agency-monthly": "$359",
    "power-agency-annual": "$3,590"
  };

  function now() {
    return Date.now();
  }

  // Legacy Pro list prices that marketing pages still quote. New buyers on those
  // plans get Power User at the new price after the deadline, so the quoted
  // number follows. "$390" right after "(" is a competitor's annual price on a
  // compare page and is left alone.
  var LEGACY_TEXT = [
    [/\$2,990(?!\d|[.,]\d)/g, "$3,590"],
    [/\$1,290(?!\d|[.,]\d)/g, "$1,550"],
    [/\$690(?!\d|[.,]\d)/g, "$830"],
    [/\$390(?!\d|[.,]\d)/g, "$490"],
    [/\$299(?!\d|[.,]\d)/g, "$359"],
    [/\$129(?!\d|[.,]\d)/g, "$155"],
    [/\$69(?!\d|[.,]\d)/g, "$83"],
    [/\$39(?!\d|[.,]\d)/g, "$49"]
  ];

  function swapText(text) {
    var out = text;
    for (var i = 0; i < LEGACY_TEXT.length; i++) {
      out = out.replace(LEGACY_TEXT[i][0], function (match, offset, whole) {
        return whole.charAt(offset - 1) === "(" ? match : LEGACY_TEXT[i][1];
      });
    }
    return out;
  }

  function swapPrices() {
    // The dashboard shows a subscriber's OWN price and /pricing computes its
    // own: never rewrite those.
    if (/^\/(dashboard|pricing)(\/|$)/.test(window.location.pathname)) return;
    var nodes = document.querySelectorAll("[data-ib-price]");
    for (var i = 0; i < nodes.length; i++) {
      var next = NEXT[nodes[i].getAttribute("data-ib-price")];
      if (next) nodes[i].textContent = next;
    }
    // Monthly/annual toggles keep their prices in data attributes.
    var toggles = document.querySelectorAll("[data-monthly],[data-annual]");
    for (var t = 0; t < toggles.length; t++) {
      ["data-monthly", "data-annual"].forEach(function (attr) {
        var v = toggles[t].getAttribute(attr);
        if (v) toggles[t].setAttribute(attr, swapText(v));
      });
    }
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === "SCRIPT" || p === "STYLE" || p === "NOSCRIPT" || p === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        return /\$\d/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var batch = [];
    while (walker.nextNode()) batch.push(walker.currentNode);
    for (var b = 0; b < batch.length; b++) {
      var swapped = swapText(batch[b].nodeValue);
      if (swapped !== batch[b].nodeValue) batch[b].nodeValue = swapped;
    }
    var hide = document.querySelectorAll("[data-ib-price-lock-only]");
    for (var j = 0; j < hide.length; j++) hide[j].style.display = "none";
  }

  function pacificDay() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function dismissedToday() {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === pacificDay();
    } catch (e) {
      return false;
    }
  }

  function remember() {
    try {
      window.localStorage.setItem(DISMISS_KEY, pacificDay());
    } catch (e) {
      /* private mode: dismiss for this page view only */
    }
  }

  function left(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (d > 0) return d + "d " + h + "h " + m + "m";
    return h + "h " + (m < 10 ? "0" : "") + m + "m " + (sec < 10 ? "0" : "") + sec + "s";
  }

  function mount() {
    if (now() >= END) {
      swapPrices();
      return;
    }
    if (/^\/dashboard(\/|$)/.test(window.location.pathname)) return;
    if (document.getElementById("ib-price-lock-banner")) return;
    if (dismissedToday()) return;

    var bar = document.createElement("div");
    bar.id = "ib-price-lock-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Price change notice");
    bar.style.cssText =
      "position:relative;z-index:60;background:#9a3412;color:#fff;font:600 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "padding:10px 44px 10px 16px;text-align:center;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:center;";

    var msg = document.createElement("span");
    msg.textContent = "Prices go up Nov 30. Lock today's price forever.";

    var clock = document.createElement("span");
    clock.style.cssText = "font-variant-numeric:tabular-nums;font-weight:500;opacity:.95;";

    var cta = document.createElement("a");
    cta.href = "/pricing?src=pl-banner";
    cta.textContent = "Start free trial";
    cta.style.cssText =
      "background:#fff;color:#9a3412;border-radius:999px;padding:5px 14px;text-decoration:none;font-weight:700;white-space:nowrap;";

    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss price notice");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;";
    close.addEventListener("click", function () {
      remember();
      removeBar();
    });

    bar.appendChild(msg);
    bar.appendChild(clock);
    bar.appendChild(cta);
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);

    // Pages with a FIXED header at the very top (compare, guides, features)
    // would cover an in-flow banner. Pin the banner above them instead and
    // push the header and the page down by the banner's height.
    var shifted = [];
    var basePad = parseFloat(window.getComputedStyle(document.body).paddingTop) || 0;
    function layout() {
      var h = bar.offsetHeight;
      var fixedTop = [];
      var all = document.body.querySelectorAll("header, nav, [class*='header'], [class*='navbar']");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el === bar || bar.contains(el)) continue;
        var cs = window.getComputedStyle(el);
        if (cs.position === "fixed" && (parseFloat(cs.top) || 0) <= h + 1 && el.getBoundingClientRect().top <= h + 1) fixedTop.push(el);
      }
      if (fixedTop.length === 0 && shifted.length === 0) return;
      bar.style.position = "fixed";
      bar.style.top = "0";
      bar.style.left = "0";
      bar.style.right = "0";
      bar.style.zIndex = "2147483000";
      for (var j = 0; j < fixedTop.length; j++) {
        if (shifted.indexOf(fixedTop[j]) === -1) shifted.push(fixedTop[j]);
      }
      for (var k = 0; k < shifted.length; k++) shifted[k].style.top = h + "px";
      document.body.style.paddingTop = basePad + h + "px";
    }
    function unlayout() {
      for (var k = 0; k < shifted.length; k++) shifted[k].style.top = "";
      if (shifted.length) document.body.style.paddingTop = basePad ? basePad + "px" : "";
      shifted = [];
    }
    layout();
    window.addEventListener("resize", layout);
    var removeBar = function () {
      unlayout();
      window.removeEventListener("resize", layout);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    };

    function tick() {
      var ms = END - now();
      if (ms <= 0) {
        removeBar();
        swapPrices();
        return;
      }
      clock.textContent = left(ms) + " left";
      window.setTimeout(tick, ms < 86400000 ? 1000 : 30000);
    }
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
