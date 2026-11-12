/**
 * Cold contact report + snapshot for the price lock push.
 *
 * "Cold" mail = any sequence or campaign the admin Streams view counts as cold
 * (stream 'cold', a name starting "cold", or a tag trigger starting "cold-").
 * For every address that was SENT a cold email we take the strongest signal:
 *   E1 clicked a real link (unsubscribe clicks do not count)
 *   E2 opened but never clicked (opens are inflated by Apple Mail, so weak)
 *   E3 neither
 * Bounced or complained addresses, unsubscribes, and anyone who has since
 * become a lead, customer or comp (segments A-D) are left out.
 *
 * snapshotCold(write: true) freezes the result as contact tags pl-e1 / pl-e2 /
 * pl-e3 (no migration needed), which the E campaigns and tracking read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLD_SEGMENT_TAG, loadPriceLockPeople, nonUnsubscribeClickIds } from "@/lib/price-lock-audience";

const PAGE = 1000;

export function isColdOwner(row: { stream?: unknown; name?: unknown; trigger?: unknown; apply_tag?: unknown }): boolean {
  if (row.stream === "cold") return true;
  const name = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
  if (/^cold\b/.test(name)) return true;
  const trigger = row.trigger as { kind?: unknown; tag?: unknown } | null | undefined;
  if (trigger && trigger.kind === "tag_added" && typeof trigger.tag === "string" && /^cold[-_]/i.test(trigger.tag.trim())) {
    return true;
  }
  return typeof row.apply_tag === "string" && /^cold[-_]/i.test(row.apply_tag.trim());
}

export type ColdSourceStats = {
  kind: "sequence" | "campaign";
  id: string;
  name: string;
  stream: string;
  trackOpens: boolean | null;
  status: string | null;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

export type ColdReport = {
  sources: ColdSourceStats[];
  fromDomain: { lifecycle: string; cold: string | null };
  totals: { sent: number; recipients: number; opened: number; clicked: number; bounced: number; complained: number };
  groups: { E1: number; E2: number; E3: number };
  excluded: { nowCustomerOrLead: number; bouncedOrComplained: number; suppressed: number };
  /** Best cold email so far by unique click rate (min 50 sends), for the E3 resend. */
  bestStep: { category: string; subject: string; sent: number; clickRate: number } | null;
  written?: { E1: number; E2: number; E3: number };
};

function domainOf(from: string | undefined | null): string | null {
  if (!from) return null;
  const m = /@([^>\s]+)/.exec(from);
  return m ? m[1].toLowerCase() : null;
}

type SendRow = {
  recipient: string;
  category: string;
  subject: string | null;
  status: string | null;
  resend_id: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
};

export async function coldReport(db: SupabaseClient, opts: { write?: boolean } = {}): Promise<ColdReport> {
  const seqRes = await db.from("email_sequences").select("id, name, stream, trigger, track_opens, status");
  if (seqRes.error) throw new Error("could not read email_sequences");
  const campRes = await db.from("email_campaigns").select("id, name, stream, apply_tag, status");
  const sequences = (seqRes.data ?? []) as Record<string, unknown>[];
  const campaigns = (campRes.data ?? []) as Record<string, unknown>[];

  const prefixes: { prefix: string; src: ColdSourceStats }[] = [];
  for (const s of sequences.filter(isColdOwner)) {
    const id = String(s.id);
    prefixes.push({
      prefix: `seq_${id.slice(0, 8)}_`,
      src: {
        kind: "sequence",
        id,
        name: String(s.name ?? ""),
        stream: String(s.stream ?? "lifecycle"),
        trackOpens: typeof s.track_opens === "boolean" ? s.track_opens : null,
        status: (s.status as string) ?? null,
        sent: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
      },
    });
  }
  for (const c of campaigns.filter(isColdOwner)) {
    const id = String(c.id);
    prefixes.push({
      prefix: `campaign_${id.slice(0, 8)}`,
      src: {
        kind: "campaign",
        id,
        name: String(c.name ?? ""),
        stream: String(c.stream ?? "lifecycle"),
        trackOpens: null,
        status: (c.status as string) ?? null,
        sent: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
      },
    });
  }

  const rows: SendRow[] = [];
  for (const { prefix } of prefixes) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("email_sends")
        .select("recipient, category, subject, status, resend_id, opened_at, clicked_at, bounced_at, complained_at")
        .like("category", `${prefix}%`)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error("could not read email_sends");
      rows.push(...((data ?? []) as SendRow[]));
      if (!data || data.length < PAGE) break;
    }
  }

  const realClicks = await nonUnsubscribeClickIds(
    db,
    rows.filter((r) => r.clicked_at && r.resend_id).map((r) => r.resend_id as string),
  );

  type Person = { clicked: boolean; opened: boolean; bad: boolean };
  const people = new Map<string, Person>();
  const byStep = new Map<string, { subject: string; sent: Set<string>; clicked: Set<string> }>();
  for (const r of rows) {
    if (r.status !== "sent") continue;
    const email = r.recipient.trim().toLowerCase();
    const src = prefixes.find((p) => r.category.startsWith(p.prefix))?.src;
    const clicked = Boolean(r.clicked_at && r.resend_id && realClicks.has(r.resend_id));
    if (src) {
      src.sent += 1;
      if (r.opened_at) src.opened += 1;
      if (clicked) src.clicked += 1;
      if (r.bounced_at) src.bounced += 1;
      if (r.complained_at) src.complained += 1;
    }
    const p = people.get(email) ?? { clicked: false, opened: false, bad: false };
    if (clicked) p.clicked = true;
    if (r.opened_at) p.opened = true;
    if (r.bounced_at || r.complained_at) p.bad = true;
    people.set(email, p);
    const step = byStep.get(r.category) ?? { subject: r.subject ?? "", sent: new Set(), clicked: new Set() };
    step.sent.add(email);
    if (clicked) step.clicked.add(email);
    byStep.set(r.category, step);
  }

  const known = await loadPriceLockPeople(db);
  const groups = { E1: [] as string[], E2: [] as string[], E3: [] as string[] };
  const excluded = { nowCustomerOrLead: 0, bouncedOrComplained: 0, suppressed: 0 };
  for (const [email, p] of people) {
    if (p.bad) {
      excluded.bouncedOrComplained += 1;
      continue;
    }
    if (known.suppressed.has(email)) {
      excluded.suppressed += 1;
      continue;
    }
    // Left out: customers, comps and cancelled customers (B/C/D), and leads
    // with an account. A contact who only ever got cold mail stays cold even
    // if its tags never said so (e.g. a pasted list).
    const seg = known.segmentOf.get(email);
    if (seg && (seg === "B" || seg === "C" || seg === "D" || (seg === "A" && known.accounts.has(email)))) {
      excluded.nowCustomerOrLead += 1;
      continue;
    }
    if (p.clicked) groups.E1.push(email);
    else if (p.opened) groups.E2.push(email);
    else groups.E3.push(email);
  }

  let bestStep: ColdReport["bestStep"] = null;
  for (const [category, st] of byStep) {
    if (st.sent.size < 50) continue;
    const rate = st.clicked.size / st.sent.size;
    if (!bestStep || rate > bestStep.clickRate) {
      bestStep = { category, subject: st.subject, sent: st.sent.size, clickRate: Math.round(rate * 10000) / 10000 };
    }
  }

  const totals = { sent: 0, recipients: people.size, opened: 0, clicked: 0, bounced: 0, complained: 0 };
  for (const { src } of prefixes) {
    totals.sent += src.sent;
    totals.opened += src.opened;
    totals.clicked += src.clicked;
    totals.bounced += src.bounced;
    totals.complained += src.complained;
  }

  const report: ColdReport = {
    sources: prefixes.map((p) => p.src).filter((s) => s.sent > 0 || s.status === "active"),
    fromDomain: {
      lifecycle: domainOf(process.env.EMAIL_FROM_LIFECYCLE) ?? "influencerbutler.com",
      cold: domainOf(process.env.EMAIL_FROM_COLD),
    },
    totals,
    groups: { E1: groups.E1.length, E2: groups.E2.length, E3: groups.E3.length },
    excluded,
    bestStep,
  };

  if (opts.write) {
    report.written = { E1: 0, E2: 0, E3: 0 };
    for (const key of ["E1", "E2", "E3"] as const) {
      report.written[key] = await addTag(db, groups[key], COLD_SEGMENT_TAG[key]);
    }
  }
  return report;
}

/** Adds `tag` to each contact's tags (creating no new contacts). Returns how many were tagged. */
async function addTag(db: SupabaseClient, emails: string[], tag: string): Promise<number> {
  let done = 0;
  for (let i = 0; i < emails.length; i += 200) {
    const slice = emails.slice(i, i + 200);
    const { data, error } = await db.from("email_subscribers").select("email, tags").in("email", slice);
    if (error) throw new Error("could not read contacts for tagging");
    for (const row of (data ?? []) as { email: string; tags: string[] | null }[]) {
      const tags = new Set((row.tags ?? []).filter((t) => !/^pl-e[123]$/.test(t)));
      tags.add(tag);
      const { error: upErr } = await db.from("email_subscribers").update({ tags: [...tags] }).eq("email", row.email);
      if (!upErr) done += 1;
    }
  }
  return done;
}
