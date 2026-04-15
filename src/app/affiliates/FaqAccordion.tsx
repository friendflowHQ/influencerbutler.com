"use client";

import { useState } from "react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much do affiliates earn?",
    a: "You earn 35% of every subscription payment your referrals make — month after month — for as long as they stay subscribed. There are no caps, no tier drops, and no expiring commissions.",
  },
  {
    q: "How long does the referral cookie last?",
    a: "30 days. If someone clicks your link and subscribes any time within 30 days, the sale is credited to you. We use last-click attribution — whichever referrer was the last to drive the click gets the commission.",
  },
  {
    q: "When do I get paid?",
    a: "Payouts are processed monthly through Lemon Squeezy once you hit the minimum payout threshold. Lemon Squeezy supports PayPal and other common payout methods depending on your country.",
  },
  {
    q: "How do I promote Influencer Butler?",
    a: "Anywhere your audience hangs out — YouTube reviews, newsletters, podcasts, social posts, courses, or 1:1 recommendations. The only things we don't allow are trademark bidding on paid search, fake coupon sites, and incentivized traffic.",
  },
  {
    q: "Can I stack with other promo codes?",
    a: "Yes. Coupon codes and referral tracking work together. If your referral uses a valid coupon at checkout, the commission is still attributed to you.",
  },
  {
    q: "Who reviews applications?",
    a: "Our team reviews new applicants weekly. We're looking for creators and operators whose audience actually benefits from the product. Most applications get a response within 48 hours.",
  },
  {
    q: "Do I need to be a customer to be an affiliate?",
    a: "Not at all — but it helps. Creators who use Influencer Butler themselves tend to convert much better. Ask and we'll happily set you up with a trial.",
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
