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

export type EventInput = {
  title: string;
  description: string | null;
  startMs: number;
  endMs: number;
  timezone: string;
  recordEnabled: boolean;
  joinUrl: string | null;
  banner: EventBannerInput;
};

const VALID_SURFACES: BannerSurface[] = ["web", "extension", "desktop"];

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

export function parseEventInput(
  raw: unknown,
): { ok: true; value: EventInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim().slice(0, 300) : "";
  if (!title) return { ok: false, error: "Title is required." };

  const startMs = Date.parse(String(b.startsAt ?? ""));
  const endMs = Date.parse(String(b.endsAt ?? ""));
  if (!Number.isFinite(startMs)) return { ok: false, error: "Start time is invalid." };
  if (!Number.isFinite(endMs)) return { ok: false, error: "End time is invalid." };
  if (endMs <= startMs) return { ok: false, error: "End time must be after the start time." };

  const description = typeof b.description === "string" ? b.description.trim().slice(0, 5000) || null : null;
  const timezone = typeof b.timezone === "string" && b.timezone.trim() ? b.timezone.trim().slice(0, 64) : "America/Denver";
  const recordEnabled = b.recordEnabled !== false;
  const joinUrl = typeof b.joinUrl === "string" && b.joinUrl.trim() ? b.joinUrl.trim().slice(0, 2000) : null;

  const rawBanner = (b.banner && typeof b.banner === "object" ? b.banner : {}) as Record<string, unknown>;
  const banner: EventBannerInput = {
    enabled: rawBanner.enabled === true,
    text: typeof rawBanner.text === "string" ? rawBanner.text.trim().slice(0, 280) || null : null,
    ctaLabel: typeof rawBanner.ctaLabel === "string" ? rawBanner.ctaLabel.trim().slice(0, 40) || null : null,
    startsAt: isoOrNull(rawBanner.startsAt),
    endsAt: isoOrNull(rawBanner.endsAt),
    surfaces: cleanSurfaces(rawBanner.surfaces),
  };
  if (banner.surfaces.length === 0) banner.surfaces = [...VALID_SURFACES];

  return {
    ok: true,
    value: { title, description, startMs, endMs, timezone, recordEnabled, joinUrl, banner },
  };
}
