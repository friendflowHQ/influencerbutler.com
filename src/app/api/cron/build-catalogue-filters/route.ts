/**
 * Daily cron: build the CC / SPCC ASIN membership Bloom filters from the R2
 * catalogue and store them in extension_catalogue_filters. Version-gated: if
 * the catalogue version already matches the stored filter, the rebuild is
 * skipped, so most runs are a couple of cheap R2 metadata reads.
 *
 * Scheduled in vercel.json. Guarded by CRON_SECRET like the other crons.
 * Requires CLOUDFLARE_ACCOUNT_ID + R2_READ_TOKEN; without them it no-ops.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFilter, r2Configured, readLatest, type CatalogueKind } from "@/lib/r2-catalogue";
import { isMissingTableError } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KINDS: CatalogueKind[] = ["cc", "spcc", "deals"];

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
  const results: Record<string, string> = {};

  // Read current stored versions once (soft-fail if the table is missing).
  const stored = new Map<string, string>();
  const { data, error } = await admin.from("extension_catalogue_filters").select("kind, version");
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, migrationPending: true });
    }
    console.error("build-catalogue-filters: read failed", error);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  for (const row of data ?? []) stored.set(row.kind as string, row.version as string);

  for (const kind of KINDS) {
    try {
      // Cheap check first: only rebuild when the catalogue version changed.
      const latest = await readLatest(kind);
      if (stored.get(kind) === latest.version) {
        results[kind] = `unchanged (${latest.version})`;
        continue;
      }
      const built = await buildFilter(kind);
      const { error: upErr } = await admin.from("extension_catalogue_filters").upsert(
        {
          kind: built.kind,
          version: built.version,
          m_bits: built.bloom.m,
          k_hashes: built.bloom.k,
          asin_count: built.asinCount,
          bits_base64: built.bloom.bitsBase64,
          built_at: new Date().toISOString(),
        },
        { onConflict: "kind" },
      );
      if (upErr) throw upErr;
      results[kind] = `built ${built.version} (${built.asinCount} asins, ${Math.round(built.bloom.m / 8 / 1024)} KB)`;
    } catch (err) {
      console.error(`build-catalogue-filters: ${kind} failed`, err);
      results[kind] = `error: ${(err as Error).message}`;
    }
  }

  return NextResponse.json({ ok: true, results });
}
