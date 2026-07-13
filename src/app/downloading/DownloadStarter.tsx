"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-starts the installer download shortly after the interstitial renders,
 * then leaves a manual fallback link in place. We trigger it with a synthetic
 * anchor click (not window.location) so the browser treats the .exe/.dmg as an
 * attachment and keeps the interstitial visible: that page is what pushes the
 * free Chrome extension as the next step, so we must not navigate away from it.
 */
export default function DownloadStarter({ url }: { url: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Small delay so the page paints before the browser's download bar appears.
    const timer = setTimeout(() => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }, 500);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <p className="mt-4 text-sm text-slate-500">
      Download not starting?{" "}
      <a href={url} className="font-semibold text-[#f97316] underline hover:text-[#ea580c]">
        Click here to download it manually
      </a>
      .
    </p>
  );
}
