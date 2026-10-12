// Date labels for the older-conversations list, matching what Amazon prints on its
// own drawer rows: "3 days ago" for the last week, then a numeric date
// ("10/05/2026"). Pure so it is unit-tested; the words come from the caller so
// the catalog owns them.

const DAY_MS = 24 * 60 * 60 * 1000;

export type WhenWords = {
  today: string;
  yesterday: string;
  daysAgo: (n: number) => string;
};

export function formatWhen(ms: number, now: number, locale: string, words: WhenWords): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const days = Math.floor((now - ms) / DAY_MS);
  if (days < 1) return words.today;
  if (days === 1) return words.yesterday;
  if (days < 7) return words.daysAgo(days);
  return numericDate(ms, locale);
}

export function numericDate(ms: number, locale: string): string {
  try {
    return new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return "";
  }
}

// "2 min ago" / "1 hour ago" for the sync line; empty for an unknown time.
export function formatAgo(ms: number, now: number, words: { justNow: string; minAgo: (n: number) => string; hoursAgo: (n: number) => string }, locale: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return words.justNow;
  if (minutes < 60) return words.minAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.hoursAgo(hours);
  return numericDate(ms, locale);
}
