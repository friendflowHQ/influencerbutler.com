/**
 * Summary: Main JS for Influencer Butler marketing website.
 * Handles: sticky nav, mobile menu, feature tabs, FAQ accordion, scroll animations.
 */
(function () {
  "use strict";

  /* ── Sticky header shadow ── */
  const header = document.getElementById("site-header");
  if (header) {
    window.addEventListener("scroll", function () {
      header.classList.toggle("scrolled", window.scrollY > 10);
    }, { passive: true });
  }

  /* ── Mobile hamburger menu ── */
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("nav-menu");
  if (hamburger && navMenu) {
    hamburger.addEventListener("click", function () {
      const open = navMenu.classList.toggle("open");
      hamburger.classList.toggle("open", open);
      hamburger.setAttribute("aria-expanded", String(open));
    });
    // Close on nav link click
    navMenu.querySelectorAll(".nav-link").forEach(function (link) {
      link.addEventListener("click", function () {
        navMenu.classList.remove("open");
        hamburger.classList.remove("open");
        hamburger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ── Feature category tabs ── */
  const tabButtons = document.querySelectorAll(".tab-btn");
  const featureCards = document.querySelectorAll(".feature-card");
  if (tabButtons.length && featureCards.length) {
    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        tabButtons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var tab = btn.getAttribute("data-tab");
        featureCards.forEach(function (card) {
          if (tab === "all" || card.getAttribute("data-category") === tab) {
            card.style.display = "";
          } else {
            card.style.display = "none";
          }
        });
      });
    });
  }

  /* ── FAQ accordion ── */
  var faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(function (item) {
    var btn = item.querySelector(".faq-question");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      // Close all others
      faqItems.forEach(function (other) {
        other.classList.remove("open");
        var ob = other.querySelector(".faq-question");
        if (ob) ob.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ── Scroll animations (Intersection Observer) ── */
  var animEls = document.querySelectorAll(".anim-up");
  if (animEls.length && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    animEls.forEach(function (el) { observer.observe(el); });
  } else {
    // Fallback: show everything
    animEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ── Smooth scroll for anchor links (offset for sticky header) ── */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id === "#") return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: top, behavior: "smooth" });
    });
  });

})();
