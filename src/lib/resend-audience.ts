// Best-effort mirror of newsletter contacts into the Resend segment used by
// the weekly newsletter broadcast. Extracted from /api/newsletter/subscribe so
// the admin contacts import can reuse it. Never throws.

/**
 * Adds the contact to the Resend newsletter segment. No-ops when Resend is not
 * configured. RESEND_AUDIENCE_ID holds a Resend *segment* id (Resend renamed
 * Audiences to Segments); the current contacts API is POST /contacts with a
 * `segments` array.
 */
export async function addToResendAudience(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !segmentId) return;
  try {
    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false, segments: [segmentId] }),
    });
    if (!res.ok) {
      console.error("newsletter: Resend contact add failed", res.status);
    }
  } catch (err) {
    console.error("newsletter: Resend contact add threw", err);
  }
}
