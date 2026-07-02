/**
 * GET /api/help/search-index?locale=en-US - returns a keyword-search index
 * over every tutorial (title + summary + category + plain-text body). The
 * web /help search box builds its index server-side directly, but the
 * desktop app consumes this route to power in-app tutorial search offline.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loadManifest, loadSearchIndex } from "@/lib/tutorials";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    const locale = req.nextUrl.searchParams.get("locale") || "en-US";
    const [manifest, entries] = await Promise.all([loadManifest(), loadSearchIndex(locale)]);
    return NextResponse.json(
      { version: manifest.version, locale, entries },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message || "Search index unavailable" },
      { status: 500 },
    );
  }
}
