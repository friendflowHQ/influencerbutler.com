/**
 * Live "proof of numbers" counter for the homepage.
 *
 * Fetches aggregate totals from /api/proof-numbers and, if the feature is on and
 * any metric has a positive total, reveals the #live-numbers band and builds one
 * stat per positive metric, animating each value up from zero. A metric that is
 * zero (no data and no baseline yet) is simply not shown. Re-polls every 45s so
 * numbers visibly tick up on a long-open tab. If the fetch fails or the feature
 * is off, the band stays hidden (it starts with the hidden attribute), so
 * nothing fabricated is ever shown. Fails silent.
 *
 * The values are genuine cumulative counts from the app and extension plus an
 * admin-set baseline offset, computed server-side; this script only displays
 * whatever the API returns.
 */
(function () {
  "use strict";

  var POLL_MS = 45000;
  var ANIM_MS = 1100;
  // Highest value shown per metric so far, so a re-poll only animates upward.
  var shown = {};
  // The value node currently on the page for each metric key.
  var nodes = {};

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

  function statNode(label) {
    var stat = document.createElement("div");
    stat.className = "proof-stat";
    var strong = document.createElement("strong");
    strong.textContent = "0";
    var span = document.createElement("span");
    span.textContent = label || "";
    stat.appendChild(strong);
    stat.appendChild(span);
    return { stat: stat, value: strong };
  }

  function render(metrics) {
    var band = document.getElementById("live-numbers");
    var host = document.getElementById("proof-stats");
    if (!band || !host) return;

    // Only metrics with a positive total are shown.
    var positive = [];
    for (var i = 0; i < metrics.length; i++) {
      var m = metrics[i];
      if (!m || typeof m.key !== "string") continue;
      var value = Number(m.value);
      if (isFinite(value) && value > 0) positive.push(m);
    }
    if (positive.length === 0) return; // keep band hidden

    // Rebuild the row on first paint (or when the set of shown metrics changes),
    // inserting a divider between stats. On later polls the nodes already exist,
    // so we just animate them to the new value.
    var needsBuild = positive.length !== Object.keys(nodes).length;
    if (needsBuild) {
      host.textContent = "";
      nodes = {};
      for (var j = 0; j < positive.length; j++) {
        if (j > 0) {
          var divider = document.createElement("div");
          divider.className = "proof-divider";
          host.appendChild(divider);
        }
        var built = statNode(positive[j].label);
        host.appendChild(built.stat);
        nodes[positive[j].key] = built.value;
      }
    }

    for (var k = 0; k < positive.length; k++) {
      var key = positive[k].key;
      var target = Number(positive[k].value);
      var node = nodes[key];
      if (!node) continue;
      var from = typeof shown[key] === "number" ? shown[key] : 0;
      if (target >= from) {
        animate(node, from, target);
        shown[key] = target;
      }
    }

    if (band.hidden) band.hidden = false;
  }

  function load() {
    fetch("/api/proof-numbers", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || data.enabled === false) return; // keep band hidden
        var list = Array.isArray(data.metrics) ? data.metrics : [];
        if (list.length === 0) return;
        render(list);
      })
      .catch(function () { /* keep band hidden */ });
  }

  function init() {
    load();
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
