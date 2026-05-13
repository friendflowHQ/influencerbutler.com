import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Influencer Butler",
  description: "Influencer campaign automation platform",
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
        <Script src="/js/webmcp.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
