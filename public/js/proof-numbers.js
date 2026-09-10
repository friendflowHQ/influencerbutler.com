/**
 * Live "proof of numbers" counter for the homepage.
 *
 * Fetches aggregate totals from /api/proof-numbers and, if the feature is on and
 * returns numbers, reveals the #live-numbers band and animates each
 * [data-proof] value counting up from zero. Re-polls every 45s so the numbers
 * visibly tick up on a long-open tab. If the fetch fails or the feature is off,
 * the band stays hidden (it starts with the hidden attribute), so nothing
 * fabricated is ever shown. Fails silent.
 *
 * The values are genuine cumulative counts from the app and extension plus an
 * admin-set baseline offset, computed server-side; this script only displays
 * whatever the API returns.
 */
(function () {
  "use strict";

  var POLL_MS = 45000;
  var ANIM_MS = 1100;
  // Highest value shown per metric so far, so a re-poll only ever animates
  // upward (never jumps backward if a cached response lands out of order).
  var shown = {};

  function fmt(n) {
    try {
      return Number(n).toLocaleString("en-US");
    } catch (e) {
      return String(n);
    }
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animate(node, from, to) {
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / ANIM_MS);
      var value = Math.round(from + (to - from) * easeOut(p));
      node.textContent = fmt(value);
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  function apply(metrics) {
    var band = document.getElementById("live-numbers");
    if (!band) return;
    var any = false;

    for (var i = 0; i < metrics.length; i++) {
      var m = metrics[i];
      if (!m || typeof m.key !== "string") continue;
      var value = Number(m.value);
      if (!isFinite(value) || value < 0) continue;

      var valueNode = band.querySelector('[data-proof="' + m.key + '"]');
      if (valueNode && value >= 0) {
        var from = typeof shown[m.key] === "number" ? shown[m.key] : 0;
        if (value >= from) {
          animate(valueNode, from, value);
          shown[m.key] = value;
        }
        // Only reveal the band once there is a real number to show, so an
        // all-zero state (no baseline set yet, no data) stays hidden like the
        // recent-activity widget does.
        if (value > 0) any = true;
      }
      if (m.label) {
        var labelNode = band.querySelector('[data-proof-label="' + m.key + '"]');
        if (labelNode) labelNode.textContent = m.label;
      }
    }

    // Reveal only once we actually have a number to show.
    if (any && band.hidden) band.hidden = false;
  }

  function load() {
    fetch("/api/proof-numbers", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || data.enabled === false) return; // keep band hidden
        var list = Array.isArray(data.metrics) ? data.metrics : [];
        if (list.length === 0) return;
        apply(list);
      })
      .catch(function () { /* keep band hidden */ });
  }

  function init() {
    load();
    // Only keep polling while the tab is visible, to avoid needless requests.
    setInterval(function () {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
