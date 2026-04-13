import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/landing", destination: "/landing-page.html" },
      { source: "/email-sequences", destination: "/email-sequences.html" },
    ];
  },
};

export default nextConfig;
