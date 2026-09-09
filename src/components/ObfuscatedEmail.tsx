"use client";

import { useEffect, useState } from "react";

/**
 * Renders an email address in a scraper-resistant way. The server and first
 * client paint output "{user} (at) {domain}" as plain text - no "@" and no
 * mailto: for bots harvesting static HTML. After mount, JS assembles the real
 * address into a clickable mailto link. Progressive + hydration-safe (same
 * placeholder-then-hydrate pattern as Countdown.tsx).
 */
export default function ObfuscatedEmail({
  user,
  domain,
  subject,
  className,
}: {
  user: string;
  domain: string;
  subject?: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Defer off the synchronous effect body so the server and first client
    // paint match (the obfuscated placeholder), then reveal the real address.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    return (
      <span className={className}>
        {user} (at) {domain}
      </span>
    );
  }

  const address = `${user}@${domain}`;
  const href = `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    <a className={className} href={href}>
      {address}
    </a>
  );
}
