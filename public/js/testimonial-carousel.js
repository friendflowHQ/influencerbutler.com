/**
 * Testimonials carousel controller.
 *
 * Turns the horizontal scroll-snap `.testimonial-grid` track into a paged
 * carousel: prev/next arrows scroll by one viewport width, and a row of dots
 * (generated here from the live page count) tracks position.
 *
 * Dots are built from `track.scrollWidth / track.clientWidth` so the count is
 * always correct regardless of how many cards exist. That matters because
 * /js/testimonials.js can replace the static cards with DB-fed reviews; when it
 * does it dispatches `testimonials:rendered`, which we listen for to rebuild.
 *
 * Fails silent if the carousel markup is absent.
 */
(function () {
  "use strict";

  function init() {
    var root = document.querySelector("[data-testimonial-carousel]");
    if (!root) return;

    var track = root.querySelector("[data-tc-track]");
    var prev = root.querySelector("[data-tc-prev]");
    var next = root.querySelector("[data-tc-next]");
    var dotsWrap = root.querySelector("[data-tc-dots]");
    if (!track) return;

    function pageCount() {
      // Round to avoid a stray extra page from sub-pixel widths.
      return Math.max(1, Math.round(track.scrollWidth / track.clientWidth));
    }

    function currentPage() {
      return Math.round(track.scrollLeft / track.clientWidth);
    }

    function goToPage(i) {
      var count = pageCount();
      var idx = ((i % count) + count) % count; // wrap around
      track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
    }

    function buildDots() {
      if (!dotsWrap) return;
      var count = pageCount();
      dotsWrap.textContent = "";
      // A single page needs no pagination.
      if (count < 2) return;
      for (var i = 0; i < count; i++) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "testimonial-dot" + (i === 0 ? " is-active" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", "Go to testimonials page " + (i + 1));
        dot.dataset.tcDot = String(i);
        dotsWrap.appendChild(dot);
      }
    }

    function syncDots() {
      if (!dotsWrap) return;
      var active = currentPage();
      var dots = dotsWrap.querySelectorAll(".testimonial-dot");
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle("is-active", i === active);
      }
    }

    if (prev) prev.addEventListener("click", function () { goToPage(currentPage() - 1); });
    if (next) next.addEventListener("click", function () { goToPage(currentPage() + 1); });

    if (dotsWrap) {
      dotsWrap.addEventListener("click", function (e) {
        var dot = e.target.closest ? e.target.closest(".testimonial-dot") : null;
        if (!dot) return;
        goToPage(parseInt(dot.dataset.tcDot, 10) || 0);
      });
    }

    // Debounced scroll -> active dot.
    var scrollTimer = null;
    track.addEventListener("scroll", function () {
      if (scrollTimer) return;
      scrollTimer = window.requestAnimationFrame(function () {
        scrollTimer = null;
        syncDots();
      });
    }, { passive: true });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { buildDots(); syncDots(); }, 150);
    });

    // Rebuild if the DB feed swaps the static cards.
    document.addEventListener("testimonials:rendered", function () {
      buildDots();
      syncDots();
    });

    buildDots();
    syncDots();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
