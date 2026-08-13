"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Meta (Facebook) Pixel base code. Renders nothing unless
 * NEXT_PUBLIC_META_PIXEL_ID is set AND the visitor has granted advertising
 * consent ("Accept all" on the cookie banner, or GPC absent + a stored yes).
 * Server-side twin: src/lib/meta-capi.ts (Conversions API), gated on the same
 * ib_ads_consent cookie.
 *
 * Consent is owned by public/js/consent.js (loaded in the root layout): it
 * exposes window.ibConsent.get() and dispatches "ib-consent-change" when the
 * visitor chooses, so the pixel can load the moment consent is given without a
 * page reload. We never tear fbq down on withdrawal mid-session (that needs a
 * reload anyway); the next navigation simply won't reload it.
 *
 * Fires PageView on the initial load (inside the base snippet) and again on
 * every App Router client-side navigation: URL-rule custom audiences
 * ("visited /pricing in the last 30 days") only see pages a PageView carried,
 * and client navigations never reload the base snippet.
 *
 * Uses usePathname() only (no useSearchParams) so mounting this in the root
 * layout does not force a Suspense boundary around the whole app.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type FbqWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  ibConsent?: { get?: () => { analytics?: boolean } | null };
};

function readAdsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as FbqWindow;
    const stored = w.ibConsent?.get?.();
    if (stored && typeof stored.analytics === "boolean") return stored.analytics;
    // consent.js may not have run yet; fall back to the cookie it mirrors.
    return document.cookie.split("; ").some((c) => c === "ib_ads_consent=1");
  } catch {
    return false;
  }
}

export default function MetaPixel() {
  const pathname = usePathname();
  const [consented, setConsented] = useState(false);
  // The base snippet already fires PageView for the first render; only
  // subsequent pathname changes need a manual track call.
  const isFirstRender = useRef(true);

  // Watch consent: initial state + react to the banner choice live.
  useEffect(() => {
    if (!PIXEL_ID) return;
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
      const w = window as FbqWindow;
      if (typeof w.fbq === "function") {
        w.fbq("track", "PageView");
      }
    } catch {
      // Analytics must never break the page.
    }
  }, [pathname, consented]);

  if (!PIXEL_ID || !consented) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
    </Script>
  );
}
