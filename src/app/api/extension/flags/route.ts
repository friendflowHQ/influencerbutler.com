/**
 * GET /api/extension/flags
 *
 * The free Chrome extension's remote operational flags: the site-controlled
 * kill switch (disable any tool, or the whole extension, in the wild) plus
 * config-level DOM selector overrides, so a tool that breaks after an Amazon
 * change can be fixed in minutes instead of a Chrome Web Store review. Public
 * (no auth): these are not user data, just operational config. Read from an
 * environment variable and edge-cached briefly, keyed by a content-hash ETag,
 * so a flip propagates within minutes of a redeploy. See src/lib/extension-
 * flags.ts for the payload shape and how to change it.
 */
import { NextResponse } from "next/server";
import { readExtensionFlags } from "@/lib/extension-flags";
import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  let flags;
  try {
    flags = readExtensionFlags();
  } catch (error) {
    // A read failure must not disable the extension: serve nothing, not a 500
    // the client might misread. But this should never throw (readExtensionFlags
    // swallows JSON errors), so surface it in logs if it somehow does.
    console.error("extension/flags: read failed", error);
    return jsonWithCors(
      { version: "", disableAll: false, disabledTools: [], selectorOverrides: {}, notice: null },
      200,
    );
  }

  const etag = `"flags-${flags.version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...corsHeaders(), ETag: etag } });
  }

  return NextResponse.json(flags, {
    status: 200,
    headers: {
      ...corsHeaders(),
      ETag: etag,
      // Short edge cache: a kill switch must propagate fast, but the payload is
      // tiny and rarely changes, so a few minutes of caching keeps function
      // invocations low without slowing a flip meaningfully.
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
