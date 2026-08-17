/**
 * Summary: Load/serialize the autopilot queue file (content/blog/_queue.json).
 *   The queue is committed to the repo through lib/github-content like every
 *   other blog change: small, single-logical-writer, versioned for free, and
 *   it lets a generated post and its queue-status update land in ONE atomic
 *   commit. The blog loader never reads this file (it only reads _index.json
 *   and *.mdx), so it is invisible to the public site.
 * Dependencies: lib/github-content.
 */
import { getTextFile } from "@/lib/github-content";
import type { AutogenQueue, AutogenSettings, Campaign, QueueItem } from "./types";

export const QUEUE_PATH = "content/blog/_queue.json";

export const DEFAULT_SETTINGS: AutogenSettings = {
  leadDays: 2,
  maxPerRun: 2,
  maxPerDay: 1,
  maxAttempts: 3,
  notify: true,
};

export function emptyQueue(): AutogenQueue {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, campaigns: [], items: [] };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse + validate the queue file. Throws with a descriptive message on a
 * corrupt file (the cron emails the error rather than silently no-oping).
 * A missing file is fine: returns the empty default.
 */
export async function loadQueue(): Promise<AutogenQueue> {
  const file = await getTextFile(QUEUE_PATH);
  if (!file) return emptyQueue();

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch (err) {
    throw new Error(`${QUEUE_PATH} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isRecord(parsed)) throw new Error(`${QUEUE_PATH} must be a JSON object`);

  const settings: AutogenSettings = { ...DEFAULT_SETTINGS };
  if (isRecord(parsed.settings)) {
    for (const key of ["leadDays", "maxPerRun", "maxPerDay", "maxAttempts"] as const) {
      const value = parsed.settings[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        settings[key] = Math.floor(value);
      }
    }
    if (typeof parsed.settings.notify === "boolean") settings.notify = parsed.settings.notify;
  }

  const campaigns: Campaign[] = [];
  if (Array.isArray(parsed.campaigns)) {
    for (const raw of parsed.campaigns) {
      if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.theme !== "string") {
        throw new Error(`${QUEUE_PATH}: campaign entry missing id/theme`);
      }
      campaigns.push({
        id: raw.id,
        theme: raw.theme,
        notes: typeof raw.notes === "string" ? raw.notes : undefined,
        cadenceDays:
          typeof raw.cadenceDays === "number" && raw.cadenceDays >= 1
            ? Math.floor(raw.cadenceDays)
            : 7,
        categoryMix: Array.isArray(raw.categoryMix)
          ? raw.categoryMix.filter((c): c is string => typeof c === "string")
          : [],
        status:
          raw.status === "completed" || raw.status === "cancelled" ? raw.status : "active",
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
        createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
      });
    }
  }

  const items: QueueItem[] = [];
  if (Array.isArray(parsed.items)) {
    for (const raw of parsed.items) {
      if (
        !isRecord(raw) ||
        typeof raw.id !== "string" ||
        typeof raw.slug !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.publishDate !== "string" ||
        !DATE_RE.test(raw.publishDate)
      ) {
        throw new Error(`${QUEUE_PATH}: item entry missing id/slug/title/publishDate`);
      }
      items.push({
        id: raw.id,
        campaignId: typeof raw.campaignId === "string" ? raw.campaignId : undefined,
        slug: raw.slug,
        title: raw.title,
        summary: typeof raw.summary === "string" ? raw.summary : "",
        keywords: typeof raw.keywords === "string" ? raw.keywords : "",
        category: typeof raw.category === "string" ? raw.category : "Growth",
        publishDate: raw.publishDate,
        generateOn:
          typeof raw.generateOn === "string" && DATE_RE.test(raw.generateOn)
            ? raw.generateOn
            : raw.publishDate,
        brief: typeof raw.brief === "string" ? raw.brief : undefined,
        researchUrls: Array.isArray(raw.researchUrls)
          ? raw.researchUrls.filter((u): u is string => typeof u === "string").slice(0, 3)
          : undefined,
        status:
          raw.status === "generated" || raw.status === "failed" || raw.status === "cancelled"
            ? raw.status
            : "queued",
        attempts: typeof raw.attempts === "number" ? Math.max(0, Math.floor(raw.attempts)) : 0,
        lastError: typeof raw.lastError === "string" ? raw.lastError : null,
        generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      });
    }
  }

  return { version: typeof parsed.version === "number" ? parsed.version : 1, settings, campaigns, items };
}

// Stable key order so queue commits produce minimal diffs.
export function serializeQueue(queue: AutogenQueue): string {
  const ordered = {
    version: queue.version,
    settings: {
      leadDays: queue.settings.leadDays,
      maxPerRun: queue.settings.maxPerRun,
      maxPerDay: queue.settings.maxPerDay,
      maxAttempts: queue.settings.maxAttempts,
      notify: queue.settings.notify,
    },
    campaigns: queue.campaigns.map((c) => ({
      id: c.id,
      theme: c.theme,
      ...(c.notes ? { notes: c.notes } : {}),
      cadenceDays: c.cadenceDays,
      categoryMix: c.categoryMix,
      status: c.status,
      createdAt: c.createdAt,
      createdBy: c.createdBy,
    })),
    items: queue.items.map((i) => ({
      id: i.id,
      ...(i.campaignId ? { campaignId: i.campaignId } : {}),
      slug: i.slug,
      title: i.title,
      summary: i.summary,
      keywords: i.keywords,
      category: i.category,
      publishDate: i.publishDate,
      generateOn: i.generateOn,
      ...(i.brief ? { brief: i.brief } : {}),
      ...(i.researchUrls?.length ? { researchUrls: i.researchUrls } : {}),
      status: i.status,
      attempts: i.attempts,
      lastError: i.lastError,
      generatedAt: i.generatedAt,
      createdAt: i.createdAt,
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Campaigns whose items are all terminal flip to completed. Returns true if changed. */
export function autoCompleteCampaigns(queue: AutogenQueue): boolean {
  let changed = false;
  for (const campaign of queue.campaigns) {
    if (campaign.status !== "active") continue;
    const items = queue.items.filter((i) => i.campaignId === campaign.id);
    if (items.length > 0 && items.every((i) => i.status !== "queued")) {
      campaign.status = "completed";
      changed = true;
    }
  }
  return changed;
}
