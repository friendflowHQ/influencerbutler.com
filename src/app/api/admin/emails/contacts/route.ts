/**
 * Admin contacts API for the email marketing engine.
 *
 * GET   /api/admin/emails/contacts?query=&tag=&page=
 *   Paged list of email_subscribers (newest first) plus per-tag counts.
 * POST  { emails, tags?, source?, syncToResendAudience? }
 *   Bulk import: inserts new subscribers, unions tags onto existing ones, and
 *   fires tag_added sequence auto-enrollment for every applied tag.
 * PATCH { action: "tag" | "untag" | "unsubscribe", emails, tag? }
 *   Bulk tag/untag, or add addresses to the suppression list.
 *
 * Depends on the 20260817_email_marketing migration (the tags column);
 * responses degrade with migrationPending until it is applied.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE, normalizeTag, parseEmailList } from "@/lib/email-audience";
import { enrollForTagAdded } from "@/lib/email-marketing";
import { recordSuppression } from "@/lib/email-unsubscribe";
import { addToResendAudience } from "@/lib/resend-audience";
import { isMissingTable } from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const CHUNK = 200;
const MAX_EMAILS = 2000;
const MAX_TAGS = 10;
const TAG_COUNT_PAGE = 1000;
const TAG_COUNT_CAP = 10000;

function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getDb(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Validates an untrusted emails array: lowercased, deduped, capped. */
function cleanEmailArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const email = entry.trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) continue;
    if (seen.size < MAX_EMAILS) seen.add(email);
  }
  return [...seen];
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const tag = normalizeTag(url.searchParams.get("tag") ?? "");
  const pageRaw = Number(url.searchParams.get("page") ?? "0");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;

  let q = db
    .from("email_subscribers")
    .select("email, source, tags, created_at, unsubscribed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (query) {
    // Escape LIKE wildcards so a literal % or _ in the search doesn't widen it.
    const escaped = query.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.ilike("email", `%${escaped}%`);
  }
  if (tag) q = q.contains("tags", [tag]);

  const { data, error, count } = await q;
  if (error) {
    // Most likely the migration (tags column) is not applied yet.
    console.error("admin emails/contacts: query failed", error);
    return NextResponse.json({
      rows: [],
      total: 0,
      tagCounts: {},
      page,
      pageSize: PAGE_SIZE,
      migrationPending: true,
    });
  }

  // Tag counts across the whole table, paged and capped.
  const tagCounts: Record<string, number> = {};
  for (let offset = 0; offset < TAG_COUNT_CAP; offset += TAG_COUNT_PAGE) {
    const { data: tagRows, error: tagErr } = await db
      .from("email_subscribers")
      .select("tags")
      .range(offset, offset + TAG_COUNT_PAGE - 1);
    if (tagErr) break;
    for (const row of tagRows ?? []) {
      if (!Array.isArray(row.tags)) continue;
      for (const t of row.tags) {
        if (typeof t === "string" && t) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      }
    }
    if ((tagRows ?? []).length < TAG_COUNT_PAGE) break;
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    tagCounts,
    page,
    pageSize: PAGE_SIZE,
    migrationPending: false,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: {
    emails?: unknown;
    tags?: unknown;
    source?: unknown;
    syncToResendAudience?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.emails !== "string" || body.emails.trim().length === 0) {
    return NextResponse.json({ error: "emails is required" }, { status: 400 });
  }
  const { emails, invalid } = parseEmailList(body.emails, MAX_EMAILS);
  if (emails.length === 0) {
    return NextResponse.json({ error: "No valid email addresses", invalid }, { status: 400 });
  }

  const tags: string[] = [];
  if (Array.isArray(body.tags)) {
    for (const raw of body.tags) {
      if (typeof raw !== "string") continue;
      const tag = normalizeTag(raw);
      if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) tags.push(tag);
    }
  }

  const source =
    typeof body.source === "string" && body.source.trim().length > 0
      ? body.source.trim().slice(0, 60)
      : "manual-import";
  const syncToResendAudience = body.syncToResendAudience === true;

  let added = 0;
  let existingTagged = 0;
  const newEmails: string[] = [];

  for (const slice of chunkArr(emails, CHUNK)) {
    const { data: existingRows, error: readErr } = await db
      .from("email_subscribers")
      .select("email, tags")
      .in("email", slice);
    if (readErr) {
      if (isMissingTable(readErr)) {
        return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
      }
      console.error("admin emails/contacts: import read failed", readErr);
      continue;
    }

    const existingByEmail = new Map<string, string[]>();
    for (const row of existingRows ?? []) {
      if (typeof row.email !== "string") continue;
      existingByEmail.set(
        row.email.toLowerCase(),
        Array.isArray(row.tags) ? row.tags.filter((t: unknown): t is string => typeof t === "string") : [],
      );
    }

    const freshEmails = slice.filter((e) => !existingByEmail.has(e));
    if (freshEmails.length > 0) {
      const rows = freshEmails.map((email) => ({ email, source, tags }));
      const { error: insertErr } = await db.from("email_subscribers").insert(rows);
      if (insertErr) {
        if (isMissingTable(insertErr)) {
          return NextResponse.json(
            { error: "Migration pending", migrationPending: true },
            { status: 409 },
          );
        }
        console.error("admin emails/contacts: import insert failed", insertErr);
      } else {
        added += freshEmails.length;
        newEmails.push(...freshEmails);
      }
    }

    // Union the import's tags onto existing rows that don't have them yet.
    for (const [email, currentTags] of existingByEmail) {
      const union = [...new Set([...currentTags, ...tags])];
      if (union.length === currentTags.length) continue;
      const { error: updateErr } = await db
        .from("email_subscribers")
        .update({ tags: union })
        .eq("email", email);
      if (updateErr) {
        console.error("admin emails/contacts: tag union update failed", { email, updateErr });
        continue;
      }
      existingTagged += 1;
    }
  }

  if (syncToResendAudience) {
    for (const email of newEmails) {
      await addToResendAudience(email);
    }
  }

  // Fire tag_added auto-enrollment for every tag applied by this import.
  for (const tag of tags) {
    await enrollForTagAdded(db, tag, emails);
  }

  return NextResponse.json({ added, existingTagged, invalid, total: emails.length });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  let body: { action?: unknown; emails?: unknown; tag?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;
  const emails = cleanEmailArray(body.emails);
  if (!action || emails.length === 0) {
    return NextResponse.json({ error: "action and emails are required" }, { status: 400 });
  }

  if (action === "unsubscribe") {
    for (const email of emails) {
      await recordSuppression(email, "manual");
    }
    return NextResponse.json({ ok: true, updated: emails.length });
  }

  if (action !== "tag" && action !== "untag") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const tag = typeof body.tag === "string" ? normalizeTag(body.tag) : null;
  if (!tag) return NextResponse.json({ error: "A valid tag is required" }, { status: 400 });

  let updated = 0;

  for (const slice of chunkArr(emails, CHUNK)) {
    const { data: rows, error: readErr } = await db
      .from("email_subscribers")
      .select("email, tags")
      .in("email", slice);
    if (readErr) {
      if (isMissingTable(readErr)) {
        return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
      }
      console.error("admin emails/contacts: bulk tag read failed", readErr);
      continue;
    }

    for (const row of rows ?? []) {
      if (typeof row.email !== "string") continue;
      const currentTags = Array.isArray(row.tags)
        ? row.tags.filter((t: unknown): t is string => typeof t === "string")
        : [];
      const nextTags =
        action === "tag"
          ? [...new Set([...currentTags, tag])]
          : currentTags.filter((t) => t !== tag);
      if (nextTags.length === currentTags.length) continue;
      const { error: updateErr } = await db
        .from("email_subscribers")
        .update({ tags: nextTags })
        .eq("email", row.email);
      if (updateErr) {
        console.error("admin emails/contacts: bulk tag update failed", { email: row.email, updateErr });
        continue;
      }
      updated += 1;
    }
  }

  if (action === "tag") {
    await enrollForTagAdded(db, tag, emails);
  }

  return NextResponse.json({ ok: true, updated });
}
