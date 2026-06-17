"use client";

// Share bar for blog posts: Pinterest, X, Facebook, Reddit, WhatsApp, Email, and
// a Copy link button. Pinterest is first because it is the highest-value channel
// for this audience. Modeled on the affiliate SocialShareButtons component (same
// window.open pattern + Tailwind styling), but blog-specific: it builds a
// Pinterest-optimized pin description and has no affiliate copy. No SDKs.

import { useState } from "react";
import { buildPinDescription } from "@/lib/pinterest";

type Props = {
  url: string;
  title: string;
  summary: string;
  image: string; // absolute URL, or "" when the post has no image
  keywords?: string;
};

function openShare(shareUrl: string) {
  if (typeof window !== "undefined") {
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=600");
  }
}

export default function BlogShareButtons({
  url,
  title,
  summary,
  image,
  keywords = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const pinDescription = buildPinDescription(title, summary, keywords);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  const buttons = [
    image
      ? {
          name: "Pinterest",
          bg: "bg-[#E60023] hover:bg-[#c5001e]",
          onClick: () =>
            openShare(
              `https://www.pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodeURIComponent(
                image,
              )}&description=${encodeURIComponent(pinDescription)}`,
            ),
          icon: (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M12 0C5.373 0 0 5.372 0 12c0 4.99 3.046 9.268 7.382 11.073-.102-.94-.194-2.387.04-3.415.211-.93 1.363-5.92 1.363-5.92s-.348-.696-.348-1.724c0-1.614.936-2.819 2.101-2.819.99 0 1.469.744 1.469 1.636 0 .996-.634 2.487-.961 3.868-.273 1.156.58 2.099 1.72 2.099 2.066 0 3.655-2.178 3.655-5.323 0-2.783-2-4.73-4.854-4.73-3.307 0-5.247 2.48-5.247 5.044 0 .999.385 2.07.864 2.652a.348.348 0 0 1 .081.334c-.088.366-.284 1.156-.323 1.318-.051.213-.167.258-.385.156-1.438-.67-2.337-2.773-2.337-4.462 0-3.633 2.64-6.97 7.612-6.97 3.995 0 7.1 2.847 7.1 6.652 0 3.969-2.503 7.165-5.976 7.165-1.167 0-2.265-.607-2.64-1.323l-.718 2.737c-.26 1-.96 2.254-1.43 3.018A12 12 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
            </svg>
          ),
        }
      : null,
    {
      name: "X",
      bg: "bg-slate-900 hover:bg-slate-800",
      onClick: () =>
        openShare(
          `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
        ),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      name: "Facebook",
      bg: "bg-[#1877F2] hover:bg-[#0d6ad8]",
      onClick: () =>
        openShare(
          `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        ),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12z" />
        </svg>
      ),
    },
    {
      name: "Reddit",
      bg: "bg-[#FF4500] hover:bg-[#e03d00]",
      onClick: () =>
        openShare(
          `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
        ),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.01 4.744a1.535 1.535 0 1 1 .005 3.07h-.005a1.535 1.535 0 0 1 0-3.07zM6.05 14.62c-.85 0-1.54-.69-1.54-1.54s.69-1.54 1.54-1.54 1.54.69 1.54 1.54-.69 1.54-1.54 1.54zm6.91 4.13c-1.5 0-2.71-.69-2.71-.69-.13-.13-.13-.32 0-.45.13-.13.32-.13.45 0 0 0 1.02.57 2.26.57 1.24 0 2.26-.57 2.26-.57.13-.13.32-.13.45 0 .13.13.13.32 0 .45 0 0-1.21.69-2.71.69zm-1.54-9.32c.51 0 .92.41.92.92s-.41.92-.92.92-.92-.41-.92-.92.41-.92.92-.92zm6.53 5.19c-.85 0-1.54-.69-1.54-1.54s.69-1.54 1.54-1.54 1.54.69 1.54 1.54-.69 1.54-1.54 1.54z" />
        </svg>
      ),
    },
    {
      name: "WhatsApp",
      bg: "bg-[#25D366] hover:bg-[#1ebd5a]",
      onClick: () =>
        openShare(
          `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
        ),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
        </svg>
      ),
    },
    {
      name: "Email",
      bg: "bg-slate-600 hover:bg-slate-700",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.location.href = `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
            `${summary ? `${summary}\n\n` : ""}${url}`,
          )}`;
        }
      },
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      ),
    },
  ].filter(Boolean) as {
    name: string;
    bg: string;
    onClick: () => void;
    icon: React.ReactNode;
  }[];

  return (
    <div className="mt-12 border-t border-slate-200 pt-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Share this post
      </p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={b.onClick}
            className={`inline-flex items-center gap-1.5 rounded-lg ${b.bg} px-3 py-2 text-xs font-semibold text-white shadow-sm transition`}
            aria-label={`Share on ${b.name}`}
          >
            {b.icon}
            <span>{b.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Copy link"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </svg>
          <span>{copied ? "Copied!" : "Copy link"}</span>
        </button>
      </div>
    </div>
  );
}
