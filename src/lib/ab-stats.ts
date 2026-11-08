// Pure statistics for the Funnels v2 A/B engine (no imports, safe anywhere).
//
// One primary metric per test (click for early steps, paid or activation for
// later ones), with the other metric as a guardrail only. Looks happen once
// both arms have the minimum matured sends, then weekly, at most MAX_LOOKS
// times, each at the Pocock per-look alpha so the overall false-positive rate
// across all looks stays at 5% (95% confidence).

export type AbMetric = "click" | "paid" | "activation";
export type AbArmKey = "a" | "b";

/** Successes (x) out of matured sends (n) for one metric of one arm. */
export type MetricCount = { n: number; x: number };

export type ArmStats = {
  arm: AbArmKey;
  /** Every logged send in the test window (matured or not). */
  sent: number;
  /** Per metric: only sends old enough for that metric to have happened.
   * null = the metric could not be read (missing migration / column). */
  metrics: Record<AbMetric, MetricCount | null>;
};

/** Max sequential looks per experiment. */
export const MAX_LOOKS = 4;
/** Pocock per-look two-sided alpha for 4 equally spaced looks at overall 0.05. */
export const POCOCK_ALPHA_4 = 0.0182;
/** One-sided 5% critical value for the guardrail ("significantly worse"). */
export const GUARDRAIL_Z = -1.645;
/** Days between looks. */
export const LOOK_INTERVAL_DAYS = 7;
/** Hours a send needs before its click counts as matured. */
export const CLICK_MATURITY_HOURS = 48;
export const DEFAULT_MIN_SENDS_PER_ARM = 200;
export const DEFAULT_MAX_DAYS = 45;
export const DEFAULT_CONVERSION_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pocock-style constant per-look alpha. Exact table value for the common
 * schedules (overall 0.05, two-sided); anything else falls back to a
 * Bonferroni split, which is conservative.
 */
export function pocockAlpha(looks: number = MAX_LOOKS): number {
  const table: Record<number, number> = { 1: 0.05, 2: 0.0294, 3: 0.0221, 4: POCOCK_ALPHA_4, 5: 0.0158 };
  const k = Math.max(1, Math.floor(looks));
  return table[k] ?? 0.05 / k;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export type ZResult = {
  p1: number;
  p2: number;
  /** Positive when arm 2 beats arm 1. */
  z: number;
  /** Two-sided p-value. */
  pValue: number;
  /** Relative lift of arm 2 over arm 1 (null when p1 = 0). */
  lift: number | null;
};

/**
 * Pooled two-proportion z-test of x2/n2 against x1/n1. Degenerate input
 * (an empty arm, or a pooled rate of exactly 0 or 1) returns z = 0, p = 1.
 */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): ZResult {
  const p1 = n1 > 0 ? x1 / n1 : 0;
  const p2 = n2 > 0 ? x2 / n2 : 0;
  const lift = p1 > 0 ? (p2 - p1) / p1 : null;
  if (n1 <= 0 || n2 <= 0) return { p1, p2, z: 0, pValue: 1, lift };
  const pooled = (x1 + x2) / (n1 + n2);
  if (pooled <= 0 || pooled >= 1) return { p1, p2, z: 0, pValue: 1, lift };
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return { p1, p2, z: 0, pValue: 1, lift };
  const z = (p2 - p1) / se;
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return { p1, p2, z, pValue, lift };
}

export type DecideInput = {
  arms: ArmStats[];
  primaryMetric: AbMetric;
  guardrail?: AbMetric | null;
  minSends: number;
  /** Looks already taken BEFORE this evaluation. */
  looksDone: number;
  startedAt: string | number | Date | null;
  maxDays: number;
  now: number | Date;
  /** Defaults to MAX_LOOKS. */
  maxLooks?: number;
};

export type DecideOutcome = "promote" | "inconclusive" | "conflict";

export type DecideResult = {
  action: "continue" | "decide" | "stop-no-winner";
  /** Set when action = "decide". */
  winner?: AbArmKey;
  /** Set when action != "continue". */
  outcome?: DecideOutcome;
  reason: string;
  /** Two-sided p-value of the primary test at this look (1 when not tested). */
  pValue: number;
  z: number;
  alpha: number;
  /** True when this evaluation counted as one of the sequential looks. */
  lookTaken: boolean;
  /** Look number (1-based) when lookTaken, else looksDone. */
  look: number;
  rates: Record<AbArmKey, number | null>;
  sends: Record<AbArmKey, number>;
  /** Primary-metric matured n per arm. */
  matured: Record<AbArmKey, number>;
  /** Arm the primary metric favored when a guardrail blocked it (conflict). */
  candidate?: AbArmKey;
  guardrailZ?: number;
};

function toMs(v: string | number | Date | null): number | null {
  if (v === null || v === undefined) return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decides one evaluation of a two-arm test. Order:
 *   1. Primary metric unreadable or either arm under minSends matured sends:
 *      continue, unless maxDays has passed (stop-no-winner, inconclusive).
 *   2. A look: z-test on the primary metric at the Pocock alpha.
 *      Significant: the better arm wins, unless its guardrail metric is
 *      significantly worse (one-sided z <= -1.645), which is a conflict
 *      (stop-no-winner, no promotion).
 *   3. Not significant: stop-no-winner once this was the last look or maxDays
 *      has passed, else continue (the look is still spent).
 * The caller only calls this when a look is due (weekly) or to check maxDays,
 * and persists looksDone + 1 when lookTaken.
 */
export function decideExperiment(input: DecideInput): DecideResult {
  const maxLooks = input.maxLooks ?? MAX_LOOKS;
  const alpha = pocockAlpha(maxLooks);
  const nowMs = input.now instanceof Date ? input.now.getTime() : input.now;
  const startMs = toMs(input.startedAt);
  const elapsedDays = startMs === null ? 0 : (nowMs - startMs) / DAY_MS;
  const pastMax = startMs !== null && elapsedDays >= input.maxDays;

  const armA = input.arms.find((a) => a.arm === "a");
  const armB = input.arms.find((a) => a.arm === "b");
  const mA = armA?.metrics[input.primaryMetric] ?? null;
  const mB = armB?.metrics[input.primaryMetric] ?? null;
  const rates: Record<AbArmKey, number | null> = {
    a: mA && mA.n > 0 ? mA.x / mA.n : null,
    b: mB && mB.n > 0 ? mB.x / mB.n : null,
  };
  const sends: Record<AbArmKey, number> = { a: armA?.sent ?? 0, b: armB?.sent ?? 0 };
  const matured: Record<AbArmKey, number> = { a: mA?.n ?? 0, b: mB?.n ?? 0 };
  const base = { rates, sends, matured, alpha };

  if (!armA || !armB || !mA || !mB) {
    if (pastMax) {
      return {
        ...base,
        action: "stop-no-winner",
        outcome: "inconclusive",
        reason: `Reached ${input.maxDays} days without readable ${input.primaryMetric} data.`,
        pValue: 1,
        z: 0,
        lookTaken: false,
        look: input.looksDone,
      };
    }
    return {
      ...base,
      action: "continue",
      reason: `${input.primaryMetric} data is not readable yet.`,
      pValue: 1,
      z: 0,
      lookTaken: false,
      look: input.looksDone,
    };
  }

  if (mA.n < input.minSends || mB.n < input.minSends) {
    if (pastMax) {
      return {
        ...base,
        action: "stop-no-winner",
        outcome: "inconclusive",
        reason: `Reached ${input.maxDays} days before both arms had ${input.minSends} matured sends (a: ${mA.n}, b: ${mB.n}).`,
        pValue: 1,
        z: 0,
        lookTaken: false,
        look: input.looksDone,
      };
    }
    return {
      ...base,
      action: "continue",
      reason: `Waiting for ${input.minSends} matured sends per arm (a: ${mA.n}, b: ${mB.n}).`,
      pValue: 1,
      z: 0,
      lookTaken: false,
      look: input.looksDone,
    };
  }

  const look = input.looksDone + 1;
  // z > 0 means arm b beats arm a.
  const test = twoProportionZ(mA.x, mA.n, mB.x, mB.n);
  const lastLook = look >= maxLooks;

  if (test.pValue < alpha && test.z !== 0) {
    const winner: AbArmKey = test.z > 0 ? "b" : "a";
    const loser: AbArmKey = winner === "a" ? "b" : "a";
    if (input.guardrail && input.guardrail !== input.primaryMetric) {
      const gW = (winner === "a" ? armA : armB).metrics[input.guardrail];
      const gL = (loser === "a" ? armA : armB).metrics[input.guardrail];
      if (gW && gL && gW.n > 0 && gL.n > 0) {
        // Positive z = winner better on the guardrail.
        const g = twoProportionZ(gL.x, gL.n, gW.x, gW.n);
        if (g.z <= GUARDRAIL_Z) {
          return {
            ...base,
            action: "stop-no-winner",
            outcome: "conflict",
            candidate: winner,
            guardrailZ: g.z,
            reason: `Arm ${winner} won on ${input.primaryMetric} (p=${fmtP(test.pValue)}) but is significantly worse on ${input.guardrail} (z=${g.z.toFixed(2)}). Needs a manual call.`,
            pValue: test.pValue,
            z: test.z,
            lookTaken: true,
            look,
          };
        }
      }
    }
    return {
      ...base,
      action: "decide",
      winner,
      outcome: "promote",
      reason: `Arm ${winner} wins on ${input.primaryMetric} at look ${look} (p=${fmtP(test.pValue)} < ${alpha}).`,
      pValue: test.pValue,
      z: test.z,
      lookTaken: true,
      look,
    };
  }

  if (lastLook || pastMax) {
    return {
      ...base,
      action: "stop-no-winner",
      outcome: "inconclusive",
      reason: lastLook
        ? `No significant difference after ${look} looks (p=${fmtP(test.pValue)}). Control stays.`
        : `Reached ${input.maxDays} days with no significant difference (p=${fmtP(test.pValue)}). Control stays.`,
      pValue: test.pValue,
      z: test.z,
      lookTaken: true,
      look,
    };
  }

  return {
    ...base,
    action: "continue",
    reason: `Look ${look} of ${maxLooks}: not significant yet (p=${fmtP(test.pValue)}, need < ${alpha}).`,
    pValue: test.pValue,
    z: test.z,
    lookTaken: true,
    look,
  };
}

/** True when a weekly look is due: never looked, or the last look was at
 * least LOOK_INTERVAL_DAYS ago. */
export function lookDue(lastLookAt: string | null, now: number): boolean {
  const ms = toMs(lastLookAt);
  if (ms === null) return true;
  return now - ms >= LOOK_INTERVAL_DAYS * DAY_MS;
}

/**
 * Projected sends per arm by the end of the test, from a recent daily send
 * rate split evenly over the arms. Used to warn at start when minSends is
 * out of reach within maxDays.
 */
export function projectSendsPerArm(args: {
  recentSends: number;
  recentDays: number;
  maxDays: number;
  arms?: number;
}): number {
  const arms = Math.max(1, args.arms ?? 2);
  if (!(args.recentDays > 0)) return 0;
  const perDay = Math.max(0, args.recentSends) / args.recentDays;
  return Math.floor((perDay * Math.max(0, args.maxDays)) / arms);
}

function fmtP(p: number): string {
  if (p < 0.0001) return "<0.0001";
  return p.toFixed(4);
}
