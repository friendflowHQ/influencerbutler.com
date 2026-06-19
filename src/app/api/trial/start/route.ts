import { NextResponse, after } from "next/server";
import { isBotUserAgent } from "@/lib/affiliate-clicks";
import {
  WINDOWS_DOWNLOAD_URL,
  MAC_ARM_DOWNLOAD_URL,
  MAC_INTEL_DOWNLOAD_URL,
} from "@/lib/welcome-copy";
import { logTrialClickActivity, readGeo } from "@/lib/recent-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One notification email per browser per hour. A visitor who clicks several
// trial CTAs in a session only generates a single email.
const DEDUP_MAX_AGE_SECONDS = 60 * 60;
const DEDUP_COOKIE = "ib_trial_ping";

const FALLBACK_RECIPIENT = "thesocialmediaposse@gmail.com";

/**
 * Trial-click tracker. Every "Start Free Trial" / "Download" CTA on the
 * marketing site points here instead of straight at dl.influencerbutler.com.
 * We capture what the request tells us (IP, approximate location, device,
 * referring page), email the owner once per visitor, then 302 the visitor on
 * to the desktop app download. The email send runs in after() so the redirect
 * is instant.
 */
export async function GET(request: Request) {
  const h = request.headers;
  const userAgent = h.get("user-agent");

  // Redirect happens no matter what. Build it first so every early return
  // still sends the visitor where they expect to go. The destination depends
  // on the requested/detected OS so Mac users no longer land on the Windows
  // .exe (see resolveDownloadTarget).
  const requestUrl = new URL(request.url);
  const { target: downloadTarget, os: resolvedOs } = resolveDownloadTarget(
    requestUrl.searchParams.get("os"),
    userAgent,
    publicBaseUrl(h, requestUrl.origin),
  );
  const redirect = NextResponse.redirect(downloadTarget, 302);
  // Never let Vercel's CDN cache the 302 - a cached redirect would skip this
  // function on later clicks and suppress every future notification.
  redirect.headers.set("Cache-Control", "no-store");

  const alreadyPinged = request.headers
    .get("cookie")
    ?.split(";")
    .some((c) => c.trim().startsWith(`${DEDUP_COOKIE}=`));

  // Bots, crawlers, and link-preview fetchers should not trigger emails.
  if (isBotUserAgent(userAgent)) {
    console.log("trial/start: skipped (bot)", { userAgent });
    return redirect;
  }

  // Browser prefetch / prerender (Chrome "preload pages", hover speculation,
  // Firefox/Safari prefetch) hits this GET before the human actually clicks,
  // and can fire several times. Skip it WITHOUT arming the dedup cookie, so the
  // genuine click that follows still sends exactly one email.
  if (isPrefetchRequest(h)) {
    console.log("trial/start: skipped (prefetch)");
    return redirect;
  }

  if (alreadyPinged) {
    console.log("trial/start: skipped (deduped)");
    return redirect;
  }

  // First click from this browser in the window: arm the dedup cookie and
  // schedule the notification email.
  redirect.cookies.set({
    name: DEDUP_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEDUP_MAX_AGE_SECONDS,
  });

  const details = { ...collectDetails(request), os: resolvedOs };
  const geo = readGeo(h);
  const source = requestUrl.searchParams.get("src");
  after(() => sendNotification(details));
  // Record the click for the public recent-activity widget (best-effort).
  after(() => logTrialClickActivity({ geo, source }));

  return redirect;
}

// Detects speculative navigations (prefetch / prerender / preload) that browsers
// fire before a real click. Chrome sends Sec-Purpose; older Chrome sends Purpose;
// Firefox sends X-Moz; Safari sends X-Purpose.
function isPrefetchRequest(h: Headers): boolean {
  const signals = [
    h.get("sec-purpose"),
    h.get("purpose"),
    h.get("x-purpose"),
    h.get("x-moz"),
  ];
  for (const raw of signals) {
    const v = (raw || "").toLowerCase();
    if (v.includes("prefetch") || v.includes("prerender") || v.includes("preview") || v.includes("preload")) {
      return true;
    }
  }
  return false;
}

// Behind Vercel's proxy, new URL(request.url).origin can be an internal host,
// so prefer the forwarded host/proto when building the /download redirect.
function publicBaseUrl(h: Headers, fallbackOrigin: string): string {
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return fallbackOrigin;
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

// Picks where the visitor is sent based on an explicit ?os= param (used by the
// real download buttons, which know exactly which file they want) or, when
// absent, the User-Agent. The UA reliably tells us the OS but NOT the Mac CPU
// architecture, so Mac visitors without an explicit choice go to the /download
// chooser page rather than guessing arm64 vs x64. Windows stays a direct .exe.
function resolveDownloadTarget(
  osParam: string | null,
  userAgent: string | null,
  origin: string,
): { target: string; os: string } {
  switch (osParam) {
    case "win":
      return { target: WINDOWS_DOWNLOAD_URL, os: "windows (explicit)" };
    case "mac-arm":
      return { target: MAC_ARM_DOWNLOAD_URL, os: "mac apple silicon (explicit)" };
    case "mac-intel":
      return { target: MAC_INTEL_DOWNLOAD_URL, os: "mac intel (explicit)" };
  }

  const ua = (userAgent || "").toLowerCase();
  const isWindows = ua.includes("windows") || ua.includes("win64") || ua.includes("win32");
  if (isWindows) {
    return { target: WINDOWS_DOWNLOAD_URL, os: "windows (detected)" };
  }

  const isMac = ua.includes("macintosh") || ua.includes("mac os x");
  // Mac and every non-Windows visitor get the chooser so they can pick the
  // right build instead of downloading a Windows installer they can't run.
  return {
    target: `${origin}/download`,
    os: isMac ? "mac (detected, chooser)" : "non-windows (chooser)",
  };
}

type ClickDetails = {
  ip: string;
  city: string;
  region: string;
  country: string;
  latLong: string;
  timezone: string;
  device: string;
  referrer: string;
  source: string;
  language: string;
  os: string;
};

function firstValue(raw: string | null): string {
  if (!raw) return "unknown";
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

function collectDetails(request: Request): Omit<ClickDetails, "os"> {
  const h = request.headers;
  const url = new URL(request.url);
  const lat = h.get("x-vercel-ip-latitude");
  const long = h.get("x-vercel-ip-longitude");

  return {
    ip: firstValue(h.get("x-forwarded-for") || h.get("x-real-ip")),
    city: decodeHeader(h.get("x-vercel-ip-city")),
    region: h.get("x-vercel-ip-country-region") || "unknown",
    country: h.get("x-vercel-ip-country") || "unknown",
    latLong: lat && long ? `${lat}, ${long}` : "unknown",
    timezone: h.get("x-vercel-ip-timezone") || "unknown",
    device: h.get("user-agent") || "unknown",
    referrer: h.get("referer") || "unknown",
    source: url.searchParams.get("src") || "unknown",
    language: h.get("accept-language") || "unknown",
  };
}

// Vercel URL-encodes the city header (e.g. "San%20Francisco").
function decodeHeader(value: string | null): string {
  if (!value) return "unknown";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function sendNotification(d: ClickDetails): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TRIAL_CLICK_NOTIFICATION_EMAIL || FALLBACK_RECIPIENT;

  if (!apiKey) {
    console.log("trial/start: skipped (not_configured)");
    return;
  }

  const location = [d.city, d.region, d.country]
    .filter((p) => p && p !== "unknown")
    .join(", ");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [to],
        subject: `Free trial click${location ? `: ${location}` : ""}`,
        text: [
          `Someone clicked to start their free trial.`,
          ``,
          `Location: ${location || "unknown"}`,
          `Country: ${d.country}`,
          `Region: ${d.region}`,
          `City: ${d.city}`,
          `Coordinates: ${d.latLong}`,
          `Timezone: ${d.timezone}`,
          `IP address: ${d.ip}`,
          ``,
          `Clicked from page: ${d.referrer}`,
          `Button / source tag: ${d.source}`,
          `Sent to download for: ${d.os}`,
          `Device / browser: ${d.device}`,
          `Language: ${d.language}`,
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      console.error("trial/start: resend send failed", res.status);
    }
  } catch (error) {
    console.error("trial/start: notification error", error);
  }
}
