/**
 * Google integration via the Google Calendar and YouTube Data APIs. There are
 * two independent Google connections, each connected once (OAuth, offline
 * access) and stored in call_config:
 *
 * 1. Calls/scheduling account (google_refresh_token / google_calendar_email):
 *    calendar.events to create the per-booking Meet event and calendar.freebusy
 *    to read the owner's busy blocks. Connected from the Scheduling admin.
 * 2. YouTube account (youtube_refresh_token / youtube_account_email):
 *    youtube.upload to publish finished event recordings (src/lib/youtube.ts).
 *    Connected from the Events admin. Deliberately a different Google account.
 *
 * These are separate so the calls calendar and the YouTube channel can live in
 * different Google accounts. Both flows reuse the same OAuth client
 * (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET); they differ only in the
 * requested scope, the callback path, and which account the owner signs into.
 *
 * Google Cloud setup (owner, one-time): create an OAuth 2.0 Client (Web app),
 * add BOTH callbacks as authorized redirect URIs (scheduling + events youtube),
 * enable the YouTube Data API v3, and set GOOGLE_OAUTH_CLIENT_ID /
 * GOOGLE_OAUTH_CLIENT_SECRET (and optionally GOOGLE_OAUTH_REDIRECT_URI /
 * GOOGLE_OAUTH_YOUTUBE_REDIRECT_URI) in Vercel.
 */
import { randomUUID } from "crypto";

// calendar.events: create the per-booking Meet event. calendar.freebusy: read
// the owner's busy blocks so booked/personal time (pickup, deep-work) hides
// slots. Widening this requires the owner to reconnect ("Connect Google
// Calendar") so the new scope is granted; prompt:"consent" below forces it.
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

// youtube.upload: publish the finished event recording to the dedicated YouTube
// account's channel (src/lib/youtube.ts). Needs the YouTube Data API v3 enabled
// on the same Google Cloud project.
export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"].join(" ");

const SCHEDULING_CALLBACK_PATH = "/api/admin/scheduling/google/callback";
const YOUTUBE_CALLBACK_PATH = "/api/admin/events/youtube/callback";

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(originFallback?: string): string {
  const env = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (env) return env;
  const base = (originFallback || "https://www.influencerbutler.com").replace(/\/+$/, "");
  return `${base}${SCHEDULING_CALLBACK_PATH}`;
}

/** Redirect URI for the dedicated YouTube account OAuth flow (Events admin). */
export function youtubeRedirectUri(originFallback?: string): string {
  const env = process.env.GOOGLE_OAUTH_YOUTUBE_REDIRECT_URI?.trim();
  if (env) return env;
  const base = (originFallback || "https://www.influencerbutler.com").replace(/\/+$/, "");
  return `${base}${YOUTUBE_CALLBACK_PATH}`;
}

/**
 * Consent URL for the owner to connect a Google account. Defaults to the
 * calls/scheduling calendar connection; pass { scope, redirect } to build the
 * dedicated YouTube-account flow instead.
 */
export function authUrl(
  origin: string,
  state: string,
  opts?: { scope?: string; redirect?: string },
): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: opts?.redirect ?? redirectUri(origin),
    response_type: "code",
    scope: opts?.scope ?? CALENDAR_SCOPES,
    access_type: "offline",
    // select_account: always show the account chooser, so a browser signed in
    // to several Google accounts does not silently connect the default one.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an auth code for tokens. Returns the refresh token + connected email.
 * `redirect` must match the redirect_uri used to obtain the code; it defaults to
 * the scheduling callback, so the YouTube flow passes youtubeRedirectUri(origin).
 */
export async function exchangeCode(
  code: string,
  origin: string,
  redirect?: string,
): Promise<{ refreshToken: string; email: string | null } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
        redirect_uri: redirect ?? redirectUri(origin),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) { console.error("[google] token exchange", res.status, await res.text().catch(() => "")); return null; }
    const json = (await res.json()) as { refresh_token?: string; access_token?: string };
    if (!json.refresh_token) return null; // no refresh token (already consented without prompt=consent)
    let email: string | null = null;
    if (json.access_token) {
      try {
        const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${json.access_token}` } });
        if (me.ok) email = ((await me.json()) as { email?: string }).email ?? null;
      } catch { /* non-fatal */ }
    }
    return { refreshToken: json.refresh_token, email };
  } catch (err) { console.error("[google] exchange threw", err); return null; }
}

/** Mint a short-lived access token from the stored refresh token. Exported so
 *  the free/busy reader (google-calendar.ts) reuses the same OAuth client. */
export async function accessTokenFrom(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) { console.error("[google] refresh", res.status, await res.text().catch(() => "")); return null; }
    return ((await res.json()) as { access_token?: string }).access_token ?? null;
  } catch (err) { console.error("[google] refresh threw", err); return null; }
}

/**
 * Live check of the saved connection: mints an access token and reads the
 * primary calendar. A saved refresh token alone says nothing (Google revokes
 * them on password change, manual revoke, or after 7 days while the OAuth app
 * is in Testing mode), and createMeetEvent fails silently, so the admin
 * "Connected" label must come from this.
 */
export async function checkGoogleConnection(refreshToken: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isGoogleConfigured()) return { ok: false, reason: "Google OAuth client env vars are missing on the server." };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
      if (body.error === "invalid_grant") {
        return { ok: false, reason: "Google no longer accepts the saved sign-in (expired or revoked). If the OAuth app is in Testing mode, publish it so this stops expiring every 7 days." };
      }
      return { ok: false, reason: `Google token refresh failed (${res.status}${body.error ? `: ${body.error}` : ""}).` };
    }
    const token = ((await res.json()) as { access_token?: string }).access_token;
    if (!token) return { ok: false, reason: "Google returned no access token." };
    const cal = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { Authorization: `Bearer ${token}` } });
    if (!cal.ok) {
      const t = await cal.text().catch(() => "");
      if (cal.status === 403 && /accessNotConfigured|has not been used|disabled/i.test(t)) {
        return { ok: false, reason: "The Google Calendar API is disabled for this Google Cloud project. Enable it in Google Cloud Console." };
      }
      if (cal.status === 403) return { ok: false, reason: "Signed in, but without Calendar permission. Reconnect and tick the Calendar box." };
      return { ok: false, reason: `Google Calendar check failed (${cal.status}).` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[google] connection check threw", err);
    return { ok: false, reason: "Could not reach Google to check the connection." };
  }
}

export type MeetResult ={ joinUrl: string; meetingId: string; provider: "google_meet" };

/**
 * Create a Calendar event with a Google Meet link. Returns null on any failure
 * (caller falls back to the static link).
 */
export async function createMeetEvent(args: {
  refreshToken: string;
  summary: string;
  description?: string;
  startMs: number;
  endMs: number;
  attendeeEmail: string;
}): Promise<MeetResult | null> {
  const accessToken = await accessTokenFrom(args.refreshToken);
  if (!accessToken) return null;
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: args.summary,
          description: args.description || "",
          start: { dateTime: new Date(args.startMs).toISOString(), timeZone: "UTC" },
          end: { dateTime: new Date(args.endMs).toISOString(), timeZone: "UTC" },
          attendees: [{ email: args.attendeeEmail }],
          conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        }),
      },
    );
    if (!res.ok) { console.error("[google] create event", res.status, await res.text().catch(() => "")); return null; }
    const json = (await res.json()) as { id?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } };
    const link = json.hangoutLink || json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || null;
    if (!link) return null;
    return { joinUrl: link, meetingId: json.id || "", provider: "google_meet" };
  } catch (err) { console.error("[google] create event threw", err); return null; }
}

/** Best-effort delete of a previously-created event (on cancel). */
export async function deleteMeetEvent(refreshToken: string, eventId: string): Promise<void> {
  if (!eventId) return;
  const accessToken = await accessTokenFrom(refreshToken);
  if (!accessToken) return;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) { console.error("[google] delete event threw", err); }
}
