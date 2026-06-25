// Curated locations for the seeded "demo" social-proof activity.
//
// While the site has no real traffic yet, the seed cron (see
// src/app/api/cron/seed-activity/route.ts) inserts soft "someone is checking
// this out" events from these places so the homepage widget does not sit empty.
// Heavily weighted to the United States, with a handful of French- and
// Spanish-speaking locales mixed in so the feed looks international.
//
// Shape matches the city/region/country columns on activity_events. region is
// only meaningful for US rows (it maps to a state code, like the real Vercel
// geo header); for international rows we leave region null and the widget falls
// back to "City, Country".

export type SeedLocation = {
  city: string;
  region: string | null;
  country: string;
};

// ~40 US cities spread coast to coast.
export const US_LOCATIONS: SeedLocation[] = [
  { city: "New York", region: "NY", country: "US" },
  { city: "Los Angeles", region: "CA", country: "US" },
  { city: "Chicago", region: "IL", country: "US" },
  { city: "Houston", region: "TX", country: "US" },
  { city: "Phoenix", region: "AZ", country: "US" },
  { city: "Philadelphia", region: "PA", country: "US" },
  { city: "San Antonio", region: "TX", country: "US" },
  { city: "San Diego", region: "CA", country: "US" },
  { city: "Dallas", region: "TX", country: "US" },
  { city: "Austin", region: "TX", country: "US" },
  { city: "San Jose", region: "CA", country: "US" },
  { city: "Jacksonville", region: "FL", country: "US" },
  { city: "Columbus", region: "OH", country: "US" },
  { city: "Charlotte", region: "NC", country: "US" },
  { city: "Indianapolis", region: "IN", country: "US" },
  { city: "Seattle", region: "WA", country: "US" },
  { city: "Denver", region: "CO", country: "US" },
  { city: "Nashville", region: "TN", country: "US" },
  { city: "Portland", region: "OR", country: "US" },
  { city: "Las Vegas", region: "NV", country: "US" },
  { city: "Atlanta", region: "GA", country: "US" },
  { city: "Miami", region: "FL", country: "US" },
  { city: "Orlando", region: "FL", country: "US" },
  { city: "Tampa", region: "FL", country: "US" },
  { city: "Minneapolis", region: "MN", country: "US" },
  { city: "Kansas City", region: "MO", country: "US" },
  { city: "Sacramento", region: "CA", country: "US" },
  { city: "Salt Lake City", region: "UT", country: "US" },
  { city: "Raleigh", region: "NC", country: "US" },
  { city: "Boston", region: "MA", country: "US" },
  { city: "Pittsburgh", region: "PA", country: "US" },
  { city: "Cincinnati", region: "OH", country: "US" },
  { city: "St. Louis", region: "MO", country: "US" },
  { city: "Detroit", region: "MI", country: "US" },
  { city: "Boise", region: "ID", country: "US" },
  { city: "Scottsdale", region: "AZ", country: "US" },
  { city: "Fort Worth", region: "TX", country: "US" },
  { city: "Brooklyn", region: "NY", country: "US" },
  { city: "Savannah", region: "GA", country: "US" },
  { city: "Asheville", region: "NC", country: "US" },
];

// A handful of French- and Spanish-speaking locales.
export const INTL_LOCATIONS: SeedLocation[] = [
  { city: "Paris", region: null, country: "FR" },
  { city: "Lyon", region: null, country: "FR" },
  { city: "Marseille", region: null, country: "FR" },
  { city: "Montreal", region: null, country: "CA" },
  { city: "Quebec City", region: null, country: "CA" },
  { city: "Madrid", region: null, country: "ES" },
  { city: "Barcelona", region: null, country: "ES" },
  { city: "Valencia", region: null, country: "ES" },
  { city: "Mexico City", region: null, country: "MX" },
  { city: "Guadalajara", region: null, country: "MX" },
  { city: "Monterrey", region: null, country: "MX" },
  { city: "Buenos Aires", region: null, country: "AR" },
];

/**
 * Picks a random seed location, weighted ~80% US / ~20% international, so the
 * feed reads as mostly-domestic with a sprinkle of other countries.
 */
export function randomSeedLocation(): SeedLocation {
  const pool = Math.random() < 0.8 ? US_LOCATIONS : INTL_LOCATIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// --------------------------------------------------------------------------
// Pre-scheduled demo-activity queue
//
// Instead of deciding each seeded event at fire time, we keep a rolling queue
// of upcoming events (a planned time + location each) so the admin can see what
// is coming. The cron fires the earliest due item, then tops the queue back up.
// The queue lives in app_config 'activity_seed_queue' (see recent-activity.ts).
// --------------------------------------------------------------------------

export type SeedQueueItem = {
  at: string; // ISO timestamp the event should fire
  city: string;
  region: string | null;
  country: string;
};

const MIN_GAP_MINUTES = 10;
const MAX_GAP_MINUTES = 70;
// Skip the overnight US window when scheduling (08:00-12:59 UTC is roughly
// 1am-7am Eastern / 10pm-4am Pacific), so the feed is quiet at those hours.
const QUIET_UTC_START = 8;
const QUIET_UTC_END = 13; // exclusive
// Drop never-fired items older than this (e.g. left over from a paused period)
// so re-enabling does not fire a stale backlog all at once.
const STALE_GRACE_MS = 90 * 60 * 1000;

function inQuietHours(d: Date): boolean {
  const h = d.getUTCHours();
  return h >= QUIET_UTC_START && h < QUIET_UTC_END;
}

/** If a time lands in the overnight window, bump it to just after the window opens. */
function skipQuietHours(d: Date): Date {
  if (!inQuietHours(d)) return d;
  const out = new Date(d);
  out.setUTCHours(QUIET_UTC_END, Math.floor(Math.random() * 15), 0, 0);
  return out;
}

function nextTimeAfter(prev: Date): Date {
  const gap = MIN_GAP_MINUTES + Math.floor(Math.random() * (MAX_GAP_MINUTES - MIN_GAP_MINUTES + 1));
  return skipQuietHours(new Date(prev.getTime() + gap * 60_000));
}

/**
 * Cleans and refills the queue: drops stale past items, then ensures at least
 * `target` future items exist (spaced 10-70 min apart, overnight skipped, each
 * with a random location). Due items (at <= now, still fresh) are kept so the
 * cron can fire them. Pure: returns a new sorted array, does not fire anything.
 */
export function topUpSeedQueue(
  items: SeedQueueItem[],
  nowMs: number,
  target: number,
): SeedQueueItem[] {
  const cleaned = items
    .filter((it) => {
      const t = new Date(it.at).getTime();
      return Number.isFinite(t) && t >= nowMs - STALE_GRACE_MS;
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  let last =
    cleaned.length > 0
      ? new Date(Math.max(new Date(cleaned[cleaned.length - 1].at).getTime(), nowMs))
      : new Date(nowMs);

  let futureCount = cleaned.filter((it) => new Date(it.at).getTime() > nowMs).length;
  while (futureCount < target) {
    const t = nextTimeAfter(last);
    const loc = randomSeedLocation();
    cleaned.push({ at: t.toISOString(), city: loc.city, region: loc.region, country: loc.country });
    last = t;
    futureCount += 1;
  }

  return cleaned.sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** How many future items to keep scheduled ahead at any time. */
export const SEED_QUEUE_TARGET = 24;
