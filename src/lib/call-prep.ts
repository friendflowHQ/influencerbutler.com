// Call prep: the in-app card collects a short tap-only questionnaire (and the
// customer's setup progress) before a 1:1 call, so the owner reads one card
// instead of spending the first 15 minutes asking.
//
// The desktop app sends it as `prep` on POST /api/booking/create. The shape
// mirrors the desktop's src/shared/call-booking-gate.js, so keep the two
// vocabularies in lock-step.
//
// Enforcement is OFF unless CALL_PREP_REQUIRED=1, so the app release that sends
// `prep` can reach customers before older installs, the extension and the phone
// app are refused. It only applies to license-key (app/extension/phone) bookings:
// the website's own booking page has no questionnaire UI yet. The setup numbers
// are reported by the client, so they are a speed bump for honest customers, not
// a tamper-proof check.

export const CALL_PREP_REQUIRED_CODE = "prep_required";
export const CALL_PREP_SETUP_CODE = "setup_incomplete";

export const CALL_PREP_REQUIRED_MESSAGE =
  "Please update the Influencer Butler app and book from the chat bubble in the app. " +
  "It asks a few quick questions first so your call is shorter and we can come prepared.";

export const CALL_PREP_SETUP_MESSAGE =
  "Please finish the required setup steps in the Influencer Butler app before booking this call. " +
  "Most questions are answered by finishing setup, and then your call is much shorter. " +
  "Stuck on a step? The AI Concierge can help 24/7. Billing or account question? Choose that option in the app.";

export const CALL_PREP_VOCAB = {
  blocker: ["connect", "deals", "cc", "links", "results", "billing", "other"],
  tried: ["tutorial", "assistant", "restart", "nothing"],
  experience: ["new", "some", "experienced"],
  share: ["yes", "no"],
} as const;

export type CallPrep = {
  blocker: string;
  tried: string[];
  experience: string;
  share: string;
  /** Required setup steps done / total, as reported by the app (0/0 when not applicable). */
  setupDone: number;
  setupTotal: number;
  /** True when the customer chose the billing/account path (skips the setup gate). */
  billing: boolean;
};

function token(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function count(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1000, Math.floor(n))) : 0;
}

/** Whitelist the body's `prep`. Returns null unless every question has a valid answer. */
export function parseCallPrep(raw: unknown): CallPrep | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const q = (r.questionnaire && typeof r.questionnaire === "object" ? r.questionnaire : {}) as Record<string, unknown>;
  const blocker = token(q.blocker);
  const experience = token(q.experience);
  const share = token(q.share);
  if (!(CALL_PREP_VOCAB.blocker as readonly string[]).includes(blocker)) return null;
  if (!(CALL_PREP_VOCAB.experience as readonly string[]).includes(experience)) return null;
  if (!(CALL_PREP_VOCAB.share as readonly string[]).includes(share)) return null;
  const tried: string[] = [];
  for (const entry of (Array.isArray(q.tried) ? q.tried : []).slice(0, 16)) {
    const t = token(entry);
    if ((CALL_PREP_VOCAB.tried as readonly string[]).includes(t) && !tried.includes(t)) tried.push(t);
  }
  if (!tried.length) return null;
  const setup = (r.setup && typeof r.setup === "object" ? r.setup : {}) as Record<string, unknown>;
  return {
    blocker,
    tried,
    experience,
    share,
    setupDone: count(setup.done),
    setupTotal: count(setup.total),
    billing: r.reason === "billing" && blocker === "billing",
  };
}

/** True when the server should refuse bookings that arrive without valid prep. */
export function callPrepRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALL_PREP_REQUIRED === "1";
}

export type CallPrepVerdict =
  | { ok: true }
  | { ok: false; status: 422 | 403; code: typeof CALL_PREP_REQUIRED_CODE | typeof CALL_PREP_SETUP_CODE; error: string };

/**
 * Decide whether a license-key booking may proceed. `viaLicenseKey` is false for
 * the website's cookie session (no questionnaire UI there yet), which is exempt.
 */
export function checkCallPrep(opts: { viaLicenseKey: boolean; required: boolean; prep: unknown }): CallPrepVerdict {
  if (!opts.required || !opts.viaLicenseKey) return { ok: true };
  const prep = parseCallPrep(opts.prep);
  if (!prep) return { ok: false, status: 422, code: CALL_PREP_REQUIRED_CODE, error: CALL_PREP_REQUIRED_MESSAGE };
  if (!prep.billing && prep.setupTotal > 0 && prep.setupDone < prep.setupTotal) {
    return { ok: false, status: 403, code: CALL_PREP_SETUP_CODE, error: CALL_PREP_SETUP_MESSAGE };
  }
  return { ok: true };
}
