/**
 * GET /api/cron/daily-digest
 *
 * Twice-daily owner summary email that replaces the per-click "Free trial click"
 * flood. Two runs a day (see vercel.json): a morning recap of the prior local
 * day and an evening "so far today" update, both in the configured timezone
 * (DIGEST_TIMEZONE, default Mountain Time).
 *
 * The variant (morning vs evening) is inferred from the local hour, so the two
 * cron entries do not need exact DST-adjusted times; override with ?variant=.
 *
 * Query params:
 *   ?dry=1            render + return the HTML without sending (browser preview)
 *   ?dry=1&sample=1   render sample data (no DB) for pure design review
 *   ?variant=morning|evening   force the variant
 *
 * Gated on CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import {
  computeDigest,
  sampleDigestData,
  DEFAULT_DIGEST_TIMEZONE,
  type DigestVariant,
} from "@/lib/daily-digest";
import {
  renderDigestHtml,
  digestSubject,
  sendDigest,
} from "@/lib/digest-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("daily-digest cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function parseVariant(raw: string | null): DigestVariant | undefined {
  if (raw === "morning" || raw === "evening") return raw;
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const sample = url.searchParams.get("sample") === "1";
  const variant = parseVariant(url.searchParams.get("variant"));

  // The dry+sample preview needs no secret and no DB: it is just the design.
  if (dry && sample) {
    const data = sampleDigestData(variant ?? "morning");
    return new NextResponse(renderDigestHtml(data), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tz = process.env.DIGEST_TIMEZONE || DEFAULT_DIGEST_TIMEZONE;

  let data;
  try {
    data = await computeDigest({ tz, variant });
  } catch (err) {
    console.error("daily-digest cron: compute failed", err);
    return NextResponse.json({ error: "compute_failed" }, { status: 500 });
  }

  if (dry) {
    return new NextResponse(renderDigestHtml(data), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const result = await sendDigest(data);
  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped ?? null,
    variant: data.variant,
    subject: digestSubject(data),
    window: data.windowLabel,
  });
}
