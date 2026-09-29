/*
 * Screen-reader note for links that open a new tab.
 *
 * Every <a target="_blank"> gets a visually hidden " (opens in a new tab)"
 * suffix (or has it appended to its aria-label), so assistive-tech users are
 * not silently moved to a new tab. Loaded on BOTH the static marketing pages
 * (injected by js/main.js, same pattern as download-guidance.js) and the
 * Next.js pages (via the <Script> tag in src/app/layout.tsx).
 */
(function () {
  "use strict";

  if (window.__ibNewTabLabels) return;
  window.__ibNewTabLabels = true;

  var NOTE = " (opens in a new tab)";

  function injectStyles() {
    if (document.getElementById("ib-newtab-styles")) return;
    var style = document.createElement("style");
    style.id = "ib-newtab-styles";
    style.textContent =
      ".ib-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}";
    (document.head || document.documentElement).appendChild(style);
  }

  function annotate() {
    var links = document.querySelectorAll('a[target="_blank"]:not([data-ib-newtab])');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      a.setAttribute("data-ib-newtab", "1");
      var label = a.getAttribute("aria-label");
      if (label) {
        // aria-label overrides link content, so the note must go there.
        if (label.indexOf("new tab") === -1) a.setAttribute("aria-label", label + NOTE);
        continue;
      }
      var span = document.createElement("span");
      span.className = "ib-visually-hidden";
      span.textContent = NOTE;
      a.appendChild(span);
    }
  }

  function init() {
    injectStyles();
    annotate();
    // Cover client-side navigation and dynamically added links.
    if (window.MutationObserver && document.body) {
      var raf = 0;
      new MutationObserver(function () {
        if (raf) return;
        raf = window.requestAnimationFrame(function () {
          raf = 0;
          annotate();
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
