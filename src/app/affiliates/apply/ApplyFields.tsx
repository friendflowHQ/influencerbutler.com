"use client";

import type { ReactNode } from "react";

/**
 * Shared pieces of the affiliate application, used by the public /affiliates/apply
 * page and the signed-in dashboard form so the two never drift apart: structured
 * audience inputs (platform chips, size and niche pick-lists), URL / handle
 * normalising, and the labelled Field wrapper.
 */

export type SocialHandles = {
  instagram: string;
  tiktok: string;
  youtube: string;
  x: string;
  amazonStorefront: string;
};

export type PlatformKey = keyof SocialHandles;

export const PLATFORMS: { key: PlatformKey; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { key: "tiktok", label: "TikTok", placeholder: "@yourhandle" },
  { key: "youtube", label: "YouTube", placeholder: "Channel name or link" },
  { key: "x", label: "X / Twitter", placeholder: "@yourhandle" },
  { key: "amazonStorefront", label: "Amazon storefront", placeholder: "Storefront link or ID" },
];

export const EMPTY_SOCIALS: SocialHandles = {
  instagram: "",
  tiktok: "",
  youtube: "",
  x: "",
  amazonStorefront: "",
};

export const AUDIENCE_SIZES = [
  "Just starting out (under 1k)",
  "1k - 10k",
  "10k - 50k",
  "50k - 250k",
  "250k+",
];

export const OTHER_NICHE = "Other";
export const NICHES = [
  "Amazon influencer",
  "Content creator or lifestyle",
  "Deals and coupons",
  "Affiliate marketing or side-hustle education",
  "Tech and software reviews",
  "Agency or consultant",
  OTHER_NICHE,
];

export type AudienceValue = {
  website: string;
  audienceSize: string;
  niche: string;
  nicheOther: string;
  platforms: PlatformKey[];
  socials: SocialHandles;
};

export const EMPTY_AUDIENCE: AudienceValue = {
  website: "",
  audienceSize: "",
  niche: "",
  nicheOther: "",
  platforms: [],
  socials: EMPTY_SOCIALS,
};

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20";
export const inputErrorClass = "border-red-500 focus:border-red-500 focus:ring-red-500/20";

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Accepts "instagram.com/me" or "me.com" and returns "https://...". Empty in, empty out. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(normalizeUrl(value));
    return url.hostname.includes(".") && !/\s/.test(value.trim());
  } catch {
    return false;
  }
}

export function resolveNiche(v: AudienceValue): string {
  return v.niche === OTHER_NICHE ? v.nicheOther.trim() || OTHER_NICHE : v.niche;
}

/** Only handles for the platforms the applicant actually ticked. */
export function sanitizeSocials(v: AudienceValue): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of v.platforms) {
    const trimmed = v.socials[key].trim();
    if (trimmed.length > 0) out[key] = trimmed.slice(0, 200);
  }
  return out;
}

export function Field({
  label,
  required,
  optional,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  /** Renders a quiet "(optional)" tag so people know they can skip it. */
  optional?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  // Wrapping the control inside the <label> gives every field an accessible name.
  return (
    <div>
      <label className="block">
        <span className="block text-sm font-medium text-slate-700">
          {label}
          {required ? (
            <span className="ml-1 text-[#c2410c]" aria-hidden="true">
              *
            </span>
          ) : null}
          {optional ? <span className="ml-1.5 text-xs font-normal text-slate-500">(optional)</span> : null}
        </span>
        {children}
      </label>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function AudienceFields({
  value,
  onChange,
  errors = {},
}: {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  errors?: { website?: string | null };
}) {
  const patch = (p: Partial<AudienceValue>) => onChange({ ...value, ...p });

  const togglePlatform = (key: PlatformKey) => {
    const on = value.platforms.includes(key);
    patch({
      platforms: on ? value.platforms.filter((k) => k !== key) : [...value.platforms, key],
      // Unticking a platform drops its handle so stale text is never submitted.
      socials: on ? { ...value.socials, [key]: "" } : value.socials,
    });
  };

  return (
    <div className="space-y-4">
      <Field
        label="Website or main channel"
        optional
        hint="Your best link for us to look at: a site, a channel, or a profile. Helps us approve you faster."
        error={errors.website}
      >
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yoursite.com or instagram.com/you"
          value={value.website}
          onChange={(e) => patch({ website: e.target.value })}
          onBlur={() => patch({ website: normalizeUrl(value.website) })}
          aria-invalid={errors.website ? true : undefined}
          className={`${inputClass} ${errors.website ? inputErrorClass : ""}`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total audience size" optional hint="Add up all your channels.">
          <select
            value={value.audienceSize}
            onChange={(e) => patch({ audienceSize: e.target.value })}
            className={inputClass}
          >
            <option value="">Choose a range</option>
            {AUDIENCE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Niche" optional hint="What your audience comes to you for.">
          <select value={value.niche} onChange={(e) => patch({ niche: e.target.value })} className={inputClass}>
            <option value="">Choose one</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {value.niche === OTHER_NICHE ? (
        <Field label="Tell us your niche">
          <input
            value={value.nicheOther}
            onChange={(e) => patch({ nicheOther: e.target.value })}
            maxLength={80}
            className={inputClass}
          />
        </Field>
      ) : null}

      <div>
        <p id="platform-chips-label" className="text-sm font-medium text-slate-700">
          Where do you post? <span className="ml-1 text-xs font-normal text-slate-500">(optional)</span>
        </p>
        <div role="group" aria-labelledby="platform-chips-label" className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = value.platforms.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlatform(p.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-1 ${
                  on
                    ? "border-[#c2410c] bg-[#c2410c] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-[#c2410c] hover:text-[#c2410c]"
                }`}
              >
                {on ? "✓ " : "+ "}
                {p.label}
              </button>
            );
          })}
        </div>
        {value.platforms.length > 0 ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {PLATFORMS.filter((p) => value.platforms.includes(p.key)).map((p) => (
              <Field key={p.key} label={`${p.label} handle or link`}>
                <input
                  placeholder={p.placeholder}
                  value={value.socials[p.key]}
                  onChange={(e) => patch({ socials: { ...value.socials, [p.key]: e.target.value } })}
                  maxLength={200}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
