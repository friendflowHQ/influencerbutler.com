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

  function parts(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return {
      d: Math.floor(s / 86400),
      h: Math.floor((s % 86400) / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60
    };
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  var CSS =
    "#ib-price-lock-banner{position:relative;z-index:60;overflow:hidden;color:#fff;" +
    "font:500 14px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "background:radial-gradient(circle at 12% 30%,rgba(251,191,36,.18) 0 2px,transparent 3px)," +
    "radial-gradient(circle at 78% 70%,rgba(249,115,22,.22) 0 2px,transparent 3px)," +
    "radial-gradient(circle at 45% 15%,rgba(255,255,255,.12) 0 1.5px,transparent 2.5px)," +
    "linear-gradient(100deg,#111827 0%,#1c1336 45%,#3b1206 100%);background-size:140px 60px,180px 70px,90px 50px,100% 100%;" +
    "border-bottom:2px solid #f59e0b;padding:10px 48px 10px 16px}" +
    "#ib-price-lock-banner .ibpl-shine{position:absolute;inset:0;pointer-events:none;" +
    "background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.10) 50%,transparent 60%);background-size:250% 100%;" +
    "animation:ibpl-shine 6s ease-in-out infinite}" +
    "#ib-price-lock-banner .ibpl-row{position:relative;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 22px;max-width:1120px;margin:0 auto}" +
    "#ib-price-lock-banner .ibpl-copy{display:flex;align-items:center;gap:10px;text-align:left}" +
    "#ib-price-lock-banner .ibpl-hat{font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}" +
    "#ib-price-lock-banner .ibpl-eyebrow{display:block;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fbbf24}" +
    "#ib-price-lock-banner .ibpl-eyebrow.ibpl-urgent{color:#fca5a5;animation:ibpl-pulse 1.2s ease-in-out infinite}" +
    "#ib-price-lock-banner .ibpl-head{display:block;font-size:17px;font-weight:800;letter-spacing:-.01em}" +
    "#ib-price-lock-banner .ibpl-prices{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:#e5e7eb}" +
    "#ib-price-lock-banner .ibpl-prices i{font-style:normal;color:#cbd5e1;font-weight:500}" +
    "#ib-price-lock-banner .ibpl-prices b{color:#fde68a;font-weight:800}" +
    "#ib-price-lock-banner .ibpl-clock{display:flex;align-items:center;gap:6px}" +
    "#ib-price-lock-banner .ibpl-tile{min-width:54px;padding:5px 6px 4px;border-radius:9px;text-align:center;" +
    "background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1px solid rgba(251,191,36,.45);" +
    "box-shadow:inset 0 -2px 0 rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.25)}" +
    "#ib-price-lock-banner .ibpl-num{display:block;font-size:24px;font-weight:800;line-height:1.05;color:#fbbf24;" +
    "font-variant-numeric:tabular-nums;text-shadow:0 0 12px rgba(251,191,36,.35)}" +
    "#ib-price-lock-banner .ibpl-num.ibpl-tick{animation:ibpl-tick .35s ease-out}" +
    "#ib-price-lock-banner .ibpl-lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#e5e7eb}" +
    "#ib-price-lock-banner .ibpl-sep{font-size:20px;font-weight:800;color:rgba(251,191,36,.7);margin-top:-12px}" +
    "#ib-price-lock-banner .ibpl-cta{display:inline-flex;align-items:center;gap:6px;background:#facc15;color:#111827;" +
    "border-radius:999px;padding:9px 18px;text-decoration:none;font-weight:800;white-space:nowrap;" +
    "box-shadow:0 0 0 0 rgba(250,204,21,.6);animation:ibpl-glow 2.4s ease-in-out infinite;transition:transform .15s}" +
    "#ib-price-lock-banner .ibpl-cta:hover{transform:translateY(-1px) scale(1.03)}" +
    "#ib-price-lock-banner .ibpl-cta:focus-visible,#ib-price-lock-banner .ibpl-x:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
    "#ib-price-lock-banner .ibpl-x{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.08);" +
    "border:0;border-radius:999px;color:#fff;font-size:20px;line-height:1;width:30px;height:30px;cursor:pointer}" +
    "#ib-price-lock-banner .ibpl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    "@keyframes ibpl-shine{0%{background-position:150% 0}60%,100%{background-position:-50% 0}}" +
    "@keyframes ibpl-tick{0%{transform:translateY(-35%);opacity:.2}100%{transform:none;opacity:1}}" +
    "@keyframes ibpl-pulse{50%{opacity:.55}}" +
    "@keyframes ibpl-glow{0%,100%{box-shadow:0 0 0 0 rgba(250,204,21,.55)}50%{box-shadow:0 0 0 7px rgba(250,204,21,0)}}" +
    "@media (max-width:640px){#ib-price-lock-banner{padding:9px 40px 10px 10px}" +
    "#ib-price-lock-banner .ibpl-row{gap:8px 10px}#ib-price-lock-banner .ibpl-hat{font-size:22px}" +
    "#ib-price-lock-banner .ibpl-head{font-size:14px}#ib-price-lock-banner .ibpl-eyebrow{font-size:10px}" +
    "#ib-price-lock-banner .ibpl-prices{display:none}" +
    "#ib-price-lock-banner .ibpl-tile{min-width:40px;padding:4px 3px 3px}#ib-price-lock-banner .ibpl-num{font-size:18px}" +
    "#ib-price-lock-banner .ibpl-lbl{font-size:8px;letter-spacing:.06em}#ib-price-lock-banner .ibpl-sep{display:none}" +
    "#ib-price-lock-banner .ibpl-cta{padding:7px 12px;font-size:13px}}" +
    "@media (prefers-reduced-motion:reduce){#ib-price-lock-banner *{animation:none!important}}";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount() {
    if (now() >= END) {
      swapPrices();
      return;
    }
    // Private invite pages (/p/<code>) are one-to-one: no countdown pressure there.
    if (/^\/(dashboard|p)(\/|$)/.test(window.location.pathname)) return;
    if (document.getElementById("ib-price-lock-banner")) return;
    if (dismissedToday()) return;

    if (!document.getElementById("ib-price-lock-style")) {
      var style = el("style");
      style.id = "ib-price-lock-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    var bar = el("div");
    bar.id = "ib-price-lock-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Price change notice");
    bar.appendChild(el("div", "ibpl-shine"));

    var row = el("div", "ibpl-row");
    var copy = el("div", "ibpl-copy");
    var hat = el("span", "ibpl-hat", "🎩"); // top hat
    hat.setAttribute("aria-hidden", "true");
    var words = el("div");
    var eyebrow = el("span", "ibpl-eyebrow", "Prices go up Nov 30");
    var head = el("span", "ibpl-head", "Lock today's price forever 🔒");
    words.appendChild(eyebrow);
    words.appendChild(head);
    // "Beginner $24.99/mo now, then $29.99". No strikethrough: crossing out the
    // higher price read like a discount. Screen readers get the sentence below.
    var prices = el("span", "ibpl-prices");
    prices.setAttribute("aria-hidden", "true");
    var plans = [
      ["Beginner", "$29.99", "$24.99"],
      ["Power User", "$49", "$39"]
    ];
    for (var pi = 0; pi < plans.length; pi++) {
      if (pi > 0) prices.appendChild(document.createTextNode(" \u00b7 "));
      prices.appendChild(document.createTextNode(plans[pi][0] + " "));
      prices.appendChild(el("b", null, plans[pi][2]));
      prices.appendChild(document.createTextNode("/mo now, "));
      prices.appendChild(el("i", null, "then " + plans[pi][1]));
    }
    words.appendChild(prices);
    words.appendChild(
      el("span", "ibpl-sr", "Today: Beginner $24.99 a month, Power User $39 a month. After Nov 30: $29.99 and $49.")
    );
    copy.appendChild(hat);
    copy.appendChild(words);

    var clockWrap = el("div", "ibpl-clock");
    clockWrap.setAttribute("aria-hidden", "true");
    var units = [
      ["d", "Days"],
      ["h", "Hours"],
      ["m", "Mins"],
      ["s", "Secs"]
    ];
    var nums = {};
    for (var u = 0; u < units.length; u++) {
      if (u > 0) clockWrap.appendChild(el("span", "ibpl-sep", ":"));
      var tile = el("div", "ibpl-tile");
      nums[units[u][0]] = el("span", "ibpl-num", "00");
      tile.appendChild(nums[units[u][0]]);
      tile.appendChild(el("span", "ibpl-lbl", units[u][1]));
      clockWrap.appendChild(tile);
    }
    var srClock = el("span", "ibpl-sr");

    var cta = el("a", "ibpl-cta", "Start free trial →");
    cta.href = "/pricing?src=pl-banner";

    var close = el("button", "ibpl-x", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss price notice");
    close.addEventListener("click", function () {
      remember();
      removeBar();
    });

    row.appendChild(copy);
    row.appendChild(clockWrap);
    row.appendChild(srClock);
    row.appendChild(cta);
    bar.appendChild(row);
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

    var lastShown = {};
    var lastSr = "";
    function tick() {
      var ms = END - now();
      if (ms <= 0) {
        removeBar();
        swapPrices();
        return;
      }
      var p = parts(ms);
      for (var k in nums) {
        var v = pad(p[k]);
        if (lastShown[k] !== v) {
          nums[k].textContent = v;
          if (lastShown[k] !== undefined) {
            nums[k].classList.remove("ibpl-tick");
            void nums[k].offsetWidth; // restart the flip animation
            nums[k].classList.add("ibpl-tick");
          }
          lastShown[k] = v;
        }
      }
      if (p.d === 0) {
        eyebrow.textContent = "\u23F0 Last day: prices go up tonight";
        eyebrow.className = "ibpl-eyebrow ibpl-urgent";
      }
      var sr = p.d + " days " + p.h + " hours " + p.m + " minutes left";
      if (sr !== lastSr) {
        srClock.textContent = sr;
        lastSr = sr;
      }
      window.setTimeout(tick, 1000 - (now() % 1000) + 5);
    }
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
