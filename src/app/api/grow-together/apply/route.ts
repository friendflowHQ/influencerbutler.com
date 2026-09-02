/**
 * POST /api/grow-together/apply
 * Body: {
 *   name, email, topic,                         // required
 *   instagramHandle?, website?, otherSocials?,  // optional
 *   chapterTitle?, bio?, headshotUrl?, audienceSize?,
 *   agree: true                                 // required agreement checkbox
 * }
 *
 * A creator applying to contribute a chapter to the Grow Together Creator Bundle.
 * Validates, enforces per-topic capacity (so a full topic cannot be over-claimed)
 * and one application per email, records the row in bundle_contributors, then tags
 * the contributor 'bundle-contributor' and auto-enrolls them into the onboarding
 * sequence (via tagRecipientsAsContacts, which also lands them in email_subscribers
 * so the coordination campaigns can reach them).
 *
 * Uses the service-role client (the table is RLS-locked with no public policy).
 * Degrades where it safely can, but unlike a newsletter opt-in an application MUST
 * persist to be useful, so a real DB failure returns an error the form can show.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { isUndeliverableTestEmail } from "@/lib/email-address";
import {
  BUNDLE_SLUG,
  CONTRIBUTOR_TAG,
  CONTRIBUTOR_SOURCE,
  MAX_CONTRIBUTORS,
  topicBySlug,
} from "@/app/grow-together/_data/bundleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  name?: unknown;
  email?: unknown;
  topic?: unknown;
  instagramHandle?: unknown;
  website?: unknown;
  otherSocials?: unknown;
  chapterTitle?: unknown;
  bio?: unknown;
  headshotUrl?: unknown;
  audienceSize?: unknown;
  agree?: unknown;
};

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

/** Trim a string field to a max length, or null when absent/blank. */
function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = str(body.name, 120);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  const topicMeta = topicBySlug(topic);
  if (!topicMeta) {
    return NextResponse.json({ error: "Please choose a topic from the list." }, { status: 400 });
  }
  if (body.agree !== true) {
    return NextResponse.json(
      { error: "Please confirm you can submit your chapter and help promote at launch." },
      { status: 400 },
    );
  }

  // A reserved test address (example.com, *.test) can never receive the
  // coordination emails, so an application from one is not actionable.
  if (isUndeliverableTestEmail(email)) {
    return NextResponse.json(
      { error: "Please use a real email so we can send you the details." },
      { status: 400 },
    );
  }

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Capacity + duplicate-email check in one read. A declined application frees
  // its slot and does not block re-applying.
  try {
    const { data: existing, error: readErr } = await db
      .from("bundle_contributors")
      .select("email, topic, status")
      .eq("bundle_slug", BUNDLE_SLUG);
    if (readErr) {
      if (isMissingTable(readErr)) {
        return NextResponse.json(
          { error: "Applications are not open just yet. Please check back shortly." },
          { status: 503 },
        );
      }
      console.error("grow-together apply: read failed", readErr);
      return NextResponse.json({ error: "Could not save your application. Please retry." }, { status: 500 });
    }

    const rows = existing ?? [];
    const already = rows.find(
      (r) => typeof r.email === "string" && r.email.toLowerCase() === email && r.status !== "declined",
    );
    if (already) {
      return NextResponse.json(
        { error: "You have already applied with this email. We will be in touch." },
        { status: 409 },
      );
    }
    // Overall roster cap (on top of the per-topic caps below). A declined
    // application frees its seat.
    const rosterCount = rows.filter((r) => r.status !== "declined").length;
    if (rosterCount >= MAX_CONTRIBUTORS) {
      return NextResponse.json(
        {
          error:
            "The bundle roster is full for this round. Apply anyway to join the waitlist for the next one, or reply to our email.",
        },
        { status: 409 },
      );
    }
    const claimed = rows.filter((r) => r.topic === topic && r.status !== "declined").length;
    if (claimed >= topicMeta.capacity) {
      return NextResponse.json(
        { error: "That topic just filled up. Please pick another open topic." },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("grow-together apply: precheck threw", err);
    return NextResponse.json({ error: "Could not save your application. Please retry." }, { status: 500 });
  }

  // otherSocials is a free-form object (facebook/pinterest/youtube/tiktok/etc.);
  // keep only string values, capped, to avoid storing arbitrary payloads.
  let otherSocials: Record<string, string> | null = null;
  if (body.otherSocials && typeof body.otherSocials === "object" && !Array.isArray(body.otherSocials)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.otherSocials as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k.slice(0, 24)] = v.trim().slice(0, 200);
    }
    if (Object.keys(out).length > 0) otherSocials = out;
  }

  const row: Record<string, unknown> = {
    bundle_slug: BUNDLE_SLUG,
    name,
    email,
    topic,
    instagram_handle: str(body.instagramHandle, 80),
    website: str(body.website, 200),
    other_socials: otherSocials,
    chapter_title: str(body.chapterTitle, 160),
    bio: str(body.bio, 1500),
    headshot_url: str(body.headshotUrl, 400),
    audience_size: str(body.audienceSize, 60),
    status: "applied",
  };

  try {
    const { error: insErr } = await db.from("bundle_contributors").insert(row);
    if (insErr) {
      // Unique-index race: someone with the same email inserted between our
      // precheck and here.
      if ((insErr as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "You have already applied with this email. We will be in touch." },
          { status: 409 },
        );
      }
      console.error("grow-together apply: insert failed", insErr);
      return NextResponse.json({ error: "Could not save your application. Please retry." }, { status: 500 });
    }
  } catch (err) {
    console.error("grow-together apply: insert threw", err);
    return NextResponse.json({ error: "Could not save your application. Please retry." }, { status: 500 });
  }

  // Tag + enroll into the onboarding drip. Best-effort: a missing marketing table
  // just no-ops, and the application is already saved either way.
  try {
    await tagRecipientsAsContacts(db, [email], CONTRIBUTOR_TAG, CONTRIBUTOR_SOURCE);
  } catch (err) {
    console.error("grow-together apply: tag/enroll threw", err);
  }

  return NextResponse.json({ ok: true });
}
