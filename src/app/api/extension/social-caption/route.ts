/**
 * POST /api/extension/social-caption - the free ("Influencer Butler AI") caption
 * engine for the extension's schedule-a-post compose box. Bearer license key.
 *
 * Body: { topic?, productTitle?, imageUrl?, pageUrl?, tone?, locale? }.
 * Returns: { ok: true, caption, alts } on success, or { ok: false, error } when
 * no LLM key is configured or the model missed (the compose UI then falls back to
 * a hand-typed caption or the creator's own OpenAI key).
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { generateSocialCaption } from "@/lib/social-caption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const asStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;

  const outcome = await generateSocialCaption({
    topic: asStr(o.topic),
    productTitle: asStr(o.productTitle),
    imageUrl: asStr(o.imageUrl),
    pageUrl: asStr(o.pageUrl),
    tone: asStr(o.tone),
    locale: asStr(o.locale),
  });

  if (!outcome.caption) {
    return jsonWithCors(
      { ok: false, error: "Could not draft a caption right now", diag: outcome.diag },
      outcome.diag === "no-provider" ? 503 : 502,
    );
  }
  return jsonWithCors({ ok: true, caption: outcome.caption, alts: outcome.alts });
}
