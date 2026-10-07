import type { NextConfig } from "next";

const SUPABASE_AUTH_BASE = "https://khutiiojhafblabtixpp.supabase.co/auth/v1";

// Single source of truth for the Chrome Web Store listing. /extension is now
// the indexable landing page (src/app/extension); the store short link is
// /go/extension, which redirects here so the extension id lives in exactly one
// place. Anything that explicitly wants the Web Store (desktop app install
// buttons, "Add to Chrome" deep links) should use /go/extension.
const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/influencer-butler/cnkfballfjhdijogkjjhdfmnkijcjgbc";

// Exact Supabase project origin (read at build time) instead of the
// https://*.supabase.co wildcard, which would let injected script talk to ANY
// Supabase project (an attacker's included) as an exfiltration channel.
const DEFAULT_SUPABASE_ORIGIN = "https://khutiiojhafblabtixpp.supabase.co";
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_ORIGIN).origin;
  } catch {
    return DEFAULT_SUPABASE_ORIGIN;
  }
})();

const connectSrc = [
  "'self'",
  SUPABASE_ORIGIN,
  "https://api.lemonsqueezy.com",
  "https://www.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
  // The AI concierge voice call POSTs its WebRTC SDP offer straight from the
  // browser to OpenAI (/v1/realtime/calls) with the minted ephemeral token.
  // Without this entry the CSP rejects that fetch and voice can never connect.
  "https://api.openai.com",
];
const imgSrc = [
  "'self'",
  "data:",
  SUPABASE_ORIGIN,
  "https://assets.lemonsqueezy.com",
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://assets.lemonsqueezy.com https://www.googletagmanager.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src 'self' https://*.lemonsqueezy.com https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Browser features the site never needs are switched off; microphone stays on
// for the AI concierge voice call. (No payment= entry: Lemon Squeezy's overlay
// is delegated by its own allow attribute and Permissions-Policy cannot
// allow-list wildcard origins.)
const permissionsPolicy = [
  "camera=()",
  "microphone=(self)",
  "geolocation=()",
  "usb=()",
  "bluetooth=()",
  "serial=()",
  "hid=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "midi=()",
  "interest-cohort=()",
].join(", ");

// Static HTML documents are served from public/ and Vercel gives static files
// Access-Control-Allow-Origin: *. Pin them to this site so other origins cannot
// read our documents cross-origin (CSRF-token style scraping, phishing clones
// built from live HTML). API and .well-known resources are deliberately
// untouched: agents and the extension need cross-origin access to those.
const SITE_ORIGIN = "https://www.influencerbutler.com";
const STATIC_HTML_SOURCES = [
  "/:path*.html",
  "/",
  "/landing",
  "/download",
  "/stop-messaging-brands",
  "/best-amazon-influencer-tools",
  "/email-sequences",
  "/brand-deal-rates",
  "/unsubscribe",
  "/features/:slug",
  "/compare/:slug",
  "/guides/:slug",
  "/for-agencies",
  "/for-agencies/:slug",
  "/legal/:slug",
  "/security",
  "/es/security",
  "/fr/security",
];

const agentDiscoveryLinkHeader = [
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</robots.txt>; rel="describedby"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</.well-known/openapi.json>; rel="service-desc"; type="application/openapi+json"',
  '</.well-known/mcp.json>; rel="service-desc"; type="application/json"',
  '</.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"',
  '</.well-known/agent-skills.json>; rel="describedby"; type="application/json"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
  '</.well-known/oauth-protected-resource>; rel="http://openid.net/specs/connect/1.0/issuer"',
  '</api/health>; rel="status"; type="application/json"',
].join(", ");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/go/trial", destination: "/api/trial/start" },
      { source: "/go/download", destination: "/api/trial/start" },
      { source: "/download", destination: "/download.html" },
      { source: "/", destination: "/index.html" },
      { source: "/landing", destination: "/landing-page.html" },
      { source: "/stop-messaging-brands", destination: "/stop-messaging-brands.html" },
      { source: "/best-amazon-influencer-tools", destination: "/best-amazon-influencer-tools.html" },
      { source: "/email-sequences", destination: "/email-sequences.html" },
      { source: "/brand-deal-rates", destination: "/brand-deal-rates.html" },
      { source: "/unsubscribe", destination: "/unsubscribe.html" },
      { source: "/features/:slug", destination: "/features/:slug.html" },
      { source: "/compare/:slug", destination: "/compare/:slug.html" },
      { source: "/guides/:slug", destination: "/guides/:slug.html" },
      { source: "/for-agencies", destination: "/for-agencies.html" },
      { source: "/for-agencies/:slug", destination: "/for-agencies/:slug.html" },
      { source: "/legal/privacy", destination: "/legal/privacy.html" },
      { source: "/legal/terms", destination: "/legal/terms.html" },
      { source: "/legal/eula", destination: "/legal/eula.html" },
      { source: "/legal/refund", destination: "/legal/refund.html" },
      { source: "/legal/cookies", destination: "/legal/cookies.html" },
      { source: "/legal/affiliate-terms", destination: "/legal/affiliate-terms.html" },
      { source: "/legal/accessibility", destination: "/legal/accessibility.html" },
      { source: "/security", destination: "/security.html" },
      { source: "/es/security", destination: "/security-es.html" },
      { source: "/fr/security", destination: "/security-fr.html" },
    ];
  },
  async redirects() {
    return [
      // /extension is the extension landing page (src/app/extension/page.tsx),
      // linked from the top nav, footer, and help tutorials, and it renders
      // normally. /go/extension is the Web Store short link: it lands on the
      // live listing. Kept non-permanent so the target can be retargeted
      // without a browser-cached 301 lock-in.
      {
        source: "/go/extension",
        destination: CHROME_EXTENSION_URL,
        permanent: false,
      },
      {
        source: "/.well-known/openid-configuration",
        destination: `${SUPABASE_AUTH_BASE}/.well-known/openid-configuration`,
        permanent: false,
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${SUPABASE_AUTH_BASE}/.well-known/oauth-authorization-server`,
        permanent: false,
      },
      // The Book a Call page lives under the dashboard, but customers hear or
      // read the address and type the short version. Send both short forms to
      // the real page instead of a 404. Non-permanent so the target can move
      // without a browser-cached 301 lock-in.
      {
        source: "/book",
        destination: "/dashboard/book",
        permanent: false,
      },
      {
        source: "/book-a-call",
        destination: "/dashboard/book",
        permanent: false,
      },
      // The drip emails linked /docs for months but the route never existed.
      // Real docs live at Help & Tutorials.
      {
        source: "/docs",
        destination: "/help",
        permanent: true,
      },
      // Video Butler was renamed to Video Reload Butler. Keep old links working.
      {
        source: "/features/video-butler",
        destination: "/features/video-reload-butler",
        permanent: true,
      },
      {
        source: "/help/tutorials/video-butler",
        destination: "/help/tutorials/video-reload-butler",
        permanent: true,
      },
      // /help/chrome-extension is a help link baked into already-shipped desktop
      // app builds. Route it to the extension's help article. Non-permanent so
      // the target can be retargeted without a browser-cached 301 lock-in.
      {
        source: "/help/chrome-extension",
        destination: "/help/tutorials/extension",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: permissionsPolicy },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // same-origin-allow-popups: keeps window.opener for popups WE open
          // (Lemon Squeezy / PayPal checkout, OAuth) while still isolating the
          // page from windows opened by other sites. Admin gets full same-origin.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        source: "/dashboard/admin/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }],
      },
      {
        // Build output (JS/CSS chunks) is never embedded by other sites.
        source: "/_next/static/:path*",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "same-site" }],
      },
      // Static marketing/legal documents: no wildcard CORS. Covers direct .html
      // URLs plus every rewrite above that maps to a public/*.html file.
      ...STATIC_HTML_SOURCES.map((source) => ({
        source,
        headers: [
          { key: "Access-Control-Allow-Origin", value: SITE_ORIGIN },
          { key: "Vary", value: "Origin" },
        ],
      })),
      {
        source: "/((?!api/|dashboard|affiliates/portal|welcome|login|signup|_next/).*)",
        headers: [
          { key: "Link", value: agentDiscoveryLinkHeader },
        ],
      },
      {
        source: "/.well-known/api-catalog",
        headers: [
          { key: "Content-Type", value: "application/linkset+json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/openapi.json",
        headers: [
          { key: "Content-Type", value: "application/openapi+json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/oauth-protected-resource",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/mcp.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/mcp/server-card.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/agent-skills.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/agent-skills/index.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/.well-known/agent-skills/skills/:slug.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
