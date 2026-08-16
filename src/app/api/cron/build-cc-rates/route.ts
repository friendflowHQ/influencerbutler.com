/**
 * Daily cron: build the per-ASIN Creator Connections rate table from the R2
 * CC catalogue (campaign rows joined to the asin-index) into
 * extension_cc_rates, for the extension's "Campaign 12%" search chips.
 *
 * Version-gated on extension_cc_rates_meta, which is written only AFTER a
 * complete build: a run that dies mid-way (timeout) leaves the old version in
 * meta, so the next run rebuilds; upserts are idempotent by asin, so a retry
 * is effectively a resume. Stale-version rows are deleted after a completed
 * build.
 *
 * Scheduled in vercel.json (after build-catalogue-filters). Guarded by
 * CRON_SECRET like the other crons. Requires CLOUDFLARE_ACCOUNT_ID +
 * R2_READ_TOKEN; without them it no-ops.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCcRates, r2Configured, readLatest } from "@/lib/r2-catalogue";
import { isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300 matches the other heavy crons (plan ceiling). If the CC asin-index is
// at the multi-million-row end a single run may time out mid-upsert; that is
// safe by design: meta keeps the old version, the next run re-upserts
// (idempotent) and finishes the remainder.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ ok: true, skipped: "R2 not configured" });
  }

  const admin = createAdminClient();

  // Cheap check first: only rebuild when the catalogue version changed.
  const { data: meta, error: metaErr } = await admin
    .from("extension_cc_rates_meta")
    .select("version, row_count")
    .eq("kind", "cc")
    .maybeSingle();
  if (metaErr) {
    if (isMissingTableError(metaErr)) {
      return NextResponse.json({ ok: false, migrationPending: true });
    }
    console.error("build-cc-rates: meta read failed", metaErr);
    return NextResponse.json({ error: "meta read failed" }, { status: 500 });
  }

  let latestVersion: string;
  try {
    latestVersion = (await readLatest("cc")).version;
  } catch (err) {
    console.error("build-cc-rates: latest.json read failed", err);
    return NextResponse.json({ error: "latest.json read failed" }, { status: 500 });
  }
  if (meta?.version === latestVersion) {
    return NextResponse.json({ ok: true, result: `unchanged (${latestVersion})` });
  }

  // A previous run on this same version may have timed out mid-stream; its
  // progress row (kind 'cc-progress') tells us how many rows it already
  // flushed, and the deterministic stream order lets this run skip them.
  const { data: progress } = await admin
    .from("extension_cc_rates_meta")
    .select("version, row_count")
    .eq("kind", "cc-progress")
    .maybeSingle();
  const skipRows = progress?.version === latestVersion ? (progress.row_count ?? 0) : 0;

  try {
    const builtAt = new Date().toISOString();
    let flushed = skipRows;
    const built = await buildCcRates({
      skipRows,
      onChunk: async (rows) => {
        const { error } = await admin.from("extension_cc_rates").upsert(
          rows.map((r) => ({
            asin: r.asin,
            rate_pct: r.ratePct,
            brand: r.brand,
            ends_at: r.endsAt,
            version: latestVersion,
            built_at: builtAt,
          })),
          { onConflict: "asin" },
        );
        if (error) throw new Error(`upsert failed: ${error.message}`);
        flushed += rows.length;
        // Best-effort progress marker so a timeout resumes instead of
        // restarting; a failed write just means a little re-upserting.
        await admin
          .from("extension_cc_rates_meta")
          .upsert(
            { kind: "cc-progress", version: latestVersion, row_count: flushed, built_at: builtAt },
            { onConflict: "kind" },
          );
      },
    });

    // Rows whose ASIN left the catalogue keep the old version stamp; drop them
    // now that the build completed.
    const { error: delErr } = await admin
      .from("extension_cc_rates")
      .delete()
      .neq("version", latestVersion);
    if (delErr) console.error("build-cc-rates: stale delete failed", delErr);

    const { error: upMetaErr } = await admin.from("extension_cc_rates_meta").upsert(
      {
        kind: "cc",
        version: built.version,
        row_count: built.rowCount,
        built_at: builtAt,
      },
      { onConflict: "kind" },
    );
    if (upMetaErr) throw new Error(`meta upsert failed: ${upMetaErr.message}`);

    // Build is complete; the progress marker has served its purpose.
    await admin.from("extension_cc_rates_meta").delete().eq("kind", "cc-progress");

    return NextResponse.json({
      ok: true,
      result: `built ${built.version} (${built.rowCount} asins from ${built.campaignCount} active campaigns)`,
    });
  } catch (err) {
    console.error("build-cc-rates: build failed", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
