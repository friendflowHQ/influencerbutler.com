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
import { readExtensionFlags, versionOf } from "@/lib/extension-flags";
import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { getAdmin, activeBanners } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Notices longer than this are trimmed (mirrors the extension client sanitizer).
const MAX_NOTICE_LEN = 300;

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

  // Merge the active admin-scheduled event banner into `notice`, so a scheduled
  // event announcement reaches already-installed extensions with no Web Store
  // update (the popup already renders flags.notice). The EXTENSION_FLAGS env
  // `notice` stays an explicit override: only fill from the DB when it is empty.
  if (!flags.notice) {
    try {
      const admin = getAdmin();
      if (admin) {
        const banners = await activeBanners(admin, "extension");
        if (banners[0]) flags.notice = banners[0].text.slice(0, MAX_NOTICE_LEN);
      }
    } catch (e) {
      // A banner-merge failure must never break the kill-switch feed.
      console.error("extension/flags: banner merge failed", e);
    }
  }

  // Recompute the version over the merged payload so a banner change (or its
  // window opening/closing) busts the ETag and reaches clients on their next poll.
  const { version: _version, ...rest } = flags;
  void _version;
  const version = versionOf(rest);
  const etag = `"flags-${version}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ...corsHeaders(), ETag: etag } });
  }

  return NextResponse.json(
    { ...rest, version },
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        ETag: etag,
        // Short edge cache: a kill switch (and a scheduled banner) must propagate
        // fast, but the payload is tiny, so a couple of minutes of caching keeps
        // function invocations low without slowing a flip meaningfully.
        "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}
