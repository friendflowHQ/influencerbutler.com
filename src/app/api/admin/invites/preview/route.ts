/**
 * GET /api/admin/invites/preview?id=<invite id>
 *
 * Shows an invite's draft page to an admin WITHOUT touching its funnel (the
 * public /p/<code> link counts a view; reviewing a batch here must not).
 * Served as a locked-down document: no scripts, noindex.
 */
import { requirePermission } from "@/lib/admin";
import { inviteDb } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) return new Response("Forbidden", { status: 403 });
  const db = inviteDb();
  if (!db) return new Response("Server misconfigured", { status: 503 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const { data } = await db.from("foyer_invites").select("preview_html").eq("id", id).maybeSingle();
  const html = (data as { preview_html?: string } | null)?.preview_html;
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "script-src 'none'; frame-ancestors 'self'",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
