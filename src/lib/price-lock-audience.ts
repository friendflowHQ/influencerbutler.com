/**
 * Price lock push audiences (Nov 12 - Nov 30 2026).
 *
 *   A  Leads: contacts (newsletter, download leads, ...) and accounts that never
 *      paid, with no live subscription or trial.
 *   B  Paying subscribers (live, non-comp, not on a trial).
 *   C  Comped users whose comp is live and who have not added a card yet.
 *   D  Cancelled customers: paid at least once, nothing live now. Sorted with
 *      cancel-survey "Yes, likely" and "Maybe someday" first.
 *   E1 / E2 / E3  Cold contacts, frozen once by buildColdSnapshot() as the
 *      contact tags pl-e1 / pl-e2 / pl-e3: clicked a cold email / opened but
 *      never clicked / neither.
 *
 * One person is in one segment (precedence B > C > D > A > E). Anyone who has
 * started a trial (card or no-card), is paying, or whose comp added a card is
 * in no push audience at all, and is re-checked at send time
 * (priceLockSendCheck) so they drop out mid-push.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PriceLockSegment = "A" | "B" | "C" | "D" | "E1" | "E2" | "E3";
export const PRICE_LOCK_SEGMENTS: readonly PriceLockSegment[] = ["A", "B", "C", "D", "E1", "E2", "E3"];
export const COLD_SEGMENT_TAG: Record<"E1" | "E2" | "E3", string> = { E1: "pl-e1", E2: "pl-e2", E3: "pl-e3" };

const PAGE = 1000;
const LIVE = new Set(["active", "on_trial", "past_due", "paused"]);

/** Facts about one person, gathered from billing + contacts. */
export type PersonFacts = {
  liveNonCompPaid: boolean; // active / past_due / paused, not a comp
  liveNonCompTrial: boolean; // on_trial, not a comp (card trial)
  liveNoCardTrial: boolean; // in-house kind=trial comp still running
  liveComp: boolean; // any other live comp
  compCardAdded: boolean; // comp_grants.converted_at set (Keep my plan done)
  everPaid: boolean; // a paid order > $0
  coldTag: "E1" | "E2" | "E3" | null;
  isColdContact: boolean; // came in through a cold list (tags cold-* etc.)
};

/** Pure segment decision. Null = in no push audience. */
export function classifyPerson(f: PersonFacts): PriceLockSegment | null {
  if (f.liveNonCompPaid) return "B";
  if (f.liveNonCompTrial || f.liveNoCardTrial) return null; // started a trial: out
  if (f.liveComp) return f.compCardAdded ? null : "C";
  if (f.everPaid) return "D";
  if (f.coldTag) return f.coldTag;
  if (f.isColdContact) return null; // cold, but not in the frozen snapshot
  return "A";
}

/** A contact that only exists because of cold outreach. */
export function isColdContactTags(tags: readonly string[] | null | undefined, source?: string | null): boolean {
  const all = (tags ?? []).map((t) => t.toLowerCase());
  if (all.some((t) => /^cold[-_]/.test(t) || /^seq-cold[-_]/.test(t) || t.startsWith("pl-e"))) return true;
  return typeof source === "string" && /^cold[-_]/i.test(source);
}

function norm(e: unknown): string {
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}

async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export type PriceLockPeople = {
  segmentOf: Map<string, PriceLockSegment>;
  /** D only: "yes" | "maybe" | "no" | null from the cancel survey. */
  wouldReturn: Map<string, string | null>;
  suppressed: Set<string>;
  /** C only: the running comp's subscription id (for the Keep my plan link). */
  compSubIdOf: Map<string, string>;
  /** Emails with an Influencer Butler account (a profile). */
  accounts: Set<string>;
  /** Where each person came from, for the segment-size report. */
  originOf: Map<string, string>;
};

/** Coarse origin label for the size report and for leaving whole lists out. */
export function originLabel(hasAccount: boolean, tags: readonly string[], source: string | null): string {
  if (hasAccount) return "account";
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => x.startsWith("dani-austin"))) return "dani-austin-giveaway";
  if (t.some((x) => x.startsWith("instagram-posse"))) return "instagram-posse";
  if (t.some((x) => x.startsWith("live-sweet"))) return "live-sweet";
  if (t.some((x) => x.startsWith("fluencer-fruit"))) return "fluencer-fruit";
  if (t.some((x) => x.startsWith("grow-together") || x.startsWith("bundle-"))) return "grow-together";
  if (source === "download-app") return "download";
  if (source && /newsletter|foyer|footer|blog/i.test(source)) return "newsletter";
  return source ? `source:${source}`.slice(0, 40) : "other";
}

/**
 * Loads every reachable person and their segment. Throws on a read error (a
 * push must never go out to a half-built audience).
 */
export async function loadPriceLockPeople(db: SupabaseClient): Promise<PriceLockPeople> {
  const fail = (what: string) => {
    throw new Error(`price-lock audience: could not read ${what}`);
  };
  const profiles =
    (await pageAll<{ id: string; email: string | null }>((a, b) =>
      db.from("profiles").select("id, email").order("id").range(a, b),
    )) ?? fail("profiles");
  const subs =
    (await pageAll<{ user_id: string | null; status: string | null; ls_subscription_id: string | null }>((a, b) =>
      db.from("subscriptions").select("user_id, status, ls_subscription_id").order("ls_subscription_id").range(a, b),
    )) ?? fail("subscriptions");
  type GrantRow = {
    user_id: string | null;
    user_email: string | null;
    ls_subscription_id: string | null;
    expires_at: string | null;
    cancelled_at: string | null;
    converted_at?: string | null;
    kind?: string | null;
  };
  // select("*"): kind / converted_at are later migrations that prod may lack.
  const grants =
    (await pageAll<GrantRow>((a, b) => db.from("comp_grants").select("*").order("ls_subscription_id").range(a, b))) ??
    fail("comp_grants");
  const orders =
    (await pageAll<{ user_id: string | null; total: number | null }>((a, b) =>
      db.from("orders").select("user_id, total").eq("status", "paid").gt("total", 0).order("created_at").range(a, b),
    )) ?? fail("orders");
  const reasons =
    (await pageAll<{ user_id: string | null; would_return?: string | null; completed_at?: string | null }>((a, b) =>
      db.from("subscription_cancel_reasons").select("*").order("id").range(a, b),
    )) ?? [];
  const contacts =
    (await pageAll<{ email: string; source: string | null; tags: string[] | null; unsubscribed_at: string | null }>(
      (a, b) => db.from("email_subscribers").select("email, source, tags, unsubscribed_at").order("email").range(a, b),
    )) ?? fail("email_subscribers");
  const suppressions =
    (await pageAll<{ email: string }>((a, b) => db.from("email_suppressions").select("email").order("email").range(a, b))) ??
    fail("email_suppressions");

  const now = Date.now();
  const compSubIds = new Set<string>();
  const compSubIdOf = new Map<string, string>();
  const facts = new Map<string, PersonFacts>(); // keyed by email
  const emailOfUser = new Map<string, string>();
  const blank = (): PersonFacts => ({
    liveNonCompPaid: false,
    liveNonCompTrial: false,
    liveNoCardTrial: false,
    liveComp: false,
    compCardAdded: false,
    everPaid: false,
    coldTag: null,
    isColdContact: false,
  });
  const get = (email: string) => {
    let f = facts.get(email);
    if (!f) facts.set(email, (f = blank()));
    return f;
  };

  for (const p of profiles) {
    const email = norm(p.email);
    if (!email) continue;
    emailOfUser.set(p.id, email);
    get(email);
  }
  for (const g of grants) {
    if (g.ls_subscription_id) compSubIds.add(g.ls_subscription_id);
    const email = (g.user_id && emailOfUser.get(g.user_id)) || norm(g.user_email);
    if (!email) continue;
    const running =
      !g.cancelled_at && (!g.expires_at || Date.parse(g.expires_at) > now);
    const f = get(email);
    if (g.converted_at) f.compCardAdded = true;
    if (running) {
      if (g.kind === "trial") f.liveNoCardTrial = true;
      else {
        f.liveComp = true;
        if (g.ls_subscription_id) compSubIdOf.set(email, g.ls_subscription_id);
      }
    }
  }
  for (const s of subs) {
    const email = s.user_id ? emailOfUser.get(s.user_id) : undefined;
    if (!email || !LIVE.has(String(s.status))) continue;
    const id = s.ls_subscription_id ?? "";
    const isComp = id.startsWith("comp:") || compSubIds.has(id);
    const f = get(email);
    if (isComp) {
      // A live comp subscription row; its grant decides trial vs comp. Without a
      // grant row, treat it as a comp.
      if (!f.liveNoCardTrial) f.liveComp = true;
    } else if (s.status === "on_trial") f.liveNonCompTrial = true;
    else f.liveNonCompPaid = true;
  }
  for (const o of orders) {
    const email = o.user_id ? emailOfUser.get(o.user_id) : undefined;
    if (email) get(email).everPaid = true;
  }
  const suppressed = new Set<string>(suppressions.map((s) => norm(s.email)).filter(Boolean));
  const accountSet = new Set(emailOfUser.values());
  const originOf = new Map<string, string>();
  for (const email of accountSet) originOf.set(email, "account");
  for (const c of contacts) {
    const email = norm(c.email);
    if (!email) continue;
    if (c.unsubscribed_at) suppressed.add(email);
    const f = get(email);
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    if (tags.includes("pl-e1")) f.coldTag = "E1";
    else if (tags.includes("pl-e2")) f.coldTag = "E2";
    else if (tags.includes("pl-e3")) f.coldTag = "E3";
    if (isColdContactTags(tags, c.source)) f.isColdContact = true;
    if (!originOf.has(email)) originOf.set(email, originLabel(false, tags, c.source));
  }
  // A cold contact who signed up for an account is a lead, not cold.
  for (const email of emailOfUser.values()) {
    const f = facts.get(email);
    if (f && f.isColdContact && !f.coldTag) f.isColdContact = false;
  }

  const wouldReturn = new Map<string, string | null>();
  const latest = new Map<string, { at: number; v: string | null }>();
  for (const r of reasons) {
    const email = r.user_id ? emailOfUser.get(r.user_id) : undefined;
    if (!email) continue;
    const at = r.completed_at ? Date.parse(r.completed_at) : 0;
    const prev = latest.get(email);
    if (!prev || at >= prev.at) latest.set(email, { at, v: r.would_return ?? null });
  }

  const segmentOf = new Map<string, PriceLockSegment>();
  for (const [email, f] of facts) {
    if (suppressed.has(email)) continue;
    const seg = classifyPerson(f);
    if (!seg) continue;
    segmentOf.set(email, seg);
    if (seg === "D") wouldReturn.set(email, latest.get(email)?.v ?? null);
  }
  return { segmentOf, wouldReturn, suppressed, compSubIdOf, accounts: accountSet, originOf };
}

/** Ordered recipients for a segment (D: "yes" then "maybe" then the rest). */
export function emailsForSegment(people: PriceLockPeople, segment: PriceLockSegment): string[] {
  const out: string[] = [];
  for (const [email, seg] of people.segmentOf) if (seg === segment) out.push(email);
  if (segment === "D") {
    const rank = (e: string) => {
      const v = people.wouldReturn.get(e);
      return v === "yes" ? 0 : v === "maybe" ? 1 : 2;
    };
    out.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  } else out.sort();
  return out;
}

/** Segment A broken down by where people came from. */
export function segmentAOrigins(people: PriceLockPeople): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [email, seg] of people.segmentOf) {
    if (seg !== "A") continue;
    const o = people.originOf.get(email) ?? "other";
    out[o] = (out[o] ?? 0) + 1;
  }
  return out;
}

/** Counts per segment, plus D by survey answer. */
export function segmentCounts(people: PriceLockPeople): Record<string, number> {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E1: 0, E2: 0, E3: 0, D_yes: 0, D_maybe: 0, D_no: 0 };
  for (const [email, seg] of people.segmentOf) {
    counts[seg] += 1;
    if (seg === "D") {
      const v = people.wouldReturn.get(email);
      if (v === "yes") counts.D_yes += 1;
      else if (v === "maybe") counts.D_maybe += 1;
      else if (v === "no") counts.D_no += 1;
    }
  }
  return counts;
}

/** Everyone who clicked (a non-unsubscribe link) in any of these campaigns. */
export async function campaignClickers(db: SupabaseClient, campaignIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const id of campaignIds) {
    const category = `campaign_${id.replace(/-/g, "").slice(0, 8)}`;
    const rows =
      (await pageAll<{ recipient: string; resend_id: string | null; clicked_at: string | null }>((a, b) =>
        db
          .from("email_sends")
          .select("recipient, resend_id, clicked_at")
          .eq("category", category)
          .not("clicked_at", "is", null)
          .order("id")
          .range(a, b),
      )) ?? [];
    const realClicks = await nonUnsubscribeClickIds(db, rows.map((r) => r.resend_id).filter((x): x is string => !!x));
    for (const r of rows) if (r.resend_id && realClicks.has(r.resend_id)) out.add(norm(r.recipient));
  }
  return out;
}

/** Of these Resend ids, the ones with at least one click that was not an unsubscribe link. */
export async function nonUnsubscribeClickIds(db: SupabaseClient, resendIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < resendIds.length; i += 200) {
    const slice = resendIds.slice(i, i + 200);
    const { data, error } = await db
      .from("email_send_events")
      .select("resend_id, url")
      .in("resend_id", slice)
      .eq("type", "email.clicked");
    if (error) {
      // No event detail: fall back to counting the click.
      for (const id of slice) out.add(id);
      continue;
    }
    for (const row of (data ?? []) as { resend_id: string; url: string | null }[]) {
      if (!row.url || !/\/api\/email\/unsubscribe/i.test(row.url)) out.add(row.resend_id);
    }
  }
  return out;
}

/**
 * Send-time re-check for one push recipient: still in the segment the
 * campaign targets? Uses a fresh load per cron run (cached by the caller).
 */
export function stillInSegment(people: PriceLockPeople, email: string, segment: PriceLockSegment): boolean {
  return people.segmentOf.get(norm(email)) === segment;
}
