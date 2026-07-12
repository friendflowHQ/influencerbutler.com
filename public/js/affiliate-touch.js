// First-touch affiliate attribution for the static marketing homepage.
//
// Affiliate share links now point at the homepage (https://www.influencerbutler.com/?code=CODE)
// instead of /pricing, so the link reads as a clean brand URL. The homepage is
// served as a static file (public/index.html) with no React, so this vanilla
// script stands in for the AffiliateTouch component used on the Next.js pages
// (see src/components/AffiliateTouch.tsx).
//
// On a ?code= visit it POSTs to /api/promo/touch, which sets the ib_aff_src
// cookie (so the affiliate's discount + attribution resolve later at checkout,
// see src/app/api/checkout/route.ts) and logs a click row for the affiliate's
// per-source analytics dashboard. The optional ?s= param tags the channel.
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    if (!code || code.trim().length === 0) return;

    var body = { affiliateSource: code.trim().toUpperCase() };
    var source = params.get("s");
    if (source) body.source = source;
    if (document.referrer) body.referrer = document.referrer;

    fetch("/api/promo/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(function () {
      // Non-fatal: attribution is best-effort. A later checkout can still fall
      // back to the code typed at checkout.
    });
  } catch (err) {
    // Never let attribution break the page.
  }
})();
