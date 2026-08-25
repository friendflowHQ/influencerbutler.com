/**
 * Google Meet integration via the Google Calendar API. The owner connects her
 * Google account once (OAuth, offline access); we store the refresh token in
 * call_config and, per booking, create a Calendar event with a Meet link.
 * Falls back to call_config.default_join_url when not connected.
 *
 * Google Cloud setup (owner, one-time): create an OAuth 2.0 Client (Web app),
 * add the callback as an authorized redirect URI, set GOOGLE_OAUTH_CLIENT_ID /
 * GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI in Vercel, then click
 * "Connect Google Calendar" in the Scheduling admin.
 */
import { randomUUID } from "crypto";

// calendar.events: create the per-booking Meet event. calendar.freebusy: read
// the owner's busy blocks so booked/personal time (pickup, deep-work) hides
// slots. Widening this requires the owner to reconnect ("Connect Google
// Calendar") so the new scope is granted; prompt:"consent" below forces it.
const SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(originFallback?: string): string {
  const env = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (env) return env;
  const base = (originFallback || "https://www.influencerbutler.com").replace(/\/+$/, "");
  return `${base}/api/admin/scheduling/google/callback`;
}

/** Consent URL for the owner to connect her Google Calendar. */
export function authUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange an auth code for tokens. Returns the refresh token + connected email. */
export async function exchangeCode(code: string, origin: string): Promise<{ refreshToken: string; email: string | null } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
        redirect_uri: redirectUri(origin),
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

export type MeetResult = { joinUrl: string; meetingId: string; provider: "google_meet" };

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
