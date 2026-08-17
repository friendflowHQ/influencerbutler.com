// Shared helpers for the email marketing engine (campaigns + sequences),
// used by both the admin APIs and the /api/cron/email-marketing send engine.
//
// Tracking convention: every campaign send carries email_sends.category
// `campaign_<id8>` and every sequence step `seq_<id8>_s<position>`, so the
// existing per-category summary endpoint yields per-campaign and per-step
// open/click stats with no extra tracking code.

import type { SupabaseClient } from "@supabase/supabase-js";

export const MARKETING_FROM = "Influencer Butler <hello@influencerbutler.com>";

const CHUNK = 200;

/** First 8 hex chars of a UUID: short, stable, collision-safe at our scale. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function campaignCategory(id: string): string {
  return `campaign_${shortId(id)}`;
}

export function stepCategory(sequenceId: string, position: number): string {
  return `seq_${shortId(sequenceId)}_s${position}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Enrolls addresses into a sequence. Duplicates (already enrolled, whatever
 * their state) are silently ignored via the unique constraint. Returns how
 * many rows were attempted (not how many were new; PostgREST does not report
 * that for ignoreDuplicates upserts).
 */
export async function enrollEmails(
  db: SupabaseClient,
  sequenceId: string,
  emails: string[],
): Promise<number> {
  let attempted = 0;
  for (const slice of chunk(emails, CHUNK)) {
    const rows = slice.map((email) => ({ sequence_id: sequenceId, email }));
    const { error } = await db
      .from("email_sequence_enrollments")
      .upsert(rows, { onConflict: "sequence_id,email", ignoreDuplicates: true });
    if (error) {
      console.error("email-marketing: enroll upsert failed", error);
      continue;
    }
    attempted += slice.length;
  }
  return attempted;
}

/**
 * Fires tag_added auto-enrollment: every ACTIVE sequence whose trigger is
 * {kind:"tag_added", tag} gets the given addresses enrolled. Called
 * synchronously by the contacts API whenever a tag is applied (import or
 * bulk-tag); tag writes only happen there, so nothing needs polling.
 */
export async function enrollForTagAdded(
  db: SupabaseClient,
  tag: string,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) return;
  try {
    const { data, error } = await db
      .from("email_sequences")
      .select("id, trigger")
      .eq("status", "active");
    if (error || !data) return;
    for (const seq of data) {
      const trigger = (seq.trigger ?? null) as { kind?: string; tag?: string } | null;
      if (trigger?.kind === "tag_added" && trigger.tag === tag && typeof seq.id === "string") {
        await enrollEmails(db, seq.id, emails);
      }
    }
  } catch (err) {
    console.error("email-marketing: enrollForTagAdded threw", err);
  }
}

/**
 * Tag-on-send: ensures each address is a contact (email_subscribers) and, when
 * a tag is given, unions it onto their existing tags without replacing them.
 * Used by the campaign materializer so a send can grow and segment the list in
 * one step. Best-effort: a missing table/column just no-ops. Also fires
 * tag_added sequence auto-enrollment for the tag, matching the contacts API.
 */
export async function tagRecipientsAsContacts(
  db: SupabaseClient,
  emails: string[],
  tag: string | null,
  source: string,
): Promise<void> {
  if (emails.length === 0) return;
  try {
    for (const slice of chunk(emails, CHUNK)) {
      const { data: existing, error: readErr } = await db
        .from("email_subscribers")
        .select("email, tags")
        .in("email", slice);
      if (readErr) return; // table/column missing: degrade to no-op

      const existingByEmail = new Map<string, string[]>();
      for (const row of existing ?? []) {
        if (typeof row.email !== "string") continue;
        existingByEmail.set(
          row.email.toLowerCase(),
          Array.isArray(row.tags)
            ? row.tags.filter((t: unknown): t is string => typeof t === "string")
            : [],
        );
      }

      const fresh = slice.filter((e) => !existingByEmail.has(e));
      if (fresh.length > 0) {
        const rows = fresh.map((email) => ({ email, source, tags: tag ? [tag] : [] }));
        const { error: insertErr } = await db.from("email_subscribers").insert(rows);
        if (insertErr) console.error("email-marketing: contact insert failed", insertErr);
      }

      if (tag) {
        for (const [email, tags] of existingByEmail) {
          if (tags.includes(tag)) continue;
          const { error: updErr } = await db
            .from("email_subscribers")
            .update({ tags: [...tags, tag] })
            .eq("email", email);
          if (updErr) console.error("email-marketing: contact tag union failed", { email, updErr });
        }
      }
    }
    if (tag) await enrollForTagAdded(db, tag, emails);
  } catch (err) {
    console.error("email-marketing: tagRecipientsAsContacts threw", err);
  }
}
