/**
 * Shared input parsing/validation for the admin event create + update routes.
 * Not a route module (only route.ts files are endpoints in the app router).
 */
import type { BannerSurface } from "@/lib/events";

export type EventBannerInput = {
  enabled: boolean;
  text: string | null;
  ctaLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  surfaces: BannerSurface[];
};

export type DateOption = { startMs: number; endMs: number };

export type EventInput = {
  title: string;
  description: string | null;
  dateOptions: DateOption[];
  timezone: string;
  recordEnabled: boolean;
  joinUrl: string | null;
  isPrivate: boolean;
  banner: EventBannerInput;
};

const VALID_SURFACES: BannerSurface[] = ["web", "extension", "desktop"];
const MAX_DATE_OPTIONS = 10;

function cleanSurfaces(value: unknown): BannerSurface[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<BannerSurface>();
  for (const v of value) {
    if (VALID_SURFACES.includes(v as BannerSurface)) out.add(v as BannerSurface);
  }
  return Array.from(out);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Parses the `dateOptions` array: one or more {startsAt, endsAt} pairs. */
function parseDateOptions(value: unknown): { ok: true; value: DateOption[] } | { ok: false; error: string } {
  const list = Array.isArray(value) ? value : [];
  if (list.length === 0) return { ok: false, error: "Add at least one date and time." };
  if (list.length > MAX_DATE_OPTIONS) {
    return { ok: false, error: `Add at most ${MAX_DATE_OPTIONS} time options.` };
  }
  const out: DateOption[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = (list[i] && typeof list[i] === "object" ? list[i] : {}) as Record<string, unknown>;
    const startMs = Date.parse(String(item.startsAt ?? ""));
    const endMs = Date.parse(String(item.endsAt ?? ""));
    const n = i + 1;
    if (!Number.isFinite(startMs)) return { ok: false, error: `Start time is invalid for option ${n}.` };
    if (!Number.isFinite(endMs)) return { ok: false, error: `End time is invalid for option ${n}.` };
    if (endMs <= startMs) {
      return { ok: false, error: `End time must be after the start time for option ${n}.` };
    }
    out.push({ startMs, endMs });
  }
  return { ok: true, value: out };
}

export function parseEventInput(
  raw: unknown,
): { ok: true; value: EventInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim().slice(0, 300) : "";
  if (!title) return { ok: false, error: "Title is required." };

  const dateOptionsResult = parseDateOptions(b.dateOptions);
  if (!dateOptionsResult.ok) return dateOptionsResult;
  const dateOptions = dateOptionsResult.value;

  const description = typeof b.description === "string" ? b.description.trim().slice(0, 5000) || null : null;
  const timezone = typeof b.timezone === "string" && b.timezone.trim() ? b.timezone.trim().slice(0, 64) : "America/Denver";
  const recordEnabled = b.recordEnabled !== false;
  const joinUrl = typeof b.joinUrl === "string" && b.joinUrl.trim() ? b.joinUrl.trim().slice(0, 2000) : null;
  const isPrivate = b.isPrivate === true;

  const rawBanner = (b.banner && typeof b.banner === "object" ? b.banner : {}) as Record<string, unknown>;
  const banner: EventBannerInput = {
    // A private event never reaches the cross-app banner feed, regardless of
    // what the client submitted - defense in depth behind the form hiding it.
    enabled: !isPrivate && rawBanner.enabled === true,
    text: typeof rawBanner.text === "string" ? rawBanner.text.trim().slice(0, 280) || null : null,
    ctaLabel: typeof rawBanner.ctaLabel === "string" ? rawBanner.ctaLabel.trim().slice(0, 40) || null : null,
    startsAt: isoOrNull(rawBanner.startsAt),
    endsAt: isoOrNull(rawBanner.endsAt),
    surfaces: cleanSurfaces(rawBanner.surfaces),
  };
  if (banner.surfaces.length === 0) banner.surfaces = [...VALID_SURFACES];

  return {
    ok: true,
    value: { title, description, dateOptions, timezone, recordEnabled, joinUrl, isPrivate, banner },
  };
}
