/**
 * Day-45 testimonial ask cron.
 *
 * Once a subscriber has been active for ~45 days (into their second month) and
 * we haven't asked yet, email them a one-time "leave a testimonial" request and
 * stamp subscriptions.testimonial_requested_at so it never repeats. Users who
 * have already submitted (testimonial_submitted_at set) are skipped. The in-app
 * banner covers the same window for people who don't open the email.
 *
 * Scheduled daily in vercel.json. Guarded by CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sendTestimonialEmail } from "@/lib/testimonial-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGE_DAYS = 45;
const PER_RUN_LIMIT = 100;

type SelectChain<T> = {
  eq: (col: string, value: unknown) => SelectChain<T>;
  is: (col: string, value: null) => SelectChain<T>;
  lte: (col: string, value: string) => SelectChain<T>;
  limit: (n: number) => Promise<{ data: T[] | null; error: unknown }>;
  maybeSingle: () => Promise<{ data: T | null; error: unknown }>;
};

type CronClient = {
  from: (table: string) => {
    select: (cols: string) => SelectChain<Record<string, unknown>>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

type SubRow = {
  user_id: string;
  status: string | null;
  created_at: string | null;
};

function getServiceClient(): CronClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("cron testimonial-requests: missing Supabase service-role configuration");
    return null;
  }
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as CronClient;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron testimonial-requests: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function fetchContact(
  supabase: CronClient,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const email = typeof data.email === "string" ? data.email : null;
  if (!email) return null;
  return { email, name: typeof data.full_name === "string" ? data.full_name : "" };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const feedbackUrl = `${siteUrl.replace(/\/$/, "")}/dashboard/feedback?src=email`;

  const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id,status,created_at")
    .eq("status", "active")
    .lte("created_at", cutoff)
    .is("testimonial_requested_at", null)
    .is("testimonial_submitted_at", null)
    .limit(PER_RUN_LIMIT);

  if (error) {
    console.error("cron testimonial-requests: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = ((data ?? []) as SubRow[]).filter((r) => r.status === "active");
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const contact = await fetchContact(supabase, row.user_id);
    if (!contact) {
      skipped += 1;
      continue;
    }
    const ok = await sendTestimonialEmail({
      to: contact.email,
      name: contact.name,
      feedbackUrl,
    });
    if (!ok) {
      skipped += 1;
      continue;
    }
    const { error: stampErr } = await supabase
      .from("subscriptions")
      .update({ testimonial_requested_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
    if (stampErr) {
      console.error("cron testimonial-requests: stamp failed", { userId: row.user_id, stampErr });
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped, considered: rows.length });
}
