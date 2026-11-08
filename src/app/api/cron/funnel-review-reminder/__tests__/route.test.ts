const DASHES = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
import { describe, it, expect, vi, beforeEach } from "vitest";

const appConfig = new Map<string, unknown>();
const sendEmail = vi.fn(async () => ({ ok: true, id: "r1" }));

function makeDb() {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    let key: string | null = null;
    q.select = () => q;
    q.eq = (col: string, v: string) => {
      if (col === "key") key = v;
      return q;
    };
    q.in = () => q;
    q.maybeSingle = async () => ({ data: key && appConfig.has(key) ? { value: appConfig.get(key) } : null, error: null });
    q.upsert = async (row: { key: string; value: unknown }) => {
      appConfig.set(row.key, row.value);
      return { error: null };
    };
    // Awaiting a list query: experiments table missing, sequences empty.
    q.then = (resolve: (v: unknown) => void) =>
      resolve(
        table === "email_experiments"
          ? { data: null, error: { code: "42P01" } }
          : { data: [], error: null, count: 0 },
      );
    return q;
  };
  return { from: chain };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeDb() }));
vi.mock("@/lib/email-send", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock("@/lib/funnel-copy", () => ({ loadFunnelOverrides: async () => new Map() }));
vi.mock("@/lib/funnel-metrics", () => ({
  isMetricFunnel: (k: string) => k === "trial",
  isMissingSchema: (e: { code?: string } | null) => !!e && ["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code ?? ""),
  computeFunnelMetrics: async () => ({
    activation: { num: 4, den: 10, rate: 0.4, measurable: true },
    paid: { num: 1, den: 10, rate: 0.1, measurable: true, kind: "purchase", label: "Paid" },
  }),
}));
vi.mock("@/lib/funnel-targets", () => ({
  getFunnelTargets: async () => ({}),
  systemTargetKey: (f: string) => `system:${f}`,
  targetFor: () => ({ activation: 0.8, paid: 0.8 }),
}));
vi.mock("@/lib/founder-recipient", () => ({ founderRecipients: () => ["founder@example.com"] }));

import { GET } from "@/app/api/cron/funnel-review-reminder/route";

function req(qs = "", auth = true) {
  return new Request(`https://www.influencerbutler.com/api/cron/funnel-review-reminder${qs}`, {
    headers: auth ? { authorization: "Bearer test-secret" } : {},
  });
}

describe("GET /api/cron/funnel-review-reminder", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    appConfig.clear();
    sendEmail.mockClear();
  });

  it("401s without the bearer", async () => {
    const res = await GET(req("?force=1", false));
    expect(res.status).toBe(401);
  });

  it("dry run returns the rendered email as JSON without sending", async () => {
    const res = await GET(req("?force=1&dry=1"));
    const body = await res.json();
    expect(body.dry).toBe(true);
    expect(body.subject).toMatch(/^Monthly email funnel review: \d+ items? needs? a look$/);
    expect(body.text).toContain("BELOW TARGET");
    expect(body.text).toContain("Activation 40% vs 80% target");
    expect(body.text).not.toMatch(DASHES);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends once, then skips the same month", async () => {
    const first = await (await GET(req("?force=1"))).json();
    expect(first.ran).toBe(true);
    expect(first.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const second = await (await GET(req("?force=1"))).json();
    expect(second.reason).toBe("already-ran");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
