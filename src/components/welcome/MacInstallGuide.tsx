/**
 * Mac companion to WindowsSmartScreenGuide, shown next to the desktop-app
 * Download CTA on the post-purchase /welcome/* pages. The Mac install is a
 * standard .dmg drag-to-Applications flow, so this stays short: open the .dmg,
 * drag the app in, and what to do if Gatekeeper hesitates on first open. Copy
 * is kept consistent with the /download page notes and public/download-guidance.js.
 *
 * Pure server component - the native <details> element handles open/close, so
 * it imports cleanly into both the server-rendered tier page and the
 * "use client" guest-checkout page.
 */
export default function MacInstallGuide() {
  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 open:bg-white open:shadow-sm sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <AppleIcon />
        <span className="flex-1">
          Installing on a Mac? Here&apos;s the 10-second walkthrough.
        </span>
        <ChevronIcon />
      </summary>

      <div className="mt-5 space-y-4 text-sm text-slate-700">
        <ol className="space-y-3">
          <MacStep number={1}>
            Open the downloaded <strong>.dmg</strong> file from your browser&apos;s
            downloads (top-right) or your Downloads folder.
          </MacStep>
          <MacStep number={2}>
            Drag <strong>Influencer Butler</strong> into your{" "}
            <strong>Applications</strong> folder, then launch it from there.
          </MacStep>
          <MacStep number={3}>
            If macOS hesitates on first open, right-click the app and choose{" "}
            <strong>Open</strong>. Still blocked? Go to System Settings, Privacy
            &amp; Security, then click <strong>Open Anyway</strong>.
          </MacStep>
        </ol>

        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-slate-600">
            The Mac app is signed and notarized by Apple, so it normally opens
            without any prompt. Apple Silicon (M1 and newer) and Intel Macs use
            different builds - the download buttons above cover both.
          </p>
        </div>
      </div>
    </details>
  );
}

function MacStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-white">
        {number}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function AppleIcon() {
  return (
    <svg
      className="h-5 w-5 flex-none text-[#f97316]"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.36 12.78c-.02-2.13 1.74-3.15 1.82-3.2-0.99-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.56.77-3.23.77-.66 0-1.69-.75-2.78-.73-1.43.02-2.75.83-3.49 2.11-1.49 2.58-.38 6.39 1.07 8.48.71 1.02 1.55 2.17 2.66 2.13 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.88-1.04 2.58-2.07.81-1.18 1.15-2.33 1.17-2.39-.03-.01-2.24-.86-2.26-3.42zM14.23 6.55c.59-.71.99-1.7.88-2.69-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.6.95.07 1.92-.48 2.51-1.19z" />
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
