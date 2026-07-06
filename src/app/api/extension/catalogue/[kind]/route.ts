/**
 * GET /api/extension/catalogue/[kind]  (kind = cc | spcc)
 *
 * Serves the prebuilt ASIN membership Bloom filter to the extension. Public
 * (no auth): campaign availability is not user data, and the extension checks
 * anonymously. Heavily cached at the edge and keyed by version via ETag, so
 * this row is read from Supabase roughly once per catalogue update, not per
 * request. The extension downloads it once a day and checks ASINs locally.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  corsHeaders,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["cc", "spcc"]);

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  if (!KINDS.has(kind)) {
    return jsonWithCors({ error: "Unknown catalogue" }, 404);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_catalogue_filters")
    .select("kind, version, m_bits, k_hashes, asin_count, bits_base64, built_at")
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/catalogue: read failed", error);
    return jsonWithCors({ error: "Could not load catalogue" }, 500);
  }
  if (!data) {
    return jsonWithCors({ notBuilt: true }, 200);
  }

  // Serve unchanged filters from the client/edge cache by version.
  const etag = `"${data.kind}-${data.version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ...corsHeaders(), ETag: etag },
    });
  }

  return NextResponse.json(
    {
      kind: data.kind,
      version: data.version,
      m: data.m_bits,
      k: data.k_hashes,
      asinCount: data.asin_count,
      bitsBase64: data.bits_base64,
      builtAt: data.built_at,
    },
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        ETag: etag,
        // Edge-cache for a day; serve stale briefly while revalidating.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}
