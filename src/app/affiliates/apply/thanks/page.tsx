import Link from "next/link";
import Image from "next/image";

type ThanksPageProps = {
  searchParams: Promise<{ confirm?: string; np?: string }>;
};

export default async function AffiliateThanksPage({ searchParams }: ThanksPageProps) {
  const { confirm, np } = await searchParams;
  const requiresEmailConfirmation = confirm === "1";
  // They skipped the password, so a sign-in link is how they get back in.
  const noPassword = np === "1";

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-16">
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
            Thanks for applying to the Influencer Butler affiliate program. Most applicants hear back within
            a day, and the moment you&apos;re approved your code and tracked link are live in your dashboard.
            Check your inbox for a confirmation email (and your spam folder if it&apos;s not there).
          </p>

          {requiresEmailConfirmation ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
              <p>
                Please confirm your email address using the link we just sent to complete your sign-up.
              </p>
              <p className="mt-2">
                Already have an Influencer Butler account with this email? Then{" "}
                <Link
                  href="/login?next=/dashboard/affiliates"
                  className="font-semibold underline underline-offset-2"
                >
                  log in
                </Link>{" "}
                and apply from your affiliate dashboard instead, so your application attaches to your
                existing account.
              </p>
            </div>
          ) : null}

          <ol className="mt-8 space-y-3 text-left text-sm text-slate-700">
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#c2410c]">1.</span>
              <span>We review your application and email you a decision, usually within a day.</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#c2410c]">2.</span>
              <span>
                Once approved,{" "}
                <Link
                  href="/login?next=/dashboard/affiliates"
                  className="font-medium text-[#c2410c] hover:text-[#9a3412] underline underline-offset-2"
                >
                  log in
                </Link>{" "}
                to grab your referral link.
                {noPassword
                  ? " You didn't set a password, so choose \"Email me a sign-in link\" on the login page and we'll send one."
                  : null}
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-0.5 font-semibold text-[#c2410c]">3.</span>
              <span>
                Share your link and start earning 30% recurring commission for the first 12 months of each
                referral.
              </span>
            </li>
          </ol>

          <div className="mt-8 rounded-xl border border-orange-200 bg-orange-50 p-4 text-left text-sm text-slate-800">
            <p className="font-semibold text-slate-900">While you wait</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Get to know the product. The{" "}
                <Link href="/extension" className="font-medium text-[#c2410c] underline underline-offset-2">
                  free Chrome extension
                </Link>{" "}
                takes a minute, and creators who use it convert far better.
              </li>
              <li>
                Take the{" "}
                <Link
                  href="/course/amazon-influencer"
                  className="font-medium text-[#c2410c] underline underline-offset-2"
                >
                  free course
                </Link>{" "}
                for ideas you can share with your audience.
              </li>
              <li>
                Have your PayPal email and a W-9 or W-8BEN ready: you add both in your dashboard so we can
                pay you.
              </li>
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?next=/dashboard/affiliates"
              className="rounded-xl bg-[#c2410c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9a3412]"
            >
              Go to your dashboard
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#c2410c] hover:text-[#c2410c]"
            >
              Back to homepage
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-600">
            Questions?{" "}
            <Link href="/contact" className="font-medium text-slate-700 hover:text-[#c2410c]">
              Contact us
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
