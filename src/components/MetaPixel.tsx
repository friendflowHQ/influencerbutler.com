"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Meta (Facebook) Pixel base code. Renders nothing unless
 * NEXT_PUBLIC_META_PIXEL_ID is set, so the site is pixel-free until the Meta
 * account exists. Server-side twin: src/lib/meta-capi.ts (Conversions API).
 *
 * Fires PageView on the initial load (inside the base snippet) and again on
 * every App Router client-side navigation: URL-rule website custom audiences
 * ("visited /pricing in the last 30 days") only see pages that a PageView
 * carried, and client navigations never reload the base snippet.
 *
 * Uses usePathname() only (no useSearchParams) so mounting this in the root
 * layout does not force a Suspense boundary around the whole app.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type FbqWindow = Window & { fbq?: (...args: unknown[]) => void };

export default function MetaPixel() {
  const pathname = usePathname();
  // The base snippet already fires PageView for the first render; only
  // subsequent pathname changes need a manual track call.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!PIXEL_ID) return;
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
  }, [pathname]);

  if (!PIXEL_ID) return null;

  return (
    <>
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
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
