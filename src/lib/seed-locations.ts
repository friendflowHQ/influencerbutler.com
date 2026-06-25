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
