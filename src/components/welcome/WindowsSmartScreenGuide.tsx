/**
 * Pre-warning + walkthrough shown next to the desktop-app Download CTA on the
 * post-purchase /welcome/* pages. First-time downloaders see Microsoft
 * Defender SmartScreen prompts because the installer is OV-signed (not EV) and
 * each release hash takes time to build SmartScreen reputation. The signature
 * itself is valid; the prompts are normal. This component sets expectations
 * before the user clicks Download and walks them through both prompts so
 * non-technical buyers don't bail.
 *
 * Pure server component — the native <details> element handles open/close, so
 * it imports cleanly into both the server-rendered tier page and the
 * "use client" guest-checkout page.
 */
export default function WindowsSmartScreenGuide() {
  return (
    <details className="group mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 open:bg-white open:shadow-sm sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <ShieldIcon />
        <span className="flex-1">
          Heads up: Windows may show a &ldquo;SmartScreen&rdquo; prompt. Here&apos;s the
          10-second walkthrough.
        </span>
        <ChevronIcon />
      </summary>

      <div className="mt-5 space-y-6 text-sm text-slate-700">
        <p>
          Windows will ask you to confirm before installing. That&apos;s normal for
          newer apps — here&apos;s exactly what you&apos;ll see and where to click.
        </p>

        <Step
          number={1}
          aspectClass="aspect-[16/7]"
          placeholderLabel="TODO: screenshot — browser download bar (click ▼ → Keep anyway)"
        >
          <p className="font-semibold text-slate-900">
            In your browser&apos;s download bar, click the &ldquo;▼&rdquo; next to
            &ldquo;Delete,&rdquo; then choose &ldquo;Keep anyway.&rdquo;
          </p>
          <p className="mt-1 text-slate-600">
            Chrome and Edge hold new installers in &ldquo;verify before
            opening&rdquo; until you confirm. The dropdown is the small arrow
            right next to the Delete button.
          </p>
        </Step>

        <Step
          number={2}
          aspectClass="aspect-[16/10]"
          placeholderLabel="TODO: screenshot — Windows protected your PC (More info → Run anyway)"
        >
          <p className="font-semibold text-slate-900">
            When you run the installer, Windows shows &ldquo;Windows protected
            your PC.&rdquo; Click <strong>More info</strong> →{" "}
            <strong>Run anyway</strong>.
          </p>
          <p className="mt-1 text-slate-600">
            The &ldquo;Run anyway&rdquo; button only appears after you click
            &ldquo;More info.&rdquo;
          </p>
        </Step>

        <div className="rounded-lg bg-slate-50 p-4">
          <p className="font-semibold text-slate-900">Why does this happen?</p>
          <p className="mt-1 text-slate-600">
            Microsoft requires brand-new apps to accumulate thousands of
            downloads before they&apos;re auto-trusted by SmartScreen — even when
            they&apos;re properly signed. Influencer Butler is signed by{" "}
            <strong className="text-slate-900">THE SOCIAL MEDIA POSSE LLC</strong>{" "}
            (you&apos;ll see this name in the prompt). That signature confirms the
            file is authentic and hasn&apos;t been tampered with.
          </p>
        </div>

        <ul className="space-y-2.5">
          <TrustItem>
            Publisher in the prompt should read{" "}
            <strong className="text-slate-900">THE SOCIAL MEDIA POSSE LLC</strong>
            {" "}— if it doesn&apos;t match, don&apos;t install. Re-download from
            influencerbutler.com.
          </TrustItem>
          <TrustItem>
            The installer is digitally signed with a code-signing certificate
            issued by SSL.com.
          </TrustItem>
          <TrustItem>
            After the first install, future updates apply silently — you&apos;ll
            only see this prompt once.
          </TrustItem>
        </ul>
      </div>
    </details>
  );
}

function Step(props: {
  number: number;
  aspectClass: string;
  placeholderLabel: string;
  children: React.ReactNode;
}) {
  const { number, aspectClass, placeholderLabel, children } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-white">
          {number}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
      {/* Placeholder block — swap for <img src="/assets/screenshots/smartscreen/..."> once real annotated screenshots are added (see README in that folder). */}
      <figure
        className={`flex ${aspectClass} w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-100 px-4 text-center text-xs text-slate-500`}
      >
        {placeholderLabel}
      </figure>
    </div>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-slate-600">
      <CheckIcon />
      <span>{children}</span>
    </li>
  );
}

function ShieldIcon() {
  return (
    <svg
      className="h-5 w-5 flex-none text-[#f97316]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 flex-none text-slate-500 transition-transform group-open:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 flex-none text-emerald-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
