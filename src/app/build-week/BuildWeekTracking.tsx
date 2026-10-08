"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-client";

/** Fires build_week_view once per page view (per language). Renders nothing. */
export function TrackView({ lang }: { lang: string }) {
  useEffect(() => {
    trackEvent("build_week_view", { lang });
  }, [lang]);
  return null;
}

/** A normal link that also reports a GA4 event when clicked. */
export function TrackedLink({
  href,
  event,
  className,
  children,
  external = false,
}: {
  href: string;
  event: string;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => trackEvent(event)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
