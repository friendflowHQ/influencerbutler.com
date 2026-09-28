/**
 * Daily cron: build the per-ASIN SPCC ("Earn on Clicks") rate table from the R2
 * SPCC catalogue into extension_spcc_rates, for the extension's search-tile EPC
 * chip. Unlike build-cc-rates this is a single streamed pass (no asin-index
 * join): every SPCC catalog row already carries its own ASIN + estimatedEpc.
 *
 * Version-gated on extension_spcc_rates_meta, which is written only AFTER a
 * complete build: a run that dies mid-way (timeout) leaves the old version in
 * meta, so the next run rebuilds; upserts are idempotent by asin, so a retry
 * is effectively a resume. Stale-version rows are deleted after a completed
 * build.
 *
 * Scheduled in vercel.json (after build-catalogue-filters). Guarded by
 * CRON_SECRET like the other crons. Requires CLOUDFLARE_ACCOUNT_ID +
 * R2_READ_TOKEN; without them it no-ops (r2Configured() is always true here
 * since the catalogue also serves off the public bucket domain, same as
 * build-cc-rates).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSpccRates, r2Configured, readLatest } from "@/lib/r2-catalogue";
import { isMissingColumnError, isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Matches build-cc-rates: the plan ceiling for the heavy crons.
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
    .from("extension_spcc_rates_meta")
    .select("version, row_count")
    .eq("kind", "spcc")
    .maybeSingle();
  if (metaErr) {
    if (isMissingTableError(metaErr)) {
      return NextResponse.json({ ok: false, migrationPending: true });
    }
    console.error("build-spcc-rates: meta read failed", metaErr);
    return NextResponse.json({ error: "meta read failed" }, { status: 500 });
  }

  let latestVersion: string;
  try {
    latestVersion = (await readLatest("spcc")).version;
  } catch (err) {
    console.error("build-spcc-rates: latest.json read failed", err);
    return NextResponse.json({ error: "latest.json read failed" }, { status: 500 });
  }
  if (meta?.version === latestVersion) {
    return NextResponse.json({ ok: true, result: `unchanged (${latestVersion})` });
  }

  // A previous run on this same version may have timed out mid-stream; its
  // progress row tells us how many rows it already flushed, and the
  // deterministic stream order lets this run skip them.
  const { data: progress } = await admin
    .from("extension_spcc_rates_meta")
    .select("version, row_count")
    .eq("kind", "spcc-progress")
    .maybeSingle();
  const skipRows = progress?.version === latestVersion ? (progress.row_count ?? 0) : 0;

  try {
    const builtAt = new Date().toISOString();
    let flushed = skipRows;
    const built = await buildSpccRates({
      skipRows,
      chunkSize: 5000,
      onChunk: async (rows) => {
        const { error } = await admin.from("extension_spcc_rates").upsert(
          rows.map((r) => ({
            asin: r.asin,
            estimated_epc: r.estimatedEpc,
            budget_availability: r.budgetAvailability,
            brand: r.brand,
            version: latestVersion,
            built_at: builtAt,
          })),
          { onConflict: "asin" },
        );
        if (error) {
          if (isMissingColumnError(error) || isMissingTableError(error)) {
            throw new Error(`upsert failed (migration pending): ${error.message}`);
          }
          throw new Error(`upsert failed: ${error.message}`);
        }
        flushed += rows.length;
        // Best-effort progress marker so a timeout resumes instead of
        // restarting; a failed write just means a little re-upserting.
        await admin
          .from("extension_spcc_rates_meta")
          .upsert(
            { kind: "spcc-progress", version: latestVersion, row_count: flushed, built_at: builtAt },
            { onConflict: "kind" },
          );
      },
    });

    // Rows whose ASIN left the catalogue keep the old version stamp; drop them
    // now that the build completed.
    const { error: delErr } = await admin
      .from("extension_spcc_rates")
      .delete()
      .neq("version", latestVersion);
    if (delErr) console.error("build-spcc-rates: stale delete failed", delErr);

    const { error: upMetaErr } = await admin.from("extension_spcc_rates_meta").upsert(
      {
        kind: "spcc",
        version: built.version,
        row_count: built.rowCount,
        built_at: builtAt,
      },
      { onConflict: "kind" },
    );
    if (upMetaErr) throw new Error(`meta upsert failed: ${upMetaErr.message}`);

    // Build is complete; the progress marker has served its purpose.
    await admin.from("extension_spcc_rates_meta").delete().eq("kind", "spcc-progress");

    return NextResponse.json({
      ok: true,
      result: `built ${built.version} (${built.rowCount} asins)`,
    });
  } catch (err) {
    console.error("build-spcc-rates: build failed", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
