import type { NextConfig } from "next";

const connectSrc = ["'self'", "https://*.supabase.co", "https://khutiiojhafblabtixpp.supabase.co", "https://api.lemonsqueezy.com"];
const imgSrc = ["'self'", "data:", "https://*.supabase.co", "https://khutiiojhafblabtixpp.supabase.co", "https://assets.lemonsqueezy.com"];

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://assets.lemonsqueezy.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src 'self' https://*.lemonsqueezy.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/landing", destination: "/landing-page.html" },
      { source: "/email-sequences", destination: "/email-sequences.html" },
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
    ];
  },
};

export default nextConfig;
