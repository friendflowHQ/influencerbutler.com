import { NextResponse, type NextRequest } from "next/server";
import { NodeHtmlMarkdown } from "node-html-markdown";

// Web Bot Auth (RFC 9421) verification is delegated to the edge proxy
// (Cloudflare's "Verified Bots" feature sets `cf-verified-bot: true`).
// See src/lib/web-bot-auth.ts for the in-app stub.

const PROTECTED_PREFIXES = ["/dashboard", "/affiliates/portal", "/help"];

// Public exceptions to the auth gate above. The Chrome-extension tutorial is the
// target of the desktop app's baked-in Help link (/help/chrome-extension
// redirects here in next.config.ts), and those users are typically logged out in
// their browser, so it must be readable without a web session. Every other /help
// page stays gated.
const PUBLIC_PATHS = new Set(["/help/tutorials/extension"]);

const MARKDOWN_PATH_MAP: Array<{ test: RegExp; resolve: (m: RegExpMatchArray) => string }> = [
  { test: /^\/$/, resolve: () => "/index.html" },
  { test: /^\/landing\/?$/, resolve: () => "/landing-page.html" },
  { test: /^\/email-sequences\/?$/, resolve: () => "/email-sequences.html" },
  { test: /^\/features\/([^/]+)\/?$/, resolve: (m) => `/features/${m[1]}.html` },
  { test: /^\/legal\/([^/]+)\/?$/, resolve: (m) => `/legal/${m[1]}.html` },
];

function wantsMarkdown(request: NextRequest): boolean {
  const queryFormat = request.nextUrl.searchParams.get("format");
  if (queryFormat && queryFormat.toLowerCase() === "md") return true;
  const accept = request.headers.get("accept") || "";
  return /text\/markdown/i.test(accept);
}

function resolveStaticTarget(pathname: string): string | null {
  for (const entry of MARKDOWN_PATH_MAP) {
    const m = pathname.match(entry.test);
    if (m) return entry.resolve(m);
  }
  return null;
}

// Approximate token count using the common heuristic of ~4 chars per token
// for English-ish text. Surfaced via x-markdown-tokens so agents can budget
// context without round-tripping through their own tokenizer.
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Auth gate runs first. Normalize a trailing slash so the public-path
  // allowlist matches regardless of how the link was written.
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const isProtected =
    !PUBLIC_PATHS.has(normalizedPath) &&
    PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (isProtected) {
    // Matches sb-<ref>-auth-token and chunked variants like sb-<ref>-auth-token.0
    const hasAuthCookie = request.cookies.getAll().some(
      (cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name),
    );
    if (!hasAuthCookie) {
      // Salvage already-shared affiliate links. Older share links pointed at the
      // auth-gated /dashboard/subscription?code=CODE. Send logged-out prospects to
      // the public pricing page (carrying code + channel) so the click tracks and
      // the promo prefills, instead of bouncing them to sign-in and losing the
      // referral. New links already point at /pricing; this rescues old ones.
      const affiliateCode = request.nextUrl.searchParams.get("code");
      if (normalizedPath === "/dashboard/subscription" && affiliateCode) {
        const pricing = new URL("/pricing", request.nextUrl.origin);
        pricing.searchParams.set("code", affiliateCode);
        const channel = request.nextUrl.searchParams.get("s");
        if (channel) pricing.searchParams.set("s", channel);
        return NextResponse.redirect(pricing);
      }
      const nextTarget = `${pathname}${request.nextUrl.search}`;
      const redirectUrl = new URL("/login", request.nextUrl.origin);
      redirectUrl.searchParams.set("next", nextTarget);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // Markdown content negotiation for marketing pages only.
  if (request.method === "GET" && wantsMarkdown(request)) {
    const staticTarget = resolveStaticTarget(pathname);
    if (staticTarget) {
      try {
        const upstreamUrl = new URL(staticTarget, request.nextUrl.origin);
        const upstream = await fetch(upstreamUrl, {
          headers: { Accept: "text/html" },
        });
        if (upstream.ok) {
          const html = await upstream.text();
          const markdown = NodeHtmlMarkdown.translate(html);
          return new NextResponse(markdown, {
            status: 200,
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Vary": "Accept",
              "Cache-Control": "public, max-age=300, s-maxage=3600",
              "Link": '</robots.txt>; rel="describedby", </sitemap.xml>; rel="sitemap"',
              "x-markdown-tokens": String(estimateTokens(markdown)),
            },
          });
        }
      } catch {
        // Fall through to default HTML behavior on any conversion failure.
      }
    }
  }

  return NextResponse.next();
}

export const runtime = "nodejs";

export const config = {
  matcher: [
    "/",
    "/landing",
    "/email-sequences",
    "/features/:slug",
    "/legal/:slug",
    "/dashboard/:path*",
    "/affiliates/portal/:path*",
    "/help",
    "/help/:path*",
  ],
};
