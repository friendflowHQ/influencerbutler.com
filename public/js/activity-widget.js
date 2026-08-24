/**
 * Recent-activity social-proof popup.
 *
 * Bottom-right card that cycles through recent trial clicks and purchases
 * fetched from /api/activity/recent. Shows location + how long ago. Visitors can
 * dismiss it for the session. Renders nothing when the feature is off, when
 * there is no recent activity, or when already dismissed. Fails silent.
 *
 * Self-contained: injects its own CSS so it works on any page that loads it.
 */
(function () {
  "use strict";

  var DISMISS_KEY = "ibActivityDismissed";
  var POS_KEY = "ibActivityPos"; // rotating start offset, persisted across page loads
  var FIRST_DELAY_MS = 2500; // let the page settle before the first card
  var CYCLE_MS = 6000; // time each event stays up

  // Marketing social proof is for prospects, not people already signed in. Skip
  // the authenticated app area so the "someone is checking this out" card never
  // pops up inside a paying customer's dashboard.
  var SKIP_PREFIXES = ["/dashboard"];

  function onAppSurface() {
    var path = "";
    try {
      path = window.location.pathname || "";
    } catch (_) {
      return false;
    }
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      if (path === SKIP_PREFIXES[i] || path.indexOf(SKIP_PREFIXES[i] + "/") === 0) {
        return true;
      }
    }
    return false;
  }

  function dismissed() {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setDismissed() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch (_) { /* private mode - ignore */ }
  }

  // Where in the event list to open this page load. Persisted and advanced by one
  // each load so consecutive pages continue through the rotation instead of
  // restarting on the same (often oldest, purchase-first) card every time. Without
  // this, a visitor clicking around faster than the full cycle only ever sees the
  // one or two leading cards and never reaches the fresher "checking out" events.
  function nextStartIndex(len) {
    if (len <= 1) return 0;
    var pos = 0;
    try {
      var raw = parseInt(window.sessionStorage.getItem(POS_KEY), 10);
      if (!isNaN(raw) && raw >= 0) pos = raw;
      window.sessionStorage.setItem(POS_KEY, String((pos + 1) % len));
    } catch (_) { /* private mode - start at 0, no persistence */ }
    return pos % len;
  }

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var s = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  function locationText(e) {
    var parts = [];
    if (e.city) parts.push(e.city);
    if (e.region && e.region !== e.city) parts.push(e.region);
    var s = parts.join(", ");
    if (!s && e.country) s = e.country;
    return s;
  }

  function headline(e) {
    var where = locationText(e);
    if (e.kind === "purchase") {
      var who = e.firstName ? e.firstName : "Someone";
      // Purchases get a longer lookback than trial clicks, so only claim
      // "just" when the purchase is under a day old.
      var then = new Date(e.createdAt).getTime();
      var fresh = !isNaN(then) && Date.now() - then < 24 * 60 * 60 * 1000;
      return who + (where ? " from " + where : "") + (fresh ? " just subscribed" : " recently subscribed");
    }
    // Soft, browsing-level wording for trial-interest events (covers seeded
    // demo activity too): no claim that anything was completed or verified.
    return "Someone" + (where ? " in " + where : "") + " is checking out Influencer Butler";
  }

  function injectStyles() {
    if (document.getElementById("ib-activity-style")) return;
    var style = document.createElement("style");
    style.id = "ib-activity-style";
    style.textContent =
      "#ib-activity{position:fixed;right:20px;bottom:20px;z-index:9998;" +
        "width:320px;max-width:calc(100vw - 32px);" +
        "font:13px/1.45 'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "transform:translateY(16px);opacity:0;pointer-events:none;" +
        "transition:transform .35s ease}" +
      "#ib-activity.is-visible{transform:translateY(0);opacity:1;pointer-events:auto}" +
      "@media (prefers-reduced-motion:reduce){#ib-activity{transition:none;transform:none}}" +
      ".ib-activity__card{position:relative;display:flex;gap:11px;align-items:flex-start;" +
        "background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:13px 15px;" +
        "box-shadow:0 12px 30px rgba(15,23,42,.16)}" +
      ".ib-activity__icon{flex:none;width:34px;height:34px;border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;font-size:17px;" +
        "background:#fff7ed}" +
      ".ib-activity__body{min-width:0;padding-right:14px}" +
      ".ib-activity__msg{color:#111827;font-weight:600}" +
      ".ib-activity__time{color:#6b7280;font-size:11.5px;margin-top:3px}" +
      ".ib-activity__close{position:absolute;top:7px;right:9px;border:0;background:none;" +
        "cursor:pointer;color:#6b7280;font-size:17px;line-height:1;padding:2px}" +
      ".ib-activity__close:hover{color:#4b5563}";
    document.head.appendChild(style);
  }

  function buildCard() {
    var root = document.createElement("div");
    root.id = "ib-activity";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML =
      '<div class="ib-activity__card">' +
        '<button class="ib-activity__close" type="button" aria-label="Dismiss">×</button>' +
        '<div class="ib-activity__icon" id="ib-activity-icon">🎉</div>' +
        '<div class="ib-activity__body">' +
          '<div class="ib-activity__msg" id="ib-activity-msg"></div>' +
          '<div class="ib-activity__time" id="ib-activity-time"></div>' +
        "</div>" +
      "</div>";
    document.body.appendChild(root);
    root.querySelector(".ib-activity__close").addEventListener("click", function () {
      setDismissed();
      hide(root);
      window.setTimeout(function () { root.remove(); }, 400);
    });
    return root;
  }

  function show(root) { root.classList.add("is-visible"); }
  function hide(root) { root.classList.remove("is-visible"); }

  function render(root, e) {
    root.querySelector("#ib-activity-icon").textContent = e.kind === "purchase" ? "🛒" : "🎉";
    root.querySelector("#ib-activity-msg").textContent = headline(e);
    root.querySelector("#ib-activity-time").textContent = timeAgo(e.createdAt);
  }

  function run(events) {
    injectStyles();
    var root = buildCard();
    var i = nextStartIndex(events.length);
    function step() {
      if (!document.body.contains(root)) return;
      render(root, events[i]);
      show(root);
      if (events.length > 1) {
        window.setTimeout(function () {
          hide(root);
          window.setTimeout(function () {
            i = (i + 1) % events.length;
            step();
          }, 450);
        }, CYCLE_MS);
      }
    }
    window.setTimeout(step, FIRST_DELAY_MS);
  }

  function init() {
    if (onAppSurface()) return;
    if (dismissed()) return;
    fetch("/api/activity/recent", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.enabled) return;
        var events = Array.isArray(data.events) ? data.events : [];
        if (events.length === 0) return;
        run(events);
      })
      .catch(function () { /* fail silent */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
