"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * TikTok Pixel base code. Renders nothing unless
 * NEXT_PUBLIC_TIKTOK_PIXEL_ID is set AND the visitor has granted advertising
 * consent ("Accept all" on the cookie banner, or GPC absent + a stored yes).
 * The client twin of src/components/MetaPixel.tsx: same env/consent gating,
 * same consent source (public/js/consent.js -> window.ibConsent +
 * "ib-consent-change" + the ib_ads_consent cookie).
 *
 * Fires a page view on the initial load (ttq.page() inside the base snippet)
 * and again on every App Router client-side navigation, so TikTok URL-rule
 * audiences ("visited /pricing") see pages reached without a full reload.
 *
 * TikTok's standard conversion events (InitiateCheckout, Lead, ...) are sent
 * from call sites via trackTikTokEvent in src/lib/analytics-client.ts.
 *
 * Uses usePathname() only (no useSearchParams) so mounting this in the root
 * layout does not force a Suspense boundary around the whole app.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

type TtqWindow = Window & {
  ttq?: { page?: () => void };
  ibConsent?: { get?: () => { analytics?: boolean } | null };
};

function readAdsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as TtqWindow;
    const stored = w.ibConsent?.get?.();
    if (stored && typeof stored.analytics === "boolean") return stored.analytics;
    // consent.js may not have run yet; fall back to the cookie it mirrors.
    return document.cookie.split("; ").some((c) => c === "ib_ads_consent=1");
  } catch {
    return false;
  }
}

export default function TikTokPixel() {
  const pathname = usePathname();
  const [consented, setConsented] = useState(false);
  // The base snippet already fires ttq.page() for the first render; only
  // subsequent pathname changes need a manual page call.
  const isFirstRender = useRef(true);

  // Watch consent: initial state + react to the banner choice live.
  useEffect(() => {
    if (!PIXEL_ID) return;
    // SSR renders null (consented=false); reading consent after mount and
    // flipping here is intentional and avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readAdsConsent()) setConsented(true);
    const onChange = (e: Event) => {
      const granted = (e as CustomEvent<{ analytics?: boolean }>).detail?.analytics;
      if (granted) setConsented(true);
    };
    window.addEventListener("ib-consent-change", onChange);
    return () => window.removeEventListener("ib-consent-change", onChange);
  }, []);

  useEffect(() => {
    if (!PIXEL_ID || !consented) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      const w = window as TtqWindow;
      if (w.ttq && typeof w.ttq.page === "function") {
        w.ttq.page();
      }
    } catch {
      // Analytics must never break the page.
    }
  }, [pathname, consented]);

  if (!PIXEL_ID || !consented) return null;

  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">
      {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('${PIXEL_ID}');
ttq.page();
}(window,document,'ttq');`}
    </Script>
  );
}
