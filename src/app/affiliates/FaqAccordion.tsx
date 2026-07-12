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
    a: "Monthly, via PayPal, paid directly by us. A month's earnings are held through the following month (a short buffer that lets refunds settle first), then paid on or around the 1st of the month after, once your unpaid balance is at least $10. For example, commissions you earn in July are paid in early September. If you're under $10 it rolls to next month. Add your PayPal email and complete your tax form right in your affiliate dashboard, since we can't send a payout without both. PayPal receiving and currency-conversion fees are not covered, so the amount that lands can be slightly less than your gross commission.",
  },
  {
    q: "How do taxes work?",
    a: "Because we pay you directly, you complete your tax form in your affiliate dashboard: a W-9 if you're in the US, or a W-8BEN / W-8BEN-E if you're outside the US. Your taxpayer ID is encrypted and used only to prepare your 1099. If you're a US affiliate earning $600 or more in a calendar year, we issue your 1099-NEC. Non-US affiliates provide a W-8BEN and are responsible for reporting income in their own country; US withholding may apply depending on your tax treaty.",
  },
  {
    q: "What if my referral cancels or refunds?",
    a: "You earn for the first 12 months they pay. The moment they cancel - or once they hit the 12-month mark, whichever comes first - no more commissions accrue on that customer, but every commission you already earned stays yours. Refunds within the refund window reduce your unpaid balance accordingly.",
  },
  {
    q: "How do I promote Influencer Butler?",
    a: "Anywhere your audience hangs out - YouTube reviews, newsletters, podcasts, social posts, courses, or 1:1 recommendations. The only things we don't allow are trademark bidding on paid search, fake coupon sites, and incentivized traffic. Per FTC rules, please disclose the affiliate relationship in your posts (e.g. \"#ad\" or \"affiliate link\").",
  },
  {
    q: "Can I stack with other promo codes?",
    a: "No. A customer can use either your affiliate code OR a site-wide welcome discount at checkout - not both. If they arrive through your affiliate link, your code's discount applies and the welcome discount is suppressed so you still earn the commission. Your referral attribution is preserved either way.",
  },
  {
    q: "Who reviews applications?",
    a: "Our team reviews new applicants promptly. We're looking for creators and operators whose audience actually benefits from the product. Most applications get a response within a day, and the moment you're approved your code and tracked link are live, with no second signup anywhere else.",
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
