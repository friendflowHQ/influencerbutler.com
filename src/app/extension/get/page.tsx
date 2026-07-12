import { Suspense } from "react";
import AffiliateTouch from "@/components/AffiliateTouch";
import ExtensionLandingContent from "../ExtensionLandingContent";

export const metadata = {
  title: "Get the Free Amazon Influencer Chrome Extension | Influencer Butler",
  description:
    "Install the free Influencer Butler Chrome extension: influencer vs brand video counts, content gaps from your own orders, Butler Approved opportunity seals, and a storefront checkup. 100% free.",
};

// Attributed twin of the /extension short link. Unlike the bare /extension path
// (which redirects straight to the Web Store before any JS runs), this route
// actually renders our landing page, so <AffiliateTouch /> can drop the
// first-touch affiliate cookie from a ?code= param. Affiliates promoting the
// free extension share /extension/get?code=THEIRCODE, and get credited when the
// visitor later starts a paid subscription. Not caught by the /extension
// redirect (that rule matches the exact path only).
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
