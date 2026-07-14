/**
 * Summary: Per-workspace SVG icons keyed by tutorial id. Mirrors the icon
 *   shapes shown on the homepage feature grid so help cards visually match.
 *   Stroke uses currentColor so the parent can theme via Tailwind text-*.
 */
import type { JSX, SVGProps } from "react";

type IconRenderer = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const baseProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons: Record<string, IconRenderer> = {
  "cc-check": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M9 11l3 3L22 4" stroke="currentColor" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" />
    </svg>
  ),
  amazonbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke="currentColor" />
    </svg>
  ),
  dailycommissionbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M12 2v20M2 12h20" stroke="currentColor" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" />
    </svg>
  ),
  ordersbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" />
    </svg>
  ),
  pricecrashbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" />
      <path d="M14 7h7v7" stroke="currentColor" />
    </svg>
  ),
  storefrontbutler: (p) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" />
    </svg>
  ),
  goldminebutler: (p) => (
    <svg {...baseProps} {...p}>
      <circle cx="11" cy="11" r="8" stroke="currentColor" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" />
    </svg>
  ),
  "data-refresh-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" />
    </svg>
  ),
  "daily-deals": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  ),
  likebutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" />
    </svg>
  ),
  "video-reload-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M23 7l-7 5 7 5V7z" stroke="currentColor" />
      <rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" />
    </svg>
  ),
  "youtube-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" stroke="currentColor" />
      <path d="m9.75 15.02 5.75-3.27-5.75-3.27v6.54z" fill="currentColor" />
    </svg>
  ),
  "retag-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" />
      <path d="M7 7h.01" stroke="currentColor" />
      <path d="M15 15l4 4M19 15l-4 4" stroke="currentColor" />
    </svg>
  ),
  "relink-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" />
    </svg>
  ),
  "voiceover-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" stroke="currentColor" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" stroke="currentColor" />
    </svg>
  ),
  levanta: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" />
    </svg>
  ),
  pitchbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M22 2L11 13" stroke="currentColor" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" />
    </svg>
  ),
  "benable-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" stroke="currentColor" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" />
    </svg>
  ),
  "benable-like-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" />
      <path d="M9 11l1.5 1.5L15 9" stroke="currentColor" />
    </svg>
  ),
  "instagram-like-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" />
      <circle cx="18.5" cy="18.5" r="1.2" fill="currentColor" />
      <circle cx="5.5" cy="5.5" r="1.2" fill="currentColor" />
    </svg>
  ),
  "benable-comment-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" />
    </svg>
  ),
  "collab-butler": (p) => (
    <svg {...baseProps} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" />
    </svg>
  ),
  instagram: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M22 2L11 13" stroke="currentColor" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" />
    </svg>
  ),
  messengerbutler: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" />
    </svg>
  ),
  "close-friends-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" />
    </svg>
  ),
  "instagram-email": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" />
      <path d="M22 6l-10 7L2 6" stroke="currentColor" />
    </svg>
  ),
  "instagram-goldmine": (p) => (
    <svg {...baseProps} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  ),
  "api-integrations": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" />
    </svg>
  ),
  actionqueue: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" />
    </svg>
  ),
  "content-butler": (p) => (
    <svg {...baseProps} {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" />
    </svg>
  ),
  "black-friday": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" />
      <path d="M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4" stroke="currentColor" />
    </svg>
  ),
  "ads-goldmine-butler": (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 3v18h18" stroke="currentColor" />
      <path d="M7 14l4-4 4 4 5-5" stroke="currentColor" />
    </svg>
  ),
  "pinterest-butler": (p) => (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" />
      <path d="M12 7v10M9 14h6" stroke="currentColor" />
    </svg>
  ),
  "focus-mode": (p) => (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" />
    </svg>
  ),
};

const fallback: IconRenderer = (p) => (
  <svg {...baseProps} {...p}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" />
    <path d="M12 8v5M12 16h.01" stroke="currentColor" />
  </svg>
);

export function WorkspaceIcon({
  id,
  className,
  ...rest
}: { id: string } & SVGProps<SVGSVGElement>) {
  const render = icons[id] ?? fallback;
  return render({ className, "aria-hidden": true, ...rest });
}
