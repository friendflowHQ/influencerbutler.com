/**
 * Summary: Cloudflare Worker that replaces Vercel's cron scheduler. Fires once
 *   a minute, decides which /api/cron/* routes are due this minute from the
 *   SCHEDULE table, and pings each due route with the CRON_SECRET bearer token.
 * Dependencies: none (standard Workers runtime + fetch).
 *
 * WHAT THIS IS FOR: freeing Vercel's 40-cron-job cap and consolidating cron
 * scheduling in one place. It does NOT reduce Vercel cost on its own: the work
 * still runs inside the Vercel function this Worker calls, so Vercel still bills
 * the same Active CPU / memory. Lowering cost means either running a route less
 * often (trim its entry below + in vercel.json) or moving a route's actual
 * logic into a Worker that talks to Supabase/Resend directly (a real port, only
 * worth it for a heavy, hot, self-contained route).
 *
 * MIGRATION: for every route you list here, remove its entry from vercel.json
 * so it is not scheduled twice. Routes left in vercel.json keep running on
 * Vercel. You can migrate gradually.
 */

export interface Env {
  VERCEL_BASE_URL: string;
  CRON_SECRET: string;
}

/**
 * route path (under /api/cron/) -> 5-field cron expression, UTC.
 * Mirrors vercel.json. Both Vercel crons and CF cron triggers run in UTC, so
 * the expressions are identical. Trim a value here AND in vercel.json together.
 */
const SCHEDULE: Record<string, string> = {
  "affiliate-funnel": "*/15 * * * *",
  "process-account-deletions": "0 10 * * *",
  "purge-ai-sessions": "30 10 * * *",
  "purge-call-recordings": "45 10 * * *",
  "recall-credit-check": "0 */2 * * *",
  "seed-activity": "*/30 * * * *",
  "newsletter": "0 13 * * 4",
  "commission-statements": "0 13 1 * *",
  "affiliate-autopay": "0 14 1 * *",
  "tax-review-reminder": "0 23 28-31 * *",
  "testimonial-requests": "0 15 * * *",
  "build-catalogue-filters": "0 4 * * *",
  "build-spcc-rates": "45 4 * * *",
  "comp-expiry": "0 14 * * *",
  "payout-status": "0 */4 * * *",
  "call-reminders": "0 * * * *",
  "process-recordings": "15 * * * *",
  "youtube-uploads": "20 */4 * * *",
  "event-reminders": "0 * * * *",
  "winback": "0 16 * * *",
  "winback-autocomp": "0 17 * * *",
  "affiliate-activation": "0 18 * * *",
  "founder-snapshot": "0 14 1,15 * *",
  "daily-digest": "0 1,14 * * *",
  "support-sweep": "0 14,17,20,23,2 * * *",
  "engineering-queue": "0 13,21 * * *",
  "email-marketing": "*/5 * * * *",
  "blog-autogen": "30 7 * * *",
  "calibrate-sales-curves": "0 5 * * *",
  "finance-tax-reminder": "0 15 * * *",
  "ops-health-heartbeat": "0 16 * * *",
  "striking-distance-snapshot": "0 14 * * 1",
};

/**
 * Matches one cron field against a value. Supports:
 *   *            any
 *   a            exact
 *   a,b,c        list (each part may itself be a range/step/*)
 *   a-b          inclusive range
 *   a-b/n        stepped range
 *   star/n       every n from the field minimum
 * Day-of-week accepts 0 and 7 as Sunday.
 */
function matchField(expr: string, value: number, min: number): boolean {
  for (const part of expr.split(",")) {
    const [rangePart, stepRaw] = part.split("/");
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    if (!Number.isFinite(step) || step < 1) continue;

    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = Infinity; // open-ended; the modulo below does the stepping
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-").map((n) => parseInt(n, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      lo = a;
      hi = b;
    } else {
      const n = parseInt(rangePart, 10);
      if (!Number.isFinite(n)) continue;
      lo = n;
      hi = n;
    }

    if (value < lo || value > hi) continue;
    if ((value - lo) % step === 0) return true;
  }
  return false;
}

/** True when the 5-field UTC cron expression is due at `date`. */
function isDue(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, mon, dowRaw] = fields;

  const dow = date.getUTCDay(); // 0..6, Sun=0
  // Normalize so a "7" in the expression (Sunday) still matches dow 0.
  const dowExpr = dowRaw.replace(/\b7\b/g, "0");

  return (
    matchField(min, date.getUTCMinutes(), 0) &&
    matchField(hour, date.getUTCHours(), 0) &&
    matchField(dom, date.getUTCDate(), 1) &&
    matchField(mon, date.getUTCMonth() + 1, 1) &&
    matchField(dowExpr, dow, 0)
  );
}

async function pingRoute(name: string, env: Env): Promise<{ name: string; status: number | string }> {
  const url = `${env.VERCEL_BASE_URL}/api/cron/${name}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    // Drain the body so the connection is released; we don't need the payload.
    await res.text().catch(() => "");
    return { name, status: res.status };
  } catch (err) {
    return { name, status: `error:${err instanceof Error ? err.message : String(err)}` };
  }
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.VERCEL_BASE_URL || !env.CRON_SECRET) {
      console.error("cron-dispatcher: missing VERCEL_BASE_URL or CRON_SECRET");
      return;
    }

    // Use the trigger's scheduled time, not Date.now(), so a late invocation
    // still evaluates the minute it was meant to fire for.
    const now = new Date(event.scheduledTime);

    const due = Object.entries(SCHEDULE)
      .filter(([, expr]) => isDue(expr, now))
      .map(([name]) => name);

    if (due.length === 0) return;

    const run = Promise.allSettled(due.map((name) => pingRoute(name, env))).then((results) => {
      for (const r of results) {
        if (r.status === "fulfilled") {
          console.log(`cron-dispatcher: ${r.value.name} -> ${r.value.status}`);
        } else {
          console.error("cron-dispatcher: ping rejected", r.reason);
        }
      }
    });

    ctx.waitUntil(run);
    await run;
  },

  // A tiny HTTP surface so you can smoke-test matching and manually fire a
  // route without waiting for the clock:
  //   GET /due              -> routes due right now
  //   GET /fire/<name>      -> ping one route immediately
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/due") {
      const now = new Date();
      const due = Object.entries(SCHEDULE)
        .filter(([, expr]) => isDue(expr, now))
        .map(([name]) => name);
      return Response.json({ now: now.toISOString(), due });
    }
    const fire = url.pathname.match(/^\/fire\/([a-z0-9-]+)$/);
    if (fire) {
      const name = fire[1];
      if (!(name in SCHEDULE)) return new Response("unknown route", { status: 404 });
      const result = await pingRoute(name, env);
      return Response.json(result);
    }
    return new Response("ib-cron-dispatcher: use /due or /fire/<name>", { status: 200 });
  },
};
