// Setup snapshot: what the desktop app tells us about a customer's setup.
//
// Owner decision (2026-11-23): customers kept booking calls without doing the
// guided setups (a 45 minute call was spent finding photos for an AI clone). A
// checkbox on the booking page is only an attestation (src/lib/call-prerequisites.ts),
// so the desktop app now reports, per butler id, which REQUIRED setup steps are
// done and which are missing (names only, never keys, emails or URLs) to
// POST /api/me/setup-snapshot. This module is the pure half: it cleans what the
// app sent, and decides, for a booking's picked topics, which checklist items
// are verified done, which are verified missing, and which we cannot tell.
//
// The snapshot is self-reported by the customer's own app, so it is still not
// proof against someone who forges it; it is proof against forgetting, and it
// gives the owner the exact missing steps. Fails open everywhere: no snapshot,
// a stale one, or a butler the app never reported all mean "unknown", and the
// checklist checkbox applies as before.
//
// Pure module, unit-tested in src/lib/__tests__/setup-snapshot.test.ts.

import { prereqsFor, type Prereq } from "@/lib/call-prerequisites";
import type { CallTypeKey } from "@/lib/scheduling";

export const SETUP_NOT_DONE_CODE = "setup_not_done";

/** A snapshot older than this is ignored (the app syncs on start and on every change). */
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * THE one table: call topic key -> checklist item id -> the desktop butler ids
 * (REQUIREMENTS ids in the app's src/shared/butler-setup-requirements.js) whose
 * required steps prove that item. A checklist item that is not listed here cannot
 * be verified (photos ready, link pasted, extension installed), and a topic with
 * no butler (foyer, youtube, extension, broken) stays on its checkbox.
 */
export const TOPIC_SETUP: Record<string, Record<string, string[]>> = {
  "facebook-deals": { "facebook-deals.guide": ["deals"] },
  "deals-butler": { "deals-butler.guide": ["deals"] },
  instagram: { "instagram.guide": ["instagram"] },
  amazon: {
    "amazon.signin": ["storefrontbutler"],
    "amazon.checklist": ["storefrontbutler", "cc-check", "amazonbutler"],
  },
  "mavely-walmart": { "mavely-walmart.signin": ["walmartbutler"] },
  "ai-influencer": { "ai-influencer.key": ["ai-clone-butler"] },
};

export type SnapshotMissingStep = { id: string; label: string };
export type SnapshotButler = { done: number; total: number; missing: SnapshotMissingStep[] };
export type SetupSnapshot = {
  v: 1;
  at: string;
  requiredDone: number;
  requiredTotal: number;
  line: string;
  butlers: Record<string, SnapshotButler>;
};

const MAX_BUTLERS = 100;
const MAX_MISSING = 12;
const MAX_LABEL = 80;
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const TOKEN_RE = /\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{24,}\b|\b[A-Za-z]{32,}\b/g;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(EMAIL_RE, "[hidden]")
    .replace(URL_RE, "[hidden]")
    .replace(TOKEN_RE, "[hidden]")
    .trim()
    .slice(0, max);
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1000) : 0;
}

/**
 * Keep only the known, bounded shape from whatever the app (or anyone holding a
 * license key) posted. Unknown fields are dropped, text is scrubbed of anything
 * that looks like an email, link or token. Returns null for an unusable body.
 */
export function sanitizeSnapshot(raw: unknown, now: number = Date.now()): SetupSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!r.butlers || typeof r.butlers !== "object" || Array.isArray(r.butlers)) return null;
  const butlers: Record<string, SnapshotButler> = {};
  let requiredDone = 0;
  let requiredTotal = 0;
  for (const [id, value] of Object.entries(r.butlers as Record<string, unknown>).slice(0, MAX_BUTLERS)) {
    if (!ID_RE.test(id) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const b = value as Record<string, unknown>;
    const total = count(b.total);
    if (!total) continue;
    const missing: SnapshotMissingStep[] = [];
    for (const m of (Array.isArray(b.missing) ? b.missing : []).slice(0, MAX_MISSING)) {
      const mid = m && typeof m === "object" ? String((m as Record<string, unknown>).id ?? "") : "";
      if (!ID_RE.test(mid)) continue;
      const label = cleanText((m as Record<string, unknown>).label, MAX_LABEL) || mid;
      missing.push({ id: mid, label });
    }
    // done can never exceed what is left once the missing steps are counted.
    const done = Math.min(count(b.done), Math.max(0, total - missing.length));
    butlers[id] = { done, total, missing };
    requiredDone += done;
    requiredTotal += total;
  }
  if (!Object.keys(butlers).length) return null;
  // `at` is the app's clock; keep it only when it is a real date, never in the future.
  const at = new Date(typeof r.at === "string" ? r.at : "");
  const atMs = Number.isNaN(at.getTime()) ? now : Math.min(at.getTime(), now);
  return {
    v: 1,
    at: new Date(atMs).toISOString(),
    requiredDone,
    requiredTotal,
    line: cleanText(r.line, 400),
    butlers,
  };
}

export type ItemState = "verified" | "missing" | "unknown";
export type VerifiedItem = {
  prereqId: string;
  state: ItemState;
  /** Exact missing steps (only when state is "missing"). */
  missing: { butlerId: string; id: string; label: string }[];
};
export type SetupVerification = {
  /** True when a fresh snapshot was used. */
  hasSnapshot: boolean;
  updatedAt: string | null;
  items: VerifiedItem[];
};

/** True unless the kill switch CALL_SETUP_VERIFY=0 is set. */
export function setupVerifyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALL_SETUP_VERIFY !== "0";
}

/**
 * For the checklist of the picked topics, which items the snapshot verifies or
 * contradicts. An item is "verified" only when EVERY butler that proves it is in
 * the snapshot with no missing required step; "missing" as soon as any reported
 * butler has one; otherwise "unknown" (no snapshot, stale, or butler not reported).
 */
export function verifySetup(opts: {
  topics: string[] | null | undefined;
  type: CallTypeKey;
  snapshot: SetupSnapshot | null | undefined;
  /** When the snapshot row was last written (ISO). Falls back to snapshot.at. */
  updatedAt?: string | null;
  now?: number;
}): SetupVerification {
  const now = opts.now ?? Date.now();
  const checklist: Prereq[] = prereqsFor(opts.topics, opts.type);
  const stamp = opts.updatedAt || opts.snapshot?.at || null;
  const stampMs = stamp ? Date.parse(stamp) : NaN;
  const fresh = !!opts.snapshot && Number.isFinite(stampMs) && now - stampMs <= SNAPSHOT_MAX_AGE_MS;
  const byItem = new Map<string, string[]>();
  for (const key of new Set(opts.topics ?? [])) {
    for (const [id, butlers] of Object.entries(TOPIC_SETUP[key] ?? {})) byItem.set(id, butlers);
  }
  const items: VerifiedItem[] = checklist.map((p) => {
    const butlers = byItem.get(p.id);
    if (!fresh || !butlers) return { prereqId: p.id, state: "unknown" as const, missing: [] };
    const missing: VerifiedItem["missing"] = [];
    let reported = 0;
    for (const butlerId of butlers) {
      const b = opts.snapshot!.butlers[butlerId];
      if (!b) continue;
      reported += 1;
      for (const m of b.missing) missing.push({ butlerId, id: m.id, label: m.label });
    }
    if (missing.length) return { prereqId: p.id, state: "missing" as const, missing };
    return { prereqId: p.id, state: reported === butlers.length ? ("verified" as const) : ("unknown" as const), missing: [] };
  });
  return { hasSnapshot: fresh, updatedAt: fresh ? stamp : null, items };
}

/** The customer-facing refusal that names the exact steps, grouped by checklist item. */
export function setupNotDoneMessage(v: SetupVerification): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const it of v.items) {
    if (it.state !== "missing") continue;
    for (const m of it.missing) {
      const k = `${m.butlerId}:${m.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(m.label);
    }
  }
  return (
    "The app shows some required setup is not finished yet: " +
    lines.join("; ") +
    ". Please finish it (left menu, Setup Checklist), then come back and book. " +
    "Butler AI (the chat bubble) can walk you through any step."
  );
}

/** Ids of the checklist items the snapshot already proves, so the checkbox is not needed for them. */
export function verifiedPrereqIds(v: SetupVerification): string[] {
  return v.items.filter((i) => i.state === "verified").map((i) => i.prereqId);
}
