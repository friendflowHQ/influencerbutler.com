/**
 * GET /api/help/manifest — returns the canonical tutorial manifest as JSON.
 * Used by the desktop dashboard's help workspace to populate its left-nav
 * and offline cache. Filters tutorials to those that have at least one
 * locale variant on disk.
 */
import { NextResponse } from "next/server";
import { loadManifest } from "@/lib/tutorials";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  try {
    const manifest = await loadManifest();
    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message || "Manifest unavailable" },
      { status: 500 },
    );
  }
}
