/**
 * GET /api/extension/deal-sources
 *
 * Serves the curated list of daily-deal aggregator sites the Deal Sites
 * Harvester offers in its picker. Public (no auth): the list is not user data,
 * and the extension reads it anonymously, refreshing at most once a day. The
 * list is a small JSON object in R2 (dcb/deal-sources/latest.json), admin
 * maintained; if R2 is not configured or the object is missing, we fall back to
 * a built-in seed so the harvester still has sensible defaults.
 */
import { NextResponse } from "next/server";
import { r2ReadJson } from "@/lib/r2-catalogue";
import { corsHeaders, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES_KEY = "dcb/deal-sources/latest.json";

type DealSource = { url: string; label: string };
type SourcesFile = { version?: string; sources?: Array<{ url?: unknown; label?: unknown }> };

// A minimal built-in seed used when R2 has no curated list yet. Kept short and
// generic; the R2 file is the source of truth once it exists.
const SEED: DealSource[] = [
  { url: "https://www.jungle.deals/", label: "Jungle.Deals" },
];

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET() {
  let sources = SEED;
  let version = "seed";
  try {
    const file = await r2ReadJson<SourcesFile>(SOURCES_KEY);
    if (file && Array.isArray(file.sources)) {
      const parsed = normalize(file.sources);
      if (parsed.length > 0) {
        sources = parsed;
        version = typeof file.version === "string" ? file.version : "r2";
      }
    }
  } catch (error) {
    console.error("extension/deal-sources: R2 read failed", error);
    // fall through to the seed
  }

  const etag = `"deal-sources-${version}-${sources.length}"`;
  return NextResponse.json(
    { version, sources },
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        ETag: etag,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}

function normalize(raw: Array<{ url?: unknown; label?: unknown }>): DealSource[] {
  const out: DealSource[] = [];
  for (const item of raw) {
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) continue;
    const label =
      typeof item.label === "string" && item.label.trim() ? item.label.trim() : hostLabel(url);
    out.push({ url, label });
  }
  return out;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
