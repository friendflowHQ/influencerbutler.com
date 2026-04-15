import Link from "next/link";
import Image from "next/image";

type ThanksPageProps = {
  searchParams: Promise<{ confirm?: string }>;
};

export default async function AffiliateThanksPage({ searchParams }: ThanksPageProps) {
  const { confirm } = await searchParams;
  const requiresEmailConfirmation = confirm === "1";

  return (
    <main className="min-h-screen bg-slate-50 py-16">
      <div className="mx-auto max-w-xl px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f97316]/10">
            <Image
              src="/assets/influencer-butler-logo.png"
              alt="Influencer Butler logo"
              width={36}
              height={36}
              className="rounded"
              priority
            />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Application received 🎉</h1>
          <p className="mt-3 text-slate-600">
            Thanks for applying to the Influencer Butler affiliate program. Our team reviews new applicants
            weekly — most hear back within 48 hours.
          </p>

          {requiresEmailConfirmation ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Please confirm your email address using the link we just sent to complete your sign-up.
            </p>
          ) : null}

          <ol className="mt-8 space-y-3 text-left text-sm text-slate-700">
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#f97316]">1.</span>
              <span>We review your application and get back to you via email.</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#f97316]">2.</span>
              <span>
                Once approved, log in at{" "}
                <Link
                  href="/login?next=/dashboard/affiliates"
                  className="font-medium text-[#f97316] hover:text-[#ea580c]"
                >
                  /login
                </Link>{" "}
                to grab your referral link.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#f97316]">3.</span>
              <span>Share your link, and start earning 35% recurring commission.</span>
            </li>
          </ol>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard/affiliates"
              className="rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Go to your dashboard
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316]"
            >
              Back to homepage
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-500">
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
      </div>
    </main>
  );
}
