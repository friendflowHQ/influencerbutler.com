import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  readPromoTier,
  writeAffiliateSourceCookieIfMissing,
  writePromoCookies,
} from "@/lib/promo";
import {
  classifySource,
  extractReferrerHost,
  isBotUserAgent,
  normalizeSource,
  type BucketedSource,
} from "@/lib/affiliate-clicks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TouchBody = {
  /** First-touch affiliate code from a ?code= URL param. Persisted as ib_aff_src cookie. */
  affiliateSource?: string;
  /** Optional explicit source from a ?s= URL param (e.g. "instagram"). */
  source?: string;
  /** document.referrer from the page that triggered the touch. */
  referrer?: string;
};

const CLICK_DEDUP_MAX_AGE_SECONDS = 60 * 30; // 30 minutes - one click per code per window.

/**
 * Called from the pricing page + dashboard subscription page on mount to
 * persist the visitor / promo cookies, record first-touch affiliate
 * attribution, and (NEW) log a row to affiliate_clicks so the affiliate's
 * dashboard can show per-source click analytics.
 *
 * Body is optional - a bare POST still works (legacy callers).
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const tier = readPromoTier(cookieStore);

  let affiliateSource: string | null = null;
  let explicitSource: BucketedSource | null = null;
  let rawReferrer: string | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as TouchBody | null;
      if (body && typeof body.affiliateSource === "string" && body.affiliateSource.trim().length > 0) {
        affiliateSource = body.affiliateSource.trim();
      }
      if (body && typeof body.source === "string") {
        explicitSource = normalizeSource(body.source);
      }
      if (body && typeof body.referrer === "string" && body.referrer.trim().length > 0) {
        rawReferrer = body.referrer.trim();
      }
    }
  } catch {
    // Body is optional - ignore parse failures.
  }

  const response = NextResponse.json({ tier });
  writePromoCookies(response, cookieStore);
  writeAffiliateSourceCookieIfMissing(response, cookieStore, affiliateSource);

  // Best-effort click logging. Never block the response on failures.
  if (affiliateSource) {
    const code = affiliateSource.toUpperCase();
    const dedupCookie = `ib_aff_click_${code}`;
    const alreadyCounted = cookieStore.get(dedupCookie)?.value;

    if (!alreadyCounted) {
      try {
        await logAffiliateClick({
          code,
          rawReferrer,
          explicitSource,
        });
      } catch (err) {
        console.error("promo/touch: click log failed", err);
      }

      // Set dedup cookie regardless of whether the insert actually succeeded -
      // a brief 30-min gap is better than over-counting if the DB hiccups.
      response.cookies.set({
        name: dedupCookie,
        value: "1",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: CLICK_DEDUP_MAX_AGE_SECONDS,
      });
    }
  }

  return response;
}

async function logAffiliateClick(args: {
  code: string;
  rawReferrer: string | null;
  explicitSource: BucketedSource | null;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Without service-role we can't write past RLS. Skip silently in local dev.
    return;
  }

  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? null;
  const ipCountry =
    requestHeaders.get("x-vercel-ip-country") ||
    requestHeaders.get("cf-ipcountry") ||
    null;

  const referrerHost = extractReferrerHost(args.rawReferrer);
  const source = classifySource(args.explicitSource, referrerHost);
  const isBot = isBotUserAgent(userAgent);

  // Look up the affiliate's LS id for denormalization, and confirm the code
  // belongs to a real affiliate (so random ?code=FOO traffic isn't logged).
  const svc = createServerClient(url, key, {
    cookies: {
      getAll() { return []; },
      setAll() { /* stateless */ },
    },
  });

  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("ls_affiliate_id,affiliate_code")
    .ilike("affiliate_code", args.code)
    .limit(1)
    .maybeSingle();

  if (profileErr || !profile || !profile.affiliate_code) {
    return;
  }

  const profileRow = profile as { ls_affiliate_id?: string | null; affiliate_code: string };

  const { error: insertErr } = await svc.from("affiliate_clicks").insert({
    affiliate_code: profileRow.affiliate_code.toUpperCase(),
    ls_affiliate_id: profileRow.ls_affiliate_id ?? null,
    source,
    referrer_host: referrerHost ? referrerHost.slice(0, 255) : null,
    user_agent: userAgent ? userAgent.slice(0, 512) : null,
    ip_country: ipCountry,
    is_bot: isBot,
  });

  if (insertErr) {
    console.error("affiliate_clicks insert failed", insertErr);
  }
}
