import type { Metadata } from "next";
import ExtensionLandingContent from "./ExtensionLandingContent";

const SITE = "https://www.influencerbutler.com";

export const metadata: Metadata = {
  title: "Free Amazon Influencer Chrome Extension",
  description:
    "Free Chrome extension for Amazon influencers: Butler Score, BSR and revenue estimates, price history, influencer vs brand video counts, Creator Connections Campaign Radar, and deep links. Never throttled. 100% free.",
  alternates: { canonical: `${SITE}/extension` },
  openGraph: {
    title: "Free Amazon Influencer Chrome Extension",
    description:
      "Product research, Creator Connections radar, and deep links on the Amazon pages you already browse. Free forever.",
    url: `${SITE}/extension`,
    type: "website",
  },
};

// /extension is the indexable landing page for the free Chrome extension. The
// Web Store short link is /go/extension (next.config.ts redirects it to the
// listing). The landing markup itself lives in ExtensionLandingContent so the
// attributed /extension/get twin (affiliate ?code= links, noindex) can share it.
export default function ExtensionLandingPage() {
  return <ExtensionLandingContent />;
}
