/**
 * Comp (free-code) discount parsing.
 *
 * We hand out 100%-off discount codes to comp certain users onto Pro for a
 * fixed window (3 months, 6 months, a year). The comp's duration is encoded in
 * the discount CODE (the code stored on orders.discount_code, resolved by the
 * webhook - the human-readable discount NAME is never stored). This module
 * reads that duration out of the code so the admin Comps page and the
 * comp-expiry cron can compute when to cancel the subscription.
 *
 * Going-forward convention: <NAME>FREE<N>M  e.g. CAREESEFREE3M, BRANDONFREE12M.
 * Uppercase, no hyphens (Lemon Squeezy rejects hyphenated codes). Legacy codes
 * (BRANDON3FREE, CHRISTINAONEYEARFREE) are parsed best-effort; anything that
 * does not parse returns null so the caller can flag it for a manual override
 * rather than guessing (and it is NEVER auto-cancelled on a guess).
 */

const MAX_MONTHS = 36;

// Spelled-out numbers we accept in legacy code names (ONE..TWELVE).
const WORD_NUM: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  ELEVEN: 11,
  TWELVE: 12,
};

/** Uppercase and strip everything that is not A-Z0-9 (matches LS code rules). */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clampMonths(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > MAX_MONTHS) return null;
  return rounded;
}

/**
 * Reads the free-comp duration (in months) out of a discount code, or null when
 * the code does not encode one. Only codes that mention FREE (or a spelled-out
 * MONTH/YEAR window) are treated as comps, so affiliate codes like COURTNEY or
 * AFFNEWBIE20 correctly return null.
 */
export function parseCompMonths(code: string | null | undefined): number | null {
  if (!code) return null;
  const c = normalize(code);
  if (!c) return null;

  const hasFree = c.includes("FREE");

  // 1) Preferred format: FREE<N>M / FREE<N>MO / FREE<N>MONTH(S)  -> N months.
  let m = c.match(/FREE(\d{1,2})M/);
  if (m) return clampMonths(Number(m[1]));

  // 2) FREE<N>Y / FREE<N>YR / FREE<N>YEAR(S)  -> N years.
  m = c.match(/FREE(\d{1,2})Y/);
  if (m) return clampMonths(Number(m[1]) * 12);

  // 3) Digit-before-unit, before FREE:  <N>MO FREE / <N>MONTHS FREE.
  m = c.match(/(\d{1,2})M[A-Z]*FREE/);
  if (m) return clampMonths(Number(m[1]));
  m = c.match(/(\d{1,2})Y[A-Z]*FREE/);
  if (m) return clampMonths(Number(m[1]) * 12);

  // 4) Legacy bare digit adjacent to FREE:  BRANDON3FREE / FREE3.
  if (hasFree) {
    m = c.match(/(\d{1,2})FREE/) ?? c.match(/FREE(\d{1,2})/);
    if (m) return clampMonths(Number(m[1]));
  }

  // 5) Spelled-out windows: (ONE..TWELVE)?(YEAR|MONTH)(S)  e.g. ONEYEARFREE,
  //    SIXMONTHSFREE, YEARFREE. Treated as a comp even without the FREE token
  //    when a full MONTH/YEAR window is spelled out.
  const word = c.match(/(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)?(YEAR|MONTH)/);
  if (word) {
    const count = word[1] ? WORD_NUM[word[1]] : 1;
    const months = word[2] === "YEAR" ? count * 12 : count;
    return clampMonths(months);
  }

  return null;
}

/**
 * Token appended to a synthetic comp code to mark a never-expiring ("forever")
 * grant, e.g. KAYFREEFOREVER. This is the explicit, self-documenting signal the
 * loader/cron use to tell a deliberate forever comp (months + expires_at both
 * null) apart from a legacy comp whose duration could not be parsed (also null).
 */
export const FOREVER_TOKEN = "FOREVER";

/** True when a comp code marks a never-expiring grant (carries FOREVER). */
export function isForeverCode(code: string | null | undefined): boolean {
  return /FOREVER/i.test(code ?? "");
}

/**
 * Best-effort recipient name from a code: the leading segment before FREE, the
 * first digit, or a spelled-out unit. CAREESEFREE3M -> "Careese",
 * CHRISTINAONEYEARFREE -> "Christina". Returns null if nothing sensible remains.
 */
export function compNameFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = normalize(code);
  if (!c) return null;
  const cut = c.search(
    /FREE|\d|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|YEAR|MONTH/,
  );
  const name = cut > 0 ? c.slice(0, cut) : cut === -1 ? c : "";
  if (name.length < 2) return null;
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/**
 * Adds `months` calendar months to an ISO timestamp, in UTC, and returns the
 * result as an ISO string. Overflowing day-of-month (e.g. Jan 31 + 1mo) clamps
 * to the last day of the target month, matching how a billing anniversary lands.
 */
export function addMonthsUtc(iso: string, months: number): string {
  const start = new Date(iso);
  const day = start.getUTCDate();
  const target = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + months,
      1,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
  // Last day of the target month, so we never roll into the following month.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}
