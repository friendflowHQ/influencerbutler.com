import Link from "next/link";
import LicenseKeyDisplay from "@/components/dashboard/LicenseKeyDisplay";
import { WELCOME_COPY, DESKTOP_APP_DOWNLOAD_URL, type WelcomeTier } from "@/lib/welcome-copy";

type Props = {
  tier: WelcomeTier;
};

/**
 * Shared render body for the three /welcome/* tier pages. Keeps the tier pages
 * themselves thin — they just pass `tier` so server-rendered copy and layout
 * stays consistent.
 */
export default function WelcomeTierContent({ tier }: Props) {
  const copy = WELCOME_COPY[tier];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">{copy.eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
        {copy.headline}
      </h1>
      <p className="mt-3 text-sm text-slate-600 sm:text-base">{copy.subhead}</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={DESKTOP_APP_DOWNLOAD_URL}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          Download the desktop app
        </a>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316]"
        >
          Go to dashboard
        </Link>
      </div>

      <div className="mt-10">
        <LicenseKeyDisplay variant="panel" />
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">What to expect</h2>
        <ol className="mt-4 space-y-3">
          {copy.steps.map((step, i) => (
            <li
              key={step.title}
              className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"
            >
              <span className="mt-0.5 font-semibold text-[#f97316]">{i + 1}.</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-sm text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {copy.callout ? (
        <aside className="mt-8 rounded-xl border border-[#f97316]/30 bg-[#f97316]/5 p-5">
          <p className="text-sm font-semibold text-slate-900">{copy.callout.title}</p>
          <p className="mt-1 text-sm text-slate-600">{copy.callout.body}</p>
          <Link
            href={copy.callout.ctaHref}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#f97316] hover:text-[#ea580c]"
          >
            {copy.callout.ctaLabel} <span aria-hidden>→</span>
          </Link>
        </aside>
      ) : null}

      <p className="mt-8 text-xs text-slate-500">
        Questions? Email{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-slate-700 hover:text-[#f97316]"
        >
          hello@influencerbutler.com
        </a>
        .
      </p>
    </section>
  );
}
