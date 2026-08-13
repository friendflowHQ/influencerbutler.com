import type { Metadata, Viewport } from "next";
import Script from "next/script";
import MetaPixel from "@/components/MetaPixel";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.influencerbutler.com"),
  title: {
    default: "Influencer Butler | All-in-One Amazon Influencer Automation Software",
    template: "%s | Influencer Butler",
  },
  description:
    "Influencer Butler is the all-in-one desktop app for Amazon creators and influencers. Automate Creator Connections outreach, auto-accept campaigns, harvest commissions, and post deals with 40+ built-in tools.",
  applicationName: "Influencer Butler",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Influencer Butler",
    locale: "en_US",
    url: "https://www.influencerbutler.com/",
    images: ["/assets/influencer-butler-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/assets/influencer-butler-og-image.png"],
  },
  icons: {
    icon: "/assets/influencer-butler-logo.png",
    shortcut: "/assets/influencer-butler-logo.png",
    apple: "/assets/influencer-butler-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        {/* Consent Mode v2 + cookie banner. Sets analytics/advertising signals
            to "denied" by default, loads gtag.js itself, and (on "Accept all")
            enables the Meta pixel via the ib-consent-change event + ib_ads_consent
            cookie. Single consent source shared with the static public/*.html
            pages, which load the same script. */}
        <Script src="/js/consent.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-[Inter]">
        {children}
        <MetaPixel />
        <Script src="/download-guidance.js" strategy="afterInteractive" />
        <Script src="/js/activity-widget.js" strategy="afterInteractive" />
        <Script src="/js/webmcp.js" strategy="afterInteractive" />
        <Script src="/js/image-lightbox.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
