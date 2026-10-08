"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics-client";

/**
 * Small share bar for the Build Week page: Facebook, X, WhatsApp, email and
 * copy link. Plain links (no SDKs, no third-party scripts). Deliberately neutral
 * colors: the blog's branded share buttons put white text on brand blue, orange
 * and green, which fails the WCAG AA contrast check this site enforces.
 * Every click reports build_week_share_click.
 */
type Props = {
  url: string;
  title: string;
  text: string;
  labels: { on: string; email: string; copyLink: string; copied: string };
};

const BTN =
  "inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition hover:border-orange-700 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function ShareRow({ url, title, text, labels }: Props) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);

  const links = [
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  ];

  const copy = async () => {
    trackEvent("build_week_share_click", { channel: "copy" });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the link is still in the address bar */
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={title}>
      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={BTN}
          aria-label={`${labels.on} ${l.name}`}
          onClick={() => trackEvent("build_week_share_click", { channel: l.name.toLowerCase() })}
        >
          {l.name}
        </a>
      ))}
      <a
        href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text} ${url}`)}`}
        className={BTN}
        onClick={() => trackEvent("build_week_share_click", { channel: "email" })}
      >
        {labels.email}
      </a>
      <button type="button" onClick={copy} className={BTN}>
        {copied ? labels.copied : labels.copyLink}
      </button>
      <span role="status" className="sr-only">{copied ? labels.copied : ""}</span>
    </div>
  );
}
