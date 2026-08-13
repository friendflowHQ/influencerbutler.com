import type { NextConfig } from "next";

const SUPABASE_AUTH_BASE = "https://khutiiojhafblabtixpp.supabase.co/auth/v1";

// Single source of truth for the Chrome Web Store listing. The site's
// /extension short link (used across the landing page, footer, help pages, and
// the desktop app's install buttons) redirects here, so the extension id lives
// in exactly one place.
const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/influencer-butler/cnkfballfjhdijogkjjhdfmnkijcjgbc";

const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "https://khutiiojhafblabtixpp.supabase.co",
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
  "https://*.supabase.co",
  "https://khutiiojhafblabtixpp.supabase.co",
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
  "frame-ancestors 'none'",
].join("; ");

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
      { source: "/unsubscribe", destination: "/unsubscribe.html" },
      { source: "/features/:slug", destination: "/features/:slug.html" },
      { source: "/legal/privacy", destination: "/legal/privacy.html" },
      { source: "/legal/terms", destination: "/legal/terms.html" },
      { source: "/legal/eula", destination: "/legal/eula.html" },
      { source: "/legal/refund", destination: "/legal/refund.html" },
      { source: "/legal/cookies", destination: "/legal/cookies.html" },
      { source: "/legal/affiliate-terms", destination: "/legal/affiliate-terms.html" },
    ];
  },
  async redirects() {
    return [
      // /extension is the Web Store short link referenced across the landing
      // page, footer, and help tutorials, so it lands on the live Web Store
      // listing. Kept non-permanent so the target can be retargeted without a
      // browser-cached 301 lock-in.
      {
        source: "/extension",
        destination: CHROME_EXTENSION_URL,
        permanent: false,
      },
      // /help/chrome-extension is a help link baked into already-shipped desktop
      // app builds, so it lands on the extension's help article rather than the
      // install listing. Non-permanent for the same retargeting reason.
      {
        source: "/help/chrome-extension",
        destination: "/help/tutorials/extension",
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
        ],
      },
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
