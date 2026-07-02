/**
 * Summary: Main JS for Influencer Butler marketing website.
 * Handles: sticky nav, mobile menu, feature tabs, FAQ accordion, scroll animations.
 */
(function () {
  "use strict";

  /* ── Download-guidance popup ── */
  // Loaded here (rather than via a <script> tag in all 50+ static pages) because
  // main.js already runs on every marketing page that carries a download link.
  // The script is self-contained and attaches its own delegated click listener.
  if (!window.IBDownloadGuide) {
    var dlg = document.createElement("script");
    dlg.src = "/download-guidance.js";
    dlg.defer = true;
    document.head.appendChild(dlg);
  }

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
      var headerEl = document.getElementById("site-header");
      var offset = headerEl ? headerEl.getBoundingClientRect().height + 12 : 80;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: "smooth" });
    });
  });

  /* ── Click-to-enlarge lightbox for feature page images ── */
  var zoomImgs = document.querySelectorAll(".feature-detail img");
  if (zoomImgs.length) {
    var overlay = document.createElement("div");
    overlay.className = "ib-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");

    var closeBtn = document.createElement("button");
    closeBtn.className = "ib-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "&times;";

    var bigImg = document.createElement("img");
    bigImg.alt = "";

    overlay.appendChild(closeBtn);
    overlay.appendChild(bigImg);
    document.body.appendChild(overlay);

    function openLightbox(src, alt) {
      bigImg.src = src;
      bigImg.alt = alt || "";
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    zoomImgs.forEach(function (img) {
      img.addEventListener("click", function () {
        openLightbox(img.currentSrc || img.src, img.alt);
      });
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target === closeBtn) closeLightbox();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) closeLightbox();
    });
  }

})();
