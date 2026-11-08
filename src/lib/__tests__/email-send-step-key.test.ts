import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// email_sends inserts captured here; `insertErrors` is consumed one per insert.
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
let insertErrors: ({ code: string } | null)[] = [];
let updateErrors: ({ code: string } | null)[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return Promise.resolve({ error: insertErrors.shift() ?? null });
      },
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        const chain = {
          eq: () => chain,
          then: (res: (v: unknown) => unknown) => Promise.resolve({ error: updateErrors.shift() ?? null }).then(res),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock("@/lib/email-senders", () => ({
  resendKeyFor: () => "re_test_key",
}));

vi.mock("@/lib/email-unsubscribe", () => ({
  isEmailSuppressed: async () => false,
  unsubscribeFooterText: () => "",
  unsubscribeFooterHtml: () => "",
  unsubscribeHeaders: () => ({}),
}));

vi.mock("@/lib/email-marketing", () => ({
  plainTextToTrackableHtml: (t: string) => `<p>${t}</p>`,
}));

import { sendEmail } from "@/lib/email-send";
import { sendMarketingEmail } from "@/lib/marketing-email";

const BASE = { from: "a@x.com", to: " Person@Example.com ", subject: "Hi", text: "Body", category: "trial_day1" };
const V1_KEYS = ["category", "funnel", "recipient", "resend_id", "status", "subject"];

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  insertErrors = [];
  updateErrors = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email_sends step_key passthrough", () => {
  it("without tracking the logged row is exactly the pre-v2 shape", async () => {
    const r = await sendEmail({ ...BASE, funnel: "trial", stream: "lifecycle" });
    expect(r).toEqual({ ok: true, id: "re_1" });
    expect(inserts).toHaveLength(1);
    expect(Object.keys(inserts[0]).sort()).toEqual(V1_KEYS);
    expect(inserts[0].recipient).toBe("person@example.com");
  });

  it("logs step_key / experiment_id / variant when given", async () => {
    await sendEmail({
      ...BASE,
      funnel: "trial",
      stepKey: "day1.mod-walmart.power",
      experimentId: "11111111-1111-1111-1111-111111111111",
      variant: "b",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      step_key: "day1.mod-walmart.power",
      experiment_id: "11111111-1111-1111-1111-111111111111",
      variant: "b",
    });
  });

  for (const code of ["42703", "PGRST204"]) {
    it(`retries without the tracking columns on ${code}`, async () => {
      insertErrors = [{ code }, null];
      await sendEmail({ ...BASE, funnel: "trial", stepKey: "day1.beginner" });
      expect(inserts).toHaveLength(2);
      expect(inserts[0].step_key).toBe("day1.beginner");
      expect(Object.keys(inserts[1]).sort()).toEqual(V1_KEYS);
    });
  }

  it("does not retry a missing-column error when no tracking was sent", async () => {
    insertErrors = [{ code: "42703" }];
    await sendEmail({ ...BASE, funnel: "trial" });
    expect(inserts).toHaveLength(1);
  });

  it("the webhook-race upgrade path carries step_key and drops it on a missing column", async () => {
    insertErrors = [{ code: "23505" }];
    updateErrors = [{ code: "42703" }, null];
    await sendEmail({ ...BASE, funnel: "trial", stepKey: "day1.beginner" });
    expect(updates).toHaveLength(2);
    expect(updates[0].step_key).toBe("day1.beginner");
    expect(updates[1]).not.toHaveProperty("step_key");
    expect(updates[1]).toMatchObject({ category: "trial_day1", status: "sent" });
  });

  it("sendMarketingEmail forwards stepKey to the log", async () => {
    const ok = await sendMarketingEmail({ ...BASE, funnel: "apptrial", stepKey: "day3.mod-deals" });
    expect(ok).toBe(true);
    expect(inserts[0]).toMatchObject({ step_key: "day3.mod-deals", funnel: "apptrial" });
  });

  it("sendMarketingEmail without stepKey logs the v1 row", async () => {
    await sendMarketingEmail({ ...BASE, funnel: "apptrial" });
    expect(Object.keys(inserts[0]).sort()).toEqual(V1_KEYS);
  });
});
