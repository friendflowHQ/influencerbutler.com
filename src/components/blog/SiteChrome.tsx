"use client";

import Link from "next/link";
import { useState } from "react";
import NewsletterSignup from "@/components/NewsletterSignup";
import FacebookGroupIconLink from "@/components/FacebookGroupIconLink";

/**
 * Header and footer for the /blog pages. These mirror the markup and styling of
 * the static marketing site (public/index.html + public/css/styles.css) so the
 * blog feels like part of the same website. Colors map to the site's brand
 * tokens: --brand #f97316 is Tailwind orange-500, --muted #6b7280 is slate-500,
 * --border #e5e7eb is slate-200, and the footer background #fafafa.
 */

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog", current: true },
  { href: "/login", label: "Login" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Influencer Butler home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler logo"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Influencer Butler
          </span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  item.current
                    ? "text-[0.95rem] font-medium text-orange-500"
                    : "text-[0.95rem] font-medium text-slate-500 transition-colors hover:text-orange-500"
                }
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <a
          href="/go/trial?src=blog-nav"
          className="ml-4 hidden rounded-[14px] bg-orange-500 px-6 py-2.5 text-[0.95rem] font-semibold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)] transition hover:bg-orange-600 md:inline-flex"
        >
          Start Free Trial
        </a>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          className="flex flex-col gap-1.5 md:hidden"
        >
          <span className="h-0.5 w-6 bg-slate-900" />
          <span className="h-0.5 w-6 bg-slate-900" />
          <span className="h-0.5 w-6 bg-slate-900" />
        </button>
      </nav>

      {open ? (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    item.current
                      ? "block py-2 font-medium text-orange-500"
                      : "block py-2 font-medium text-slate-600 hover:text-orange-500"
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
                className="mt-2 inline-flex rounded-[14px] bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600"
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
              <Link href="/#features" className="block text-slate-500 hover:text-orange-500">
                Features
              </Link>
              <Link href="/#pricing" className="block text-slate-500 hover:text-orange-500">
                Pricing
              </Link>
              <Link href="/#how-it-works" className="block text-slate-500 hover:text-orange-500">
                How It Works
              </Link>
              <Link href="/#faq" className="block text-slate-500 hover:text-orange-500">
                FAQ
              </Link>
              <Link href="/blog" className="block text-slate-500 hover:text-orange-500">
                Blog
              </Link>
              <Link href="/affiliates" className="block text-slate-500 hover:text-orange-500">
                Affiliates: Earn 30%
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">
              Legal
            </h4>
            <div className="space-y-2.5 text-sm">
              <a href="/legal/privacy.html" className="block text-slate-500 hover:text-orange-500">
                Privacy Policy
              </a>
              <a href="/legal/eula.html" className="block text-slate-500 hover:text-orange-500">
                EULA
              </a>
              <a href="/legal/terms.html" className="block text-slate-500 hover:text-orange-500">
                Terms of Service
              </a>
              <a href="/legal/refund.html" className="block text-slate-500 hover:text-orange-500">
                Refund Policy
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">
              Support
            </h4>
            <div className="space-y-2.5 text-sm">
              <a
                href="mailto:hello@influencerbutler.com"
                className="block text-slate-500 hover:text-orange-500"
              >
                Contact Us
              </a>
              <Link href="/dashboard" className="block text-slate-500 hover:text-orange-500">
                My Account
              </Link>
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
