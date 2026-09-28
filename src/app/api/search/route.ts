/**
 * GET /api/search?q=orders&lang=en-US&limit=8 - site-wide search over blog
 * posts, help tutorials, homepage features, and key pages. Returns a small
 * ranked list ({ results }) with no body text, so the header search dropdown
 * can call it as-you-type without shipping the whole index to the browser. The
 * /search results page uses the same lib server-side.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchSite } from "@/lib/site-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const q = (params.get("q") || "").trim();
    const lang = params.get("lang") || undefined;
    const limitRaw = parseInt(params.get("limit") || "8", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 8, 1), 20);

    // Require two characters so a single keystroke doesn't return the world.
    if (q.length < 2) return NextResponse.json({ results: [] });

    const results = await searchSite(q, { locale: lang, limit });
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { results: [], error: (err as Error)?.message || "Search unavailable" },
      { status: 500 },
    );
  }
}
