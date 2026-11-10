/**
 * POST /api/invites/track  { code, event: "time" | "claim_click", ms? }
 *
 * Page analytics for a private Storefront Score page, sent by
 * navigator.sendBeacon (so the body may arrive as text/plain). "time" adds the
 * visible time on page (capped per beacon); "claim_click" stamps the first
 * click on Claim, before the claim itself completes. Fire-and-forget: always
 * 204, never an error the visitor could see.
 */
import { rateLimit } from "@/lib/rate-limit";
import { inviteDb, isValidInviteCode } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MS_PER_BEACON = 30 * 60 * 1000;

function noContent() {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  let body: { code?: unknown; event?: unknown; ms?: unknown } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    return noContent();
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (!isValidInviteCode(code)) return noContent();
  const limited = await rateLimit(`invite-track:code:${code}`, 120, 3600);
  if (!limited.allowed) return noContent();
  const db = inviteDb();
  if (!db) return noContent();
  const { data } = await db
    .from("foyer_invites")
    .select("id, time_on_page_ms, claim_clicked_at")
    .eq("code", code)
    .maybeSingle();
  const row = data as { id: string; time_on_page_ms: number | null; claim_clicked_at: string | null } | null;
  if (!row) return noContent();

  if (body.event === "time") {
    const ms = Math.max(0, Math.min(MAX_MS_PER_BEACON, Math.round(Number(body.ms) || 0)));
    if (ms > 0) {
      await db.from("foyer_invites").update({ time_on_page_ms: (Number(row.time_on_page_ms) || 0) + ms }).eq("id", row.id);
    }
  } else if (body.event === "claim_click" && !row.claim_clicked_at) {
    await db.from("foyer_invites").update({ claim_clicked_at: new Date().toISOString() }).eq("id", row.id);
  }
  return noContent();
}
