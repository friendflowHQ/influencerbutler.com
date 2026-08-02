/**
 * Zoom Server-to-Server OAuth client — mints an account-credentials token and
 * creates a meeting per booking. Falls back gracefully: if the ZOOM_* env vars
 * are absent, callers use call_config.default_join_url instead, so booking
 * works before Zoom is wired up.
 */

export type ZoomMeeting = { joinUrl: string; meetingId: string; provider: "zoom" };

export function isZoomConfigured(): boolean {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string | null> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) {
      console.error("zoom token failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token || null;
  } catch (err) {
    console.error("zoom token threw", err);
    return null;
  }
}

/**
 * Create a scheduled Zoom meeting. Returns null on any failure so the caller
 * can fall back to a static link.
 * @param startMs UTC epoch ms
 * @param minutes meeting duration (customer-facing)
 */
export async function createZoomMeeting(args: {
  topic: string;
  startMs: number;
  minutes: number;
}): Promise<ZoomMeeting | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: args.topic.slice(0, 200),
        type: 2, // scheduled
        start_time: new Date(args.startMs).toISOString(),
        duration: Math.max(15, Math.round(args.minutes)),
        timezone: "UTC",
        settings: { join_before_host: true, waiting_room: false, approval_type: 2 },
      }),
    });
    if (!res.ok) {
      console.error("zoom create meeting failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { join_url?: string; id?: number | string };
    if (!json.join_url) return null;
    return { joinUrl: json.join_url, meetingId: String(json.id ?? ""), provider: "zoom" };
  } catch (err) {
    console.error("zoom create meeting threw", err);
    return null;
  }
}
