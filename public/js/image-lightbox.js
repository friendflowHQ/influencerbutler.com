// Site-wide "click to enlarge" for content images.
//
// One self-contained script, loaded on BOTH the static marketing/feature
// pages (public/**/*.html, via scripts/inject-image-lightbox.mjs) AND the
// Next.js React pages (blog, help, course, dashboard, via the <Script> tag
// in src/app/layout.tsx). Behaviour is identical everywhere.
//
// It uses event delegation, so it covers every image without per-page wiring.
// Large content images are opted IN automatically; small images (logos,
// icons, avatars) and navigational images (wrapped in a link or button) are
// left alone. Any image can opt out with the data-no-lightbox attribute, on
// the image itself or on an ancestor.
(function () {
  "use strict";

  // Guard against double-initialisation (e.g. script included twice).
  if (window.__ibImageLightbox) return;
  window.__ibImageLightbox = true;

  // Ignore anything smaller than this in either dimension: logos, favicons,
  // inline icons, tiny thumbnails. Not worth a full-screen overlay.
  var MIN_WIDTH = 140;
  var MIN_HEIGHT = 80;

  function injectStyles() {
    if (document.getElementById("ib-lightbox-styles")) return;
    var css = [
      ".ib-zoomable{cursor:zoom-in;transition:transform .18s ease,filter .18s ease}",
      ".ib-zoomable:hover{transform:scale(1.015);filter:brightness(1.03)}",
      "@media (prefers-reduced-motion:reduce){.ib-zoomable{transition:none}.ib-zoomable:hover{transform:none}}",
      ".ib-lightbox-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:2.5vmin;background:rgba(15,23,42,.88);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);cursor:zoom-out;animation:ib-fade-in .15s ease}",
      ".ib-lightbox-img{max-width:92vw;max-height:92vh;width:auto;height:auto;object-fit:contain;border-radius:.5rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);cursor:default;animation:ib-zoom-in .15s ease}",
      ".ib-lightbox-close{position:fixed;top:1rem;right:1.25rem;z-index:1;width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;font-size:2rem;line-height:1;color:#fff;background:rgba(255,255,255,.12);border:0;border-radius:9999px;cursor:pointer;transition:background .15s ease}",
      ".ib-lightbox-close:hover{background:rgba(255,255,255,.25)}",
      "@keyframes ib-fade-in{from{opacity:0}to{opacity:1}}",
      "@keyframes ib-zoom-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}",
    ].join("");
    var style = document.createElement("style");
    style.id = "ib-lightbox-styles";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function isEligible(img) {
    if (img.hasAttribute("data-no-lightbox")) return false;
    if (img.closest("[data-no-lightbox]")) return false;
    // Navigational images should follow their link/button, not enlarge.
    if (img.closest("a, button")) return false;
    if (!img.currentSrc && !img.src) return false;
    var rect = img.getBoundingClientRect();
    var width = rect.width || img.naturalWidth;
    var height = rect.height || img.naturalHeight;
    return width >= MIN_WIDTH && height >= MIN_HEIGHT;
  }

  // Add/remove the .ib-zoomable class so the zoom-in cursor and hover lift
  // appear only on images that will actually open the lightbox. An image's
  // real size is only known once it loads, so any image still loading gets a
  // one-time load listener to re-evaluate it then (covers lazy-loaded images
  // below the fold, which start at ~0px).
  function markImage(img) {
    img.classList.toggle("ib-zoomable", isEligible(img));
    if (!img.complete && img.dataset.ibWatched !== "1") {
      img.dataset.ibWatched = "1";
      img.addEventListener(
        "load",
        function () {
          img.classList.toggle("ib-zoomable", isEligible(img));
        },
        { once: true }
      );
    }
  }

  function refreshMarks() {
    var imgs = document.getElementsByTagName("img");
    for (var i = 0; i < imgs.length; i++) markImage(imgs[i]);
  }

  // ---- Overlay -------------------------------------------------------------

  var backdrop = null;
  var prevOverflow = "";

  function closeOverlay() {
    if (!backdrop) return;
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
    backdrop = null;
    document.body.style.overflow = prevOverflow;
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeOverlay();
  }

  function openOverlay(src, alt) {
    if (backdrop) closeOverlay();

    backdrop = document.createElement("div");
    backdrop.className = "ib-lightbox-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Enlarged image");
    backdrop.addEventListener("click", closeOverlay);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ib-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close enlarged image");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeOverlay);

    var img = document.createElement("img");
    img.className = "ib-lightbox-img";
    img.src = src;
    img.alt = alt || "";
    // Clicking the image itself should not close the overlay.
    img.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    backdrop.appendChild(closeBtn);
    backdrop.appendChild(img);
    document.body.appendChild(backdrop);

    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeydown);
  }

  // ---- Wiring --------------------------------------------------------------

  function onDocumentClick(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    var target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    // Validate at click time (not only via the .ib-zoomable class) so a large
    // content image always opens, even if the hover cue was not applied yet
    // (e.g. it finished loading a moment ago).
    if (!isEligible(target)) return;
    e.preventDefault();
    openOverlay(target.currentSrc || target.src, target.alt);
  }

  function init() {
    injectStyles();
    refreshMarks();

    var raf = 0;
    function scheduleRefresh() {
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        refreshMarks();
      });
    }

    // Keep marks fresh as the DOM changes: client-side navigation in the React
    // app, lazy-loaded images, expanding sections, etc.
    if (window.MutationObserver && document.body) {
      new MutationObserver(scheduleRefresh).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", scheduleRefresh);
    document.addEventListener("click", onDocumentClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
