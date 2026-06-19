/**
 * Windows + Mac download buttons shown side by side, with a small "Older Intel
 * Mac?" secondary link underneath. Every link routes through /go/download?os=...
 * so the trial-click tracker fires and each button lands on the exact installer
 * (Windows .exe, Mac Apple Silicon arm64, or Mac Intel x64). The browser can't
 * reliably tell arm64 from x64, so we default Mac to Apple Silicon and expose
 * the Intel build as the alternate link.
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
          Download for Mac
        </a>
      </div>
      <a
        href={href("mac-intel", source)}
        className="mt-2 inline-block text-xs font-semibold text-slate-500 hover:text-[#f97316]"
      >
        Older Intel Mac? Download here
      </a>
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
