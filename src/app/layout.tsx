import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-S1TC1QLYNN"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-S1TC1QLYNN');`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-[Inter]">
        {children}
        <Script src="/download-guidance.js" strategy="afterInteractive" />
        <Script src="/js/activity-widget.js" strategy="afterInteractive" />
        <Script src="/js/webmcp.js" strategy="afterInteractive" />
        <Script src="/js/image-lightbox.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
