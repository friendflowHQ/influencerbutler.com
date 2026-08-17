/**
 * Summary: Publish-date slot allocation for the autopilot. Builds a per-day
 *   occupancy map from the manifest's scheduled posts (the existing drip) and
 *   the queue's live items, then walks topics forward respecting cadence and
 *   maxPerDay so autopilot posts never collide with hand-scheduled content.
 *   Parked posts (date >= 2027-01-01) never count as occupied. Pure functions.
 */
import type { BlogManifestEntry } from "@/lib/blog";
import type { AutogenQueue, QueueItem } from "./types";

const PARK_DATE = "2027-01-01";
const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Days with published-in-the-future content, from manifest + queue. */
export function buildOccupancy(
  manifestPosts: Pick<BlogManifestEntry, "date">[],
  queueItems: QueueItem[],
  today: string,
): Map<string, number> {
  const occupancy = new Map<string, number>();
  const bump = (date: string) => occupancy.set(date, (occupancy.get(date) ?? 0) + 1);
  for (const post of manifestPosts) {
    if (post.date && post.date > today && post.date < PARK_DATE) bump(post.date);
  }
  for (const item of queueItems) {
    if (
      (item.status === "queued" || item.status === "generated") &&
      item.publishDate > today &&
      item.publishDate < PARK_DATE
    ) {
      bump(item.publishDate);
    }
  }
  return occupancy;
}

export type SlotOptions = {
  startDate?: string;
  cadenceDays: number;
  maxPerDay: number;
  leadDays: number;
};

export type AllocatedTopic<T> = T & { publishDate: string; generateOn: string };

/**
 * Assign publishDate/generateOn to each topic in order. Mutates nothing;
 * returns new objects. Also bumps a local occupancy copy so topics within the
 * batch respect maxPerDay against each other.
 */
export function allocateSlots<T>(
  topics: T[],
  options: SlotOptions,
  manifestPosts: Pick<BlogManifestEntry, "date">[],
  queue: AutogenQueue,
  today = todayISO(),
): AllocatedTopic<T>[] {
  const occupancy = buildOccupancy(manifestPosts, queue.items, today);
  const maxPerDay = Math.max(1, options.maxPerDay);
  const cadence = Math.max(1, options.cadenceDays);
  // Earliest slot leaves room for the generation lead so day one is generable.
  const earliest = addDays(today, Math.max(1, options.leadDays + 1));
  let cursor =
    options.startDate && options.startDate > earliest ? options.startDate : earliest;

  return topics.map((topic) => {
    let date = cursor;
    let guard = 0;
    while ((occupancy.get(date) ?? 0) >= maxPerDay && guard < 3650) {
      date = addDays(date, 1);
      guard++;
    }
    occupancy.set(date, (occupancy.get(date) ?? 0) + 1);
    cursor = addDays(date, cadence);
    const generateOn = addDays(date, -options.leadDays);
    return {
      ...topic,
      publishDate: date,
      generateOn: generateOn < today ? today : generateOn,
    };
  });
}

/** True when the given date still has room (used when rescheduling one item). */
export function dateHasRoom(
  date: string,
  maxPerDay: number,
  manifestPosts: Pick<BlogManifestEntry, "date">[],
  queue: AutogenQueue,
  excludeItemId?: string,
  today = todayISO(),
): boolean {
  const items = excludeItemId
    ? queue.items.filter((i) => i.id !== excludeItemId)
    : queue.items;
  const occupancy = buildOccupancy(manifestPosts, items, today);
  return (occupancy.get(date) ?? 0) < Math.max(1, maxPerDay);
}
