/**
 * /api/extension/cross-retailer - "is this Target product also on Walmart?"
 *
 * POST (Bearer license key): { upc?, title?, brand? } read from a Target product
 * page -> { ok, configured, checked, match }.
 *   - match.matchType "upc": Walmart's own record carries the same barcode.
 *   - match.matchType "similar": no barcode hit, but a keyword search found an
 *     item whose brand and every size/count number agree. The extension labels
 *     these "possible match".
 *   - match null + checked true: Walmart was reached and has nothing.
 *   - checked false: the lookup itself failed (so the client must say "couldn't
 *     check", never "not on Walmart").
 *
 * The Walmart side runs on the single first-party Affiliate API credential (see
 * src/lib/walmart-api.ts); `configured: false` when it is not set in env. The
 * Walmart-to-Target direction has no server API and runs in the extension.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { loadWalmartCreds, lookupByUpc, searchItems } from "@/lib/walmart-api";
import { parseRequest, pickSimilar, toMatch } from "@/lib/cross-retailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

// Best-effort per-user limit (in-memory, per warm instance), same approach as
// campaign-brief. The extension also caches per UPC, so this is a backstop for a
// runaway client rather than the normal throttle.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(userId: string, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  if (rateLimited(auth.auth.userId, Date.now())) {
    return jsonWithCors({ error: "Too many lookups, slow down" }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const req = parseRequest(body);
  if (!req.upc && !req.title) return jsonWithCors({ error: "Need a upc or a title" }, 400);

  const creds = loadWalmartCreds();
  if (!creds) return jsonWithCors({ ok: true, configured: false, checked: false, match: null });

  let checked = true;
  if (req.upc) {
    const res = await lookupByUpc(creds, req.upc);
    if (res.item) {
      return jsonWithCors({
        ok: true,
        configured: true,
        checked: true,
        match: toMatch(res.item, "upc"),
      });
    }
    checked = res.ok;
  }

  // No barcode hit: allow a strict "similar" proposal from a keyword search.
  if (req.title) {
    const query = [req.brand, req.title].filter(Boolean).join(" ").slice(0, 200);
    const candidates = await searchItems(creds, query);
    const pick = pickSimilar(candidates, { title: req.title, brand: req.brand });
    if (pick) {
      return jsonWithCors({
        ok: true,
        configured: true,
        checked: true,
        match: toMatch(pick, "similar"),
      });
    }
    // searchItems swallows failures into [], so an empty answer after a failed
    // UPC lookup stays "unchecked"; after a clean UPC miss it is a real "none".
  }

  return jsonWithCors({ ok: true, configured: true, checked, match: null });
}
