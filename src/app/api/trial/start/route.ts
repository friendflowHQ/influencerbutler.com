import { NextResponse, after } from "next/server";
import { isBotUserAgent } from "@/lib/affiliate-clicks";
import { DESKTOP_APP_DOWNLOAD_URL } from "@/lib/welcome-copy";

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
  // still sends the visitor where they expect to go.
  const redirect = NextResponse.redirect(DESKTOP_APP_DOWNLOAD_URL, 302);
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

  const details = collectDetails(request);
  after(() => sendNotification(details));

  return redirect;
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
};

function firstValue(raw: string | null): string {
  if (!raw) return "unknown";
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

function collectDetails(request: Request): ClickDetails {
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
