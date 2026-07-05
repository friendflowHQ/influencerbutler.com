const FAQ = [
  {
    q: "What's free forever?",
    a: "The whole Chrome extension (video counts, content gaps, Butler Approved seals, storefront checks) works with no login. On the desktop app, five See & Organize butlers stay free on every account, even after a trial expires or a subscription is cancelled: Like Butler, Benable Like Butler, CC Check, Orders Butler, and Storefront Butler. No card required.",
  },
  {
    q: "How does the 3-day Pro trial work?",
    a: "When you're ready for the money engines (outreach automation, DMs, commission harvesting, and the rest of the 40+ butlers), start a 3-day Pro trial. You get full Pro Solo access, then it converts to Pro. Cancel anytime before day 3 and you won't be charged.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel in one click from your dashboard. You keep access until the end of the current billing period - no support ticket, no questions.",
  },
  {
    q: "Do you offer refunds?",
    a: "If you're charged unexpectedly or run into a serious issue, email hello@influencerbutler.com within 14 days and we'll make it right.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards, debit cards, and PayPal - processed by Lemon Squeezy. Checkout opens right on this page, you never leave the site.",
  },
  {
    q: "Can I stack a welcome discount with an affiliate code?",
    a: "Only one discount applies per purchase. If you arrived with an affiliate or referral code, that takes priority and the site-wide welcome offer is set aside.",
  },
  {
    q: "Is my data secure?",
    a: "Your data stays on your computer - the butlers run locally. We don't store your Amazon credentials, Instagram passwords, or message content on our servers.",
  },
  {
    q: "Do I need a powerful computer or server to run it?",
    a: "It runs comfortably on most modern laptops and desktops. Because the butlers drive real Chrome sessions in the background, we recommend at least 2 CPU cores and 4 GB of RAM, and 4 cores with 8 GB for heavy use. On a small or virtual machine, turn on Low resource mode in Settings. It switches on by itself when the app detects limited hardware, and it runs your automations one at a time so the window stays responsive instead of freezing.",
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
