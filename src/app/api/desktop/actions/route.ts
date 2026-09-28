/**
 * /api/desktop/actions - aggregate action counts reported by the desktop app
 * for the public "proof of numbers" counter. The desktop app performs actions
 * that never otherwise reach our backend (auto-messaging brands, optimizing a
 * Benable list), so it POSTs how many it did, keyed by a whitelisted action
 * name, into the same metric-generic client_action_events feed the extension's
 * accepts route uses.
 *
 * POST only, Bearer license key. Body: { action, count? } or a batch
 * { actions: [{ action, count? }] }. Only whitelisted actions are accepted, so
 * a client can never write an arbitrary metric name.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXT_MAX_BATCH,
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// action name -> metric stored in client_action_events. The metric strings must
// match the events_total sources registered in src/lib/proof-metrics.ts.
const ACTION_METRICS: Record<string, string> = {
  creator_messaged: "creator_messaged",
  benable_list_optimized: "benable_list_optimized",
  social_post_published: "social_post_published",
};

export async function OPTIONS() {
  return optionsResponse();
}

type ActionItem = { action?: unknown; count?: unknown };

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  // Accept either a single { action, count } or a batch { actions: [...] }.
  const raw = body as { action?: unknown; count?: unknown; actions?: unknown };
  const items: ActionItem[] = Array.isArray(raw.actions)
    ? (raw.actions as ActionItem[])
    : [{ action: raw.action, count: raw.count }];
  if (items.length === 0 || items.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `actions must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  // Tally counts per whitelisted metric. Unknown actions are skipped, not fatal.
  const totals = new Map<string, number>();
  for (const item of items) {
    const action = typeof item.action === "string" ? item.action : "";
    const metric = ACTION_METRICS[action];
    if (!metric) continue;
    const count = clampInt(item.count ?? 1, 1, 100_000) ?? 1;
    totals.set(metric, (totals.get(metric) ?? 0) + count);
  }
  if (totals.size === 0) {
    return jsonWithCors({ error: "No valid actions in batch" }, 400);
  }

  const rows = Array.from(totals.entries()).map(([metric, count]) => ({
    metric,
    source: "desktop",
    user_id: auth.auth.userId,
    count,
  }));

  const admin = createAdminClient();
  const { error } = await admin.from("client_action_events").insert(rows);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("desktop/actions: insert failed", error);
    return jsonWithCors({ error: "Could not save actions" }, 500);
  }

  const recorded = rows.reduce((sum, r) => sum + r.count, 0);
  return jsonWithCors({ ok: true, recorded });
}
