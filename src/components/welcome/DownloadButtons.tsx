/**
 * Windows + Mac download buttons shown side by side. Mac gets two equally
 * prominent buttons (Apple Silicon and Intel) plus a "how to tell" hint, because
 * the browser can't reliably tell arm64 from x64 and an Intel Mac given the arm64
 * .dmg shows a prohibited-sign icon and will not open. Every link routes through
 * /go/download?os=... so the trial-click tracker fires and each button lands on
 * the exact installer (Windows .exe, Mac arm64, or Mac Intel x64).
 *
 * No client state - plain links - so it imports cleanly into both server
 * components (WelcomeTierContent) and client components (WelcomeGuestClient,
 * LicenseKeyDisplay).
 */
type Props = {
  // Optional analytics tag forwarded to the tracker as ?src=...
  source?: string;
  // "lg" matches the marketing/welcome CTA size; "md" suits dashboard panels.
  size?: "md" | "lg";
  className?: string;
};

function href(os: string, source?: string): string {
  const params = new URLSearchParams({ os });
  if (source) params.set("src", source);
  return `/go/download?${params.toString()}`;
}

export default function DownloadButtons({ source, size = "lg", className }: Props) {
  const pad = size === "lg" ? "px-5 py-2.5" : "px-4 py-2";
  const buttonClass = `inline-flex items-center justify-center gap-2 rounded-xl bg-[#f97316] ${pad} text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]`;

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a href={href("win", source)} className={buttonClass}>
          <DownloadIcon />
          Download for Windows
        </a>
        <a href={href("mac-arm", source)} className={buttonClass}>
          <DownloadIcon />
          Download for Mac (Apple Silicon, M1 or newer)
        </a>
        <a href={href("mac-intel", source)} className={buttonClass}>
          <DownloadIcon />
          Download for Mac (Intel)
        </a>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Not sure? Apple menu &gt; About This Mac: Chip says Apple M1/M2/M3/M4 = Apple Silicon,
        Processor says Intel = Intel. Requires macOS 11 Big Sur or newer.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        Also free:{" "}
        <a href="/extension" className="font-semibold text-slate-600 underline hover:text-[#f97316]">
          add the Chrome extension
        </a>{" "}
        for Amazon intel while you browse, on every account.
      </p>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}
