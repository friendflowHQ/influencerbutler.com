const FAQ = [
  {
    q: "How does the free trial work?",
    a: "Every paid plan starts with a 3-day free trial. You can use all 29+ butlers during the trial. Cancel anytime before day 3 and you won't be charged.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel in one click from your dashboard. You keep access until the end of the current billing period — no support ticket, no questions.",
  },
  {
    q: "Do you offer refunds?",
    a: "If you're charged unexpectedly or run into a serious issue, email hello@influencerbutler.com within 14 days and we'll make it right.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards, debit cards, and PayPal — processed by Lemon Squeezy. Checkout opens right on this page, you never leave the site.",
  },
  {
    q: "Can I stack a welcome discount with an affiliate code?",
    a: "Only one discount applies per purchase. If you arrived with an affiliate or referral code, that takes priority and the site-wide welcome offer is set aside.",
  },
  {
    q: "Is my data secure?",
    a: "Your data stays on your computer — the butlers run locally. We don't store your Amazon credentials, Instagram passwords, or message content on our servers.",
  },
];

export default function PricingFaq() {
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {FAQ.map(({ q, a }) => (
        <li key={q}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:px-6 sm:text-base">
              <span>{q}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="flex-shrink-0 text-slate-400 transition group-open:rotate-180"
              >
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="px-5 pb-5 text-sm text-slate-600 sm:px-6 sm:text-base">{a}</div>
          </details>
        </li>
      ))}
    </ul>
  );
}
