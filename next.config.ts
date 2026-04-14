import type { NextConfig } from "next";

const resolvedSupabaseOrigin = (() => {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredSupabaseUrl) {
    return null;
  }

  try {
    return new URL(configuredSupabaseUrl).origin;
  } catch {
    return null;
  }
})();

const connectSrc = ["'self'", "https://*.supabase.co", "https://api.lemonsqueezy.com"];
if (resolvedSupabaseOrigin) {
  connectSrc.push(resolvedSupabaseOrigin);
}

const imgSrc = ["'self'", "data:", "https://*.supabase.co", "https://assets.lemonsqueezy.com"];
if (resolvedSupabaseOrigin) {
  imgSrc.push(resolvedSupabaseOrigin);
}

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
          // CSP temporarily disabled for debugging
          // { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
