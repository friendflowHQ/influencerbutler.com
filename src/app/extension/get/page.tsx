import type { Metadata } from "next";
import { Suspense } from "react";
import AffiliateTouch from "@/components/AffiliateTouch";
import ExtensionLandingContent from "../ExtensionLandingContent";

export const metadata: Metadata = {
  title: "Get the Free Amazon Influencer Chrome Extension",
  description:
    "Install the free Influencer Butler Chrome extension: Butler Score, BSR and revenue estimates, video counts, Creator Connections Campaign Radar, and deep links. 100% free.",
  robots: { index: false },
  alternates: { canonical: "https://www.influencerbutler.com/extension" },
};

// Attributed twin of the /extension landing page for affiliate links, noindex.
// Affiliates promoting the free extension share /extension/get?code=THEIRCODE;
// <AffiliateTouch /> drops the first-touch affiliate cookie from that ?code=
// param, and the affiliate gets credited when the visitor later starts a paid
// subscription. It renders the same landing markup as /extension (which is the
// canonical, indexable page) so the copy lives in one place.
export default function GetExtensionPage() {
  return (
    <>
      <Suspense fallback={null}>
        <AffiliateTouch />
      </Suspense>
      <ExtensionLandingContent />
    </>
  );
}
