import ExtensionLandingContent from "./ExtensionLandingContent";

export const metadata = {
  title: "Free Amazon Influencer Chrome Extension | Influencer Butler",
  description:
    "See influencer vs brand video counts on any Amazon product, find content gaps in your own orders, spot Butler Approved opportunities, and check your storefront. 100% free.",
};

// NOTE: /extension is redirected straight to the Chrome Web Store listing by
// next.config.ts (it is the store short link used across the site, footer, help
// tutorials, and the desktop app install buttons), so this page component does
// not actually render at /extension today. It is kept as a safety net (if the
// redirect is ever removed) and as the canonical home of the landing markup,
// which is shared with the attributed /extension/get route.
export default function ExtensionLandingPage() {
  return <ExtensionLandingContent />;
}
