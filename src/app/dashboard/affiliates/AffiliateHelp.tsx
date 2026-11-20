"use client";

import Link from "next/link";

/**
 * Footer help for the affiliate dashboard: a short FAQ, a link to the full
 * tutorial, and a contact link that pre-fills the subject.
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: "When do I get paid?",
    a: "Monthly via PayPal, on or around the 1st, once your payable balance is at least $10. Each order is held for 14 days first so refunds and disputes can settle.",
  },
  {
    q: "Why is my payout on hold?",
    a: "Larger payouts, and every payout while we still review them by hand, get a quick team check before release. It usually adds a few days and nothing is wrong with your account.",
  },
  {
    q: "Which tax form do I fill in?",
    a: "W-9 if you are in the United States, W-8BEN if you are an individual outside it, W-8BEN-E if you are a business outside it.",
  },
  {
    q: "What are VIP Guest Passes?",
    a: "A free single-seat Pro workspace you can give a warm prospect for a set time. It carries your referral link, so you earn commission if they upgrade.",
  },
  {
    q: "Does the public leaderboard show my earnings?",
    a: "No. Only your referral count is shown, and only by initials unless you opt in to show your handle.",
  },
];

export default function AffiliateHelp() {
  return (
    <section
      aria-labelledby="aff-help-title"
      className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"
    >
      <h2 id="aff-help-title" className="text-sm font-semibold text-slate-900">
        Help and questions
      </h2>
      <div className="mt-3 divide-y divide-slate-100">
        {FAQ.map((item) => (
          <details key={item.q} className="py-2">
            <summary className="cursor-pointer font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700">
              {item.q}
            </summary>
            <p className="mt-1 text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Link
          href="/help/tutorials/affiliate-program-dashboard"
          className="font-medium text-orange-700 hover:text-orange-800"
        >
          Read the full affiliate guide
        </Link>
        <Link
          href="/contact?subject=Affiliate%20question"
          className="font-medium text-orange-700 hover:text-orange-800"
        >
          Contact our affiliate team
        </Link>
      </p>
    </section>
  );
}
