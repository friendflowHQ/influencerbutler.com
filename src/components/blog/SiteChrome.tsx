"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import NewsletterSignup from "@/components/NewsletterSignup";
import FacebookGroupIconLink from "@/components/FacebookGroupIconLink";
import SiteSearch from "@/components/SiteSearch";
import { SUPPORT_HOURS_LINE } from "@/lib/support-hours";

/**
 * Header and footer for the /blog pages. These mirror the markup and styling of
 * the static marketing site (public/index.html + public/css/styles.css) so the
 * blog feels like part of the same website. Colors map to the site's brand
 * tokens: --brand #f97316 is Tailwind orange-500, --muted #6b7280 is slate-500,
 * --border #e5e7eb is slate-200, and the footer background #fafafa.
 */

type NavItem = { href: string; label: string; current?: boolean };

const NAV_LINKS: NavItem[] = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
  { href: "/extension", label: "Extension" },
  { href: "/#faq", label: "FAQ" },
  { href: "/course/amazon-influencer", label: "Free Course" },
  { href: "/blog", label: "Blog", current: true },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About" },
  { href: "/tools", label: "Free Tools" },
  { href: "/login", label: "Login" },
];

// Desktop bar: seven entries instead of twelve. The reading and community
// pages live under a "Resources" dropdown. The mobile menu keeps the full flat
// list (NAV_LINKS), so nothing is lost on small screens.
const RESOURCE_HREFS = ["/#faq", "/course/amazon-influencer", "/blog", "/events", "/tools", "/about"];
const RESOURCE_LINKS = NAV_LINKS.filter((l) => RESOURCE_HREFS.includes(l.href));
const BAR_LINKS = NAV_LINKS.filter((l) => !RESOURCE_HREFS.includes(l.href));

function ResourcesMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const hasCurrent = RESOURCE_LINKS.some((l) => l.current);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <li ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          hasCurrent
            ? "inline-flex items-center gap-1 whitespace-nowrap text-[0.9rem] font-medium text-orange-700"
            : "inline-flex items-center gap-1 whitespace-nowrap text-[0.9rem] font-medium text-slate-500 transition-colors hover:text-orange-700"
        }
      >
        Resources
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul className="absolute left-0 top-full z-50 mt-3 w-52 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
          {RESOURCE_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={item.current ? "page" : undefined}
                className={
                  item.current
                    ? "block px-4 py-2 text-[0.9rem] font-semibold text-orange-700"
                    : "block px-4 py-2 text-[0.9rem] font-medium text-slate-600 hover:bg-orange-50 hover:text-orange-700"
                }
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Influencer Butler home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler logo"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <span className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-900">
            Influencer Butler
          </span>
        </Link>

        {/* The full link row (plus search and the CTA) needs ~1180px to fit
            without crowding - matching the static site's own collapse point
            (public/css/styles.css, "Collapse the nav to a hamburger..."). The
            Tailwind lg breakpoint (1024px) is too narrow for that and used to
            force this logo to wrap onto two lines; xl (1280px) gives the row
            enough room. */}
        <ul className="ml-6 hidden items-center gap-5 xl:flex">
          {BAR_LINKS.filter((l) => l.href !== "/login").map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="whitespace-nowrap text-[0.9rem] font-medium text-slate-500 transition-colors hover:text-orange-700"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <ResourcesMenu />
          <li>
            <Link
              href="/login"
              className="whitespace-nowrap text-[0.9rem] font-medium text-slate-500 transition-colors hover:text-orange-700"
            >
              Login
            </Link>
          </li>
        </ul>

        {/* The link row is tight, so search is a magnifier that expands into a
            field on click rather than a permanent inline box. */}
        <div className="ml-3 hidden xl:block">
          <SiteSearch variant="header" />
        </div>

        <a
          href="/go/trial?src=blog-nav"
          className="ml-3 hidden whitespace-nowrap rounded-[14px] border-2 border-orange-700 bg-orange-700 px-5 py-2 text-[0.9rem] font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-800 xl:inline-flex [body:has(#ib-price-lock-banner)_&]:bg-white [body:has(#ib-price-lock-banner)_&]:text-orange-700 [body:has(#ib-price-lock-banner)_&]:shadow-none [body:has(#ib-price-lock-banner)_&]:hover:bg-orange-50"
        >
          Start Free Trial
        </a>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          className="flex flex-col gap-1.5 xl:hidden"
        >
          <span className="h-0.5 w-6 bg-slate-900" />
          <span className="h-0.5 w-6 bg-slate-900" />
          <span className="h-0.5 w-6 bg-slate-900" />
        </button>
      </nav>

      {open ? (
        <div className="border-t border-slate-200 bg-white xl:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            <li className="mb-2">
              <SiteSearch variant="inline" onNavigate={() => setOpen(false)} />
            </li>
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    item.current
                      ? "block py-2 font-medium text-orange-700"
                      : "block py-2 font-medium text-slate-600 hover:text-orange-700"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="/go/trial?src=blog-nav-mobile"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex rounded-[14px] bg-orange-700 px-6 py-2.5 font-semibold text-white hover:bg-orange-800"
              >
                Start Free Trial
              </a>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-[#fafafa] pt-14 pb-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <NewsletterSignup
            source="footer"
            title="The free Amazon-influencer newsletter"
            subtitle="Tips, commission tactics, trending product picks, and new features. No spam, unsubscribe anytime."
            className="max-w-xl"
          />
        </div>

        <div className="mb-10 grid gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/influencer-butler-logo.png"
                alt="Influencer Butler logo"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Influencer Butler
              </span>
            </Link>
            <p className="mt-3 max-w-[260px] text-sm text-slate-500">
              The all-in-one command center for creators and influencers.
            </p>
            <p className="mt-3 max-w-[260px] text-sm text-slate-500">
              Available in English, Spanish, and French.
            </p>
            <FacebookGroupIconLink className="mt-4" />
          </div>

          <div>
            <h4 className="mb-4 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">
              Product
            </h4>
            <div className="space-y-2.5 text-sm">
              <Link href="/#features" className="block text-slate-500 hover:text-orange-700">
                Features
              </Link>
              <Link href="/#pricing" className="block text-slate-500 hover:text-orange-700">
                Pricing
              </Link>
              <Link href="/#how-it-works" className="block text-slate-500 hover:text-orange-700">
                How It Works
              </Link>
              <Link href="/#faq" className="block text-slate-500 hover:text-orange-700">
                FAQ
              </Link>
              <Link href="/blog" className="block text-slate-500 hover:text-orange-700">
                Blog
              </Link>
              <Link href="/events" className="block text-slate-500 hover:text-orange-700">
                Events
              </Link>
              <Link href="/course/amazon-influencer" className="block text-slate-500 hover:text-orange-700">
                Free Amazon Influencer Course
              </Link>
              <Link href="/tools" className="block text-slate-500 hover:text-orange-700">
                Free Tools
              </Link>
              <Link href="/videos" className="block text-slate-500 hover:text-orange-700">
                Walkthrough Videos
              </Link>
              <Link href="/affiliates" className="block text-slate-500 hover:text-orange-700">
                Affiliates: Earn 30%
              </Link>
              <Link href="/download" className="block text-slate-500 hover:text-orange-700">
                Download the App
              </Link>
              <Link href="/extension" className="block text-slate-500 hover:text-orange-700">
                Chrome Extension: Free
              </Link>
              <Link href="/about" className="block text-slate-500 hover:text-orange-700">
                About Liz
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">
              Legal
            </h4>
            <div className="space-y-2.5 text-sm">
              <a href="/legal/privacy.html" className="block text-slate-500 hover:text-orange-700">
                Privacy Policy
              </a>
              <a href="/legal/eula.html" className="block text-slate-500 hover:text-orange-700">
                EULA
              </a>
              <a href="/legal/terms.html" className="block text-slate-500 hover:text-orange-700">
                Terms of Service
              </a>
              <a href="/legal/refund.html" className="block text-slate-500 hover:text-orange-700">
                Refund Policy
              </a>
              {process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED === "1" ? (
                <a href="/legal/build-week-rules" className="block text-slate-500 hover:text-orange-700">
                  Build Week Rules
                </a>
              ) : null}
              <a href="/legal/accessibility" className="block text-slate-500 hover:text-orange-700">
                Accessibility
              </a>
              <a href="/security" className="block text-slate-500 hover:text-orange-700">
                Security
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">
              Support
            </h4>
            <div className="space-y-2.5 text-sm">
              <Link
                href="/contact"
                className="block text-slate-500 hover:text-orange-700"
              >
                Contact Us
              </Link>
              <Link href="/dashboard" className="block text-slate-500 hover:text-orange-700">
                My Account
              </Link>
              <p className="text-slate-500">{SUPPORT_HOURS_LINE}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <p className="text-center text-xs text-slate-500">
            &copy; 2026 The Social Media Posse LLC. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
