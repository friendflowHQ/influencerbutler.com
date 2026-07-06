// Curated locations for the seeded "demo" social-proof activity.
//
// While the site has no real traffic yet, the seed cron (see
// src/app/api/cron/seed-activity/route.ts) inserts soft "someone is checking
// this out" events from these places so the homepage widget does not sit empty.
// Heavily weighted to the United States, with a handful of UK and Australian
// locales mixed in so the feed looks international. Within each list we aim for
// roughly a 50/50 mix of well-known major cities and small/lesser-known towns,
// so the feed reads as real people rather than a list of the usual metros.
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

// ~40 US locations spread coast to coast, roughly half major metros and half
// small towns / lesser-known cities.
export const US_LOCATIONS: SeedLocation[] = [
  // Major metros
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
  { city: "Seattle", region: "WA", country: "US" },
  { city: "Denver", region: "CO", country: "US" },
  { city: "Nashville", region: "TN", country: "US" },
  { city: "Portland", region: "OR", country: "US" },
  { city: "Las Vegas", region: "NV", country: "US" },
  { city: "Atlanta", region: "GA", country: "US" },
  { city: "Miami", region: "FL", country: "US" },
  { city: "Boston", region: "MA", country: "US" },
  { city: "Minneapolis", region: "MN", country: "US" },
  // Small towns / lesser-known cities
  { city: "Kalispell", region: "MT", country: "US" },
  { city: "Sheboygan", region: "WI", country: "US" },
  { city: "Paducah", region: "KY", country: "US" },
  { city: "Bentonville", region: "AR", country: "US" },
  { city: "Coeur d'Alene", region: "ID", country: "US" },
  { city: "Corvallis", region: "OR", country: "US" },
  { city: "Marfa", region: "TX", country: "US" },
  { city: "Natchez", region: "MS", country: "US" },
  { city: "Galena", region: "IL", country: "US" },
  { city: "Stillwater", region: "OK", country: "US" },
  { city: "Bar Harbor", region: "ME", country: "US" },
  { city: "Taos", region: "NM", country: "US" },
  { city: "Ithaca", region: "NY", country: "US" },
  { city: "Traverse City", region: "MI", country: "US" },
  { city: "Dubuque", region: "IA", country: "US" },
  { city: "Cody", region: "WY", country: "US" },
  { city: "Astoria", region: "OR", country: "US" },
  { city: "Bemidji", region: "MN", country: "US" },
  { city: "Tupelo", region: "MS", country: "US" },
  { city: "Lawrence", region: "KS", country: "US" },
  // Additional major metros
  { city: "San Francisco", region: "CA", country: "US" },
  { city: "Washington", region: "DC", country: "US" },
  { city: "Columbus", region: "OH", country: "US" },
  { city: "Charlotte", region: "NC", country: "US" },
  { city: "Indianapolis", region: "IN", country: "US" },
  { city: "Jacksonville", region: "FL", country: "US" },
  { city: "Fort Worth", region: "TX", country: "US" },
  { city: "Detroit", region: "MI", country: "US" },
  { city: "Memphis", region: "TN", country: "US" },
  { city: "Baltimore", region: "MD", country: "US" },
  { city: "Milwaukee", region: "WI", country: "US" },
  { city: "Sacramento", region: "CA", country: "US" },
  { city: "Kansas City", region: "MO", country: "US" },
  { city: "Raleigh", region: "NC", country: "US" },
  { city: "Orlando", region: "FL", country: "US" },
  { city: "Tampa", region: "FL", country: "US" },
  { city: "Pittsburgh", region: "PA", country: "US" },
  { city: "Cincinnati", region: "OH", country: "US" },
  { city: "St. Louis", region: "MO", country: "US" },
  { city: "Cleveland", region: "OH", country: "US" },
  { city: "New Orleans", region: "LA", country: "US" },
  { city: "Salt Lake City", region: "UT", country: "US" },
  { city: "Oklahoma City", region: "OK", country: "US" },
  { city: "Louisville", region: "KY", country: "US" },
  { city: "Richmond", region: "VA", country: "US" },
  { city: "Buffalo", region: "NY", country: "US" },
  { city: "Albuquerque", region: "NM", country: "US" },
  { city: "Tucson", region: "AZ", country: "US" },
  { city: "Omaha", region: "NE", country: "US" },
  { city: "Providence", region: "RI", country: "US" },
  { city: "Fresno", region: "CA", country: "US" },
  { city: "Tulsa", region: "OK", country: "US" },
  { city: "Des Moines", region: "IA", country: "US" },
  { city: "Birmingham", region: "AL", country: "US" },
  { city: "Charleston", region: "SC", country: "US" },
  // Additional small towns / lesser-known cities
  { city: "Bozeman", region: "MT", country: "US" },
  { city: "Missoula", region: "MT", country: "US" },
  { city: "Sedona", region: "AZ", country: "US" },
  { city: "Flagstaff", region: "AZ", country: "US" },
  { city: "Bend", region: "OR", country: "US" },
  { city: "Bellingham", region: "WA", country: "US" },
  { city: "Walla Walla", region: "WA", country: "US" },
  { city: "Sandpoint", region: "ID", country: "US" },
  { city: "Jackson", region: "WY", country: "US" },
  { city: "Durango", region: "CO", country: "US" },
  { city: "Telluride", region: "CO", country: "US" },
  { city: "Santa Fe", region: "NM", country: "US" },
  { city: "Fayetteville", region: "AR", country: "US" },
  { city: "Oxford", region: "MS", country: "US" },
  { city: "Athens", region: "GA", country: "US" },
  { city: "Savannah", region: "GA", country: "US" },
  { city: "Asheville", region: "NC", country: "US" },
  { city: "Wilmington", region: "NC", country: "US" },
  { city: "Greenville", region: "SC", country: "US" },
  { city: "Chattanooga", region: "TN", country: "US" },
  { city: "Bloomington", region: "IN", country: "US" },
  { city: "Ann Arbor", region: "MI", country: "US" },
  { city: "Marquette", region: "MI", country: "US" },
  { city: "Eau Claire", region: "WI", country: "US" },
  { city: "Duluth", region: "MN", country: "US" },
  { city: "Rapid City", region: "SD", country: "US" },
  { city: "Sioux Falls", region: "SD", country: "US" },
  { city: "Grand Junction", region: "CO", country: "US" },
  { city: "Twin Falls", region: "ID", country: "US" },
  { city: "San Luis Obispo", region: "CA", country: "US" },
  { city: "Ojai", region: "CA", country: "US" },
  { city: "Carbondale", region: "IL", country: "US" },
  { city: "Saratoga Springs", region: "NY", country: "US" },
  { city: "Lancaster", region: "PA", country: "US" },
  { city: "Burlington", region: "VT", country: "US" },
];

// A handful of UK and Australian locales, again roughly half well-known cities
// and half smaller towns.
export const INTL_LOCATIONS: SeedLocation[] = [
  // United Kingdom
  { city: "London", region: null, country: "GB" },
  { city: "Manchester", region: null, country: "GB" },
  { city: "Edinburgh", region: null, country: "GB" },
  { city: "Bristol", region: null, country: "GB" },
  { city: "Glasgow", region: null, country: "GB" },
  { city: "Harrogate", region: null, country: "GB" },
  { city: "Whitby", region: null, country: "GB" },
  { city: "Frome", region: null, country: "GB" },
  { city: "Hebden Bridge", region: null, country: "GB" },
  { city: "Ludlow", region: null, country: "GB" },
  { city: "Tenby", region: null, country: "GB" },
  // Australia
  { city: "Sydney", region: null, country: "AU" },
  { city: "Melbourne", region: null, country: "AU" },
  { city: "Brisbane", region: null, country: "AU" },
  { city: "Perth", region: null, country: "AU" },
  { city: "Byron Bay", region: null, country: "AU" },
  { city: "Ballarat", region: null, country: "AU" },
  { city: "Margaret River", region: null, country: "AU" },
  // Additional UK
  { city: "Leeds", region: null, country: "GB" },
  { city: "Liverpool", region: null, country: "GB" },
  { city: "Cardiff", region: null, country: "GB" },
  { city: "Belfast", region: null, country: "GB" },
  { city: "Brighton", region: null, country: "GB" },
  { city: "Cambridge", region: null, country: "GB" },
  { city: "York", region: null, country: "GB" },
  { city: "Ilkley", region: null, country: "GB" },
  { city: "Bakewell", region: null, country: "GB" },
  { city: "St Ives", region: null, country: "GB" },
  { city: "Totnes", region: null, country: "GB" },
  { city: "Stroud", region: null, country: "GB" },
  { city: "Kirkwall", region: null, country: "GB" },
  { city: "Aberystwyth", region: null, country: "GB" },
  { city: "Hexham", region: null, country: "GB" },
  // Additional Australia
  { city: "Adelaide", region: null, country: "AU" },
  { city: "Canberra", region: null, country: "AU" },
  { city: "Gold Coast", region: null, country: "AU" },
  { city: "Hobart", region: null, country: "AU" },
  { city: "Darwin", region: null, country: "AU" },
  { city: "Wagga Wagga", region: null, country: "AU" },
  { city: "Toowoomba", region: null, country: "AU" },
  { city: "Bunbury", region: null, country: "AU" },
  { city: "Broome", region: null, country: "AU" },
  { city: "Bright", region: null, country: "AU" },
  { city: "Noosa", region: null, country: "AU" },
  { city: "Coffs Harbour", region: null, country: "AU" },
  { city: "Albany", region: null, country: "AU" },
  { city: "Mildura", region: null, country: "AU" },
  { city: "Esperance", region: null, country: "AU" },
  { city: "Bendigo", region: null, country: "AU" },
  { city: "Katoomba", region: null, country: "AU" },
  { city: "Port Douglas", region: null, country: "AU" },
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
