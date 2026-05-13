import type { NextConfig } from "next";

const SUPABASE_AUTH_BASE = "https://khutiiojhafblabtixpp.supabase.co/auth/v1";

const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "https://khutiiojhafblabtixpp.supabase.co",
  "https://api.lemonsqueezy.com",
  "https://www.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
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
  "script-src 'self' 'unsafe-inline' https://assets.lemonsqueezy.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src 'self' https://*.lemonsqueezy.com",
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
      { source: "/", destination: "/index.html" },
      { source: "/landing", destination: "/landing-page.html" },
      { source: "/stop-messaging-brands", destination: "/stop-messaging-brands.html" },
      { source: "/email-sequences", destination: "/email-sequences.html" },
      { source: "/features/:slug", destination: "/features/:slug.html" },
      { source: "/legal/privacy", destination: "/legal/privacy.html" },
      { source: "/legal/terms", destination: "/legal/terms.html" },
      { source: "/legal/eula", destination: "/legal/eula.html" },
    ];
  },
  async redirects() {
    return [
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
