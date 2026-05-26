"use client";

import { useState } from "react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much do affiliates earn?",
    a: "You earn 30% of every subscription payment your referrals make - month after month - for the first 12 months they stay subscribed. There are no per-affiliate earning caps and no tier drops; the only cap is the 12-month commission window per referred customer.",
  },
  {
    q: "How long does the referral cookie last?",
    a: "30 days. If someone clicks your link and subscribes any time within 30 days, the sale is credited to you. We use last-click attribution - whichever referrer was the last to drive the click gets the commission.",
  },
  {
    q: "When do I get paid?",
    a: "Monthly, on the 1st of each month, paid directly by Lemon Squeezy once your unpaid balance is at least $10. If you're under $10 it rolls to next month. Payout method (PayPal, Wise, bank, etc.) is set in your Lemon Squeezy portal at app.lemonsqueezy.com. Influencer Butler is not part of the payment chain - payout questions go to Lemon Squeezy support.",
  },
  {
    q: "How do taxes work?",
    a: "Lemon Squeezy collects a W-9 (if you're in the US) or W-8BEN / W-8BEN-E (if you're outside the US) when you finish signup at their affiliate portal. If you're a US affiliate earning $600 or more in a calendar year, Lemon Squeezy issues your 1099-NEC. Non-US affiliates may have US tax withholding applied per your country's treaty rate - the rate is set by which W-8 form you submit. None of this lives in your Influencer Butler dashboard; your tax info is in your LS portal.",
  },
  {
    q: "What if my referral cancels or refunds?",
    a: "You earn for the first 12 months they pay. The moment they cancel - or once they hit the 12-month mark, whichever comes first - no more commissions accrue on that customer, but every commission you already earned stays yours. Refunds during Lemon Squeezy's clawback window reduce your unpaid balance accordingly.",
  },
  {
    q: "How do I promote Influencer Butler?",
    a: "Anywhere your audience hangs out - YouTube reviews, newsletters, podcasts, social posts, courses, or 1:1 recommendations. The only things we don't allow are trademark bidding on paid search, fake coupon sites, and incentivized traffic. Per FTC rules, please disclose the affiliate relationship in your posts (e.g. \"#ad\" or \"affiliate link\").",
  },
  {
    q: "Can I stack with other promo codes?",
    a: "No. A customer can use either your affiliate code OR a site-wide welcome discount at checkout - not both. If they arrive through your affiliate link, your code's discount applies and the welcome discount is suppressed so you still earn the commission. Lemon-Squeezy-side referral attribution is preserved either way.",
  },
  {
    q: "Who reviews applications?",
    a: "Our team reviews new applicants weekly. We're looking for creators and operators whose audience actually benefits from the product. Most applications get a response within 48 hours.",
  },
  {
    q: "Do I need to be a customer to be an affiliate?",
    a: "Not at all - but it helps. Creators who use Influencer Butler themselves tend to convert much better. Ask and we'll happily set you up with a trial.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {FAQS.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <li key={item.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold text-slate-900">{item.q}</span>
              <span
                className={`mt-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-slate-300 text-slate-500 transition ${
                  isOpen ? "rotate-45 border-[#f97316] text-[#f97316]" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            {isOpen ? (
              <div className="px-5 pb-5 text-sm text-slate-600">{item.a}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
