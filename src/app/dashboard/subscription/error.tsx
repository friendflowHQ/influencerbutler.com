"use client";

type SubscriptionErrorProps = {
  error: Error;
  reset: () => void;
};

export default function SubscriptionError({ error, reset }: SubscriptionErrorProps) {
  console.error("Subscription route error", error);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f97316]">Influencer Butler</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Subscription unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">We couldn&apos;t load your subscription details right now.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
      >
        Try Again
      </button>
    </section>
  );
}
