/**
 * Summary: /api/app-trial/signup keeps the email-only contract byte for byte,
 *   and adds Funnels v2 intake: walkthrough profile -> wt-* tags, desktop plan
 *   intent -> plan- tag, automation-mode completion -> activation, backfill
 *   never enrolls, milestone never enrolls (only records the signal), and a bad
 *   profile is dropped without failing the request.
 * Dependencies: vitest, ../route, @/lib/app-trial-enroll (mocked),
 *   @/lib/supabase/admin (mocked), src/lib/__tests__/funnels-v2-fake-db.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-trial-enroll", () => ({ enrollAppTrialLead: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "../route";
import { enrollAppTrialLead } from "@/lib/app-trial-enroll";
import { createAdminClient } from "@/lib/supabase/admin";
import { __resetActivationMemo } from "@/lib/funnel-activation";
import { makeFakeDb, type FakeDb } from "@/lib/__tests__/funnels-v2-fake-db";

const enrollMock = enrollAppTrialLead as unknown as ReturnType<typeof vi.fn>;
const adminMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;
const SECRET = "intake-secret-test";

function req(body: unknown, auth = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/app-trial/signup", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let fake: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  __resetActivationMemo();
  process.env.APP_TRIAL_INTAKE_SECRET = SECRET;
  fake = makeFakeDb({
    tables: {
      email_subscribers: [
        { email: "a@b.co", tags: ["newsletter"], onboarding_profile: null, plan_level: null, plan_level_source: null, activated_at: null, engaged_at: null },
      ],
      funnel_milestones: [],
    },
  });
  adminMock.mockReturnValue(fake.db);
  enrollMock.mockResolvedValue({ ok: true, enrolled: true, created: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("/api/app-trial/signup", () => {
  it("rejects a missing or wrong secret", async () => {
    expect((await POST(req({ email: "a@b.co" }, "Bearer nope"))).status).toBe(401);
    expect((await POST(req({ email: "a@b.co" }, ""))).status).toBe(401);
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it("rejects bad JSON and bad emails as before", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    const bad = await POST(req({ email: "nope" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: "Invalid email" });
  });

  it("an email-only body behaves exactly as before and touches nothing else", async () => {
    enrollMock.mockResolvedValue({ ok: true, enrolled: true, created: true });
    const res = await POST(req({ email: " A@B.co ", first_name: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: true, created: true });
    expect(enrollMock).toHaveBeenCalledWith("a@b.co", { source: "app-trial" });
    expect(adminMock).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
  });

  it("passes through enroll reasons unchanged", async () => {
    enrollMock.mockResolvedValue({ ok: true, enrolled: true, created: false, reason: "already" });
    expect(await (await POST(req({ email: "a@b.co" }))).json()).toEqual({
      ok: true,
      enrolled: true,
      created: false,
      reason: "already",
    });
  });

  it("an enroll failure is still a 503", async () => {
    enrollMock.mockResolvedValue({ ok: false, enrolled: false, reason: "error" });
    const res = await POST(req({ email: "a@b.co", profile: { goal: "everything" } }));
    expect(res.status).toBe(503);
    expect(fake.calls).toEqual([]);
  });

  it("capture: enrolls, writes wt-* tags and the intent plan tag", async () => {
    const res = await POST(
      req({
        email: "a@b.co",
        source: "onboarding",
        stage: "capture",
        profile: { experience: "existing", goal: "cc-auto-accept", platforms: ["amazon", "walmart"] },
        planLevelIntent: "power",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: true, created: false, profileApplied: true });
    expect(enrollMock).toHaveBeenCalledTimes(1);
    const row = fake.tables.email_subscribers[0];
    expect(row.tags).toEqual([
      "newsletter",
      "wt-exp-existing",
      "wt-goal-cc-auto-accept",
      "wt-plat-amazon",
      "wt-plat-walmart",
      "plan-power",
    ]);
    expect(row).toMatchObject({ onboarding_profile_stage: "capture", plan_level: "power", plan_level_source: "intent" });
    // Managed tags never trigger sequence enrollment.
    expect(fake.calls.some((c) => c.table.startsWith("email_sequence"))).toBe(false);
  });

  it("intent never overwrites a plan level from Lemon Squeezy", async () => {
    Object.assign(fake.tables.email_subscribers[0], { tags: ["plan-beginner"], plan_level: "beginner", plan_level_source: "ls" });
    await POST(req({ email: "a@b.co", profile: { goal: "everything" }, planLevelIntent: "power" }));
    const row = fake.tables.email_subscribers[0];
    expect(row).toMatchObject({ plan_level: "beginner", plan_level_source: "ls" });
    expect(row.tags).toContain("plan-beginner");
    expect(row.tags).not.toContain("plan-power");
  });

  it("complete in automation mode: never enrolls, stores the profile, marks activation", async () => {
    const res = await POST(
      req({
        email: "a@b.co",
        stage: "complete",
        profile: { stage: "capture", goal: "everything", mode: "automation", outcome: "complete" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: false, reason: "profile-only", profileApplied: true });
    // A completion ping is a profile update: it must not start a fresh drip.
    expect(enrollMock).not.toHaveBeenCalled();
    const row = fake.tables.email_subscribers[0];
    expect(row.onboarding_profile_stage).toBe("complete");
    expect(row.activation_signal).toBe("walkthrough-auto-complete");
    expect(fake.tables.funnel_milestones).toEqual([
      expect.objectContaining({ email: "a@b.co", milestone: "walkthrough-auto-complete", source: "intake" }),
    ]);
  });

  it("complete for an address with no contact row creates nothing and never enrolls", async () => {
    const res = await POST(req({ email: "new@b.co", stage: "complete", profile: { goal: "everything", mode: "automation", outcome: "complete" } }));
    expect(res.status).toBe(200);
    expect(enrollMock).not.toHaveBeenCalled();
    expect(fake.tables.email_subscribers.map((r) => r.email)).toEqual(["a@b.co"]);
  });

  it("complete in manual mode does not count as activation", async () => {
    await POST(req({ email: "a@b.co", stage: "complete", profile: { mode: "manual", outcome: "complete" } }));
    expect(fake.tables.email_subscribers[0].activated_at).toBeNull();
  });

  it("uses the profile's own stage when the body has none", async () => {
    await POST(req({ email: "a@b.co", profile: { stage: "complete", goal: "everything" } }));
    expect(fake.tables.email_subscribers[0].onboarding_profile_stage).toBe("complete");
  });

  it("backfill never enrolls, but stores the profile", async () => {
    const res = await POST(req({ email: "a@b.co", stage: "backfill", profile: { goal: "video-marketplaces" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: false, reason: "backfill", profileApplied: true });
    expect(enrollMock).not.toHaveBeenCalled();
    expect(fake.tables.email_subscribers[0].tags).toContain("wt-goal-video-marketplaces");
  });

  it("milestone never enrolls; it only records the signal", async () => {
    const res = await POST(req({ email: "a@b.co", stage: "milestone", milestone: "first-butler-run", profile: { goal: "everything" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, milestone: "first-butler-run", recorded: true });
    expect(enrollMock).not.toHaveBeenCalled();
    const row = fake.tables.email_subscribers[0];
    expect(row.activation_signal).toBe("first-butler-run");
    expect(row.tags).toEqual(["newsletter"]);
  });

  it("rejects an unknown milestone without enrolling", async () => {
    const res = await POST(req({ email: "a@b.co", stage: "milestone", milestone: "won-the-lottery" }));
    expect(res.status).toBe(400);
    expect(enrollMock).not.toHaveBeenCalled();
    expect(fake.tables.funnel_milestones).toEqual([]);
  });

  it("drops an invalid profile and still answers as an email-only body", async () => {
    const res = await POST(req({ email: "a@b.co", profile: { goal: "<script>", platforms: "amazon" } }));
    expect(await res.json()).toEqual({ ok: true, enrolled: true, created: false });
    expect(fake.tables.email_subscribers[0].tags).toEqual(["newsletter"]);
  });

  it("a profile write failure never fails the enrollment", async () => {
    adminMock.mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await POST(req({ email: "a@b.co", profile: { goal: "everything" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: true, created: false, profileApplied: false });
  });

  it("skips profile writes for suppressed addresses", async () => {
    enrollMock.mockResolvedValue({ ok: true, enrolled: false, reason: "suppressed" });
    const res = await POST(req({ email: "a@b.co", profile: { goal: "everything" } }));
    expect(await res.json()).toEqual({ ok: true, enrolled: false, reason: "suppressed", profileApplied: false });
    expect(fake.calls).toEqual([]);
  });

  it("works when the 20261109 columns are not applied (tags still land)", async () => {
    fake = makeFakeDb({
      tables: { email_subscribers: [{ email: "a@b.co", tags: [] }] },
      missingTables: ["funnel_milestones"],
      missingColumns: {
        email_subscribers: [
          "onboarding_profile",
          "onboarding_profile_stage",
          "onboarding_profile_at",
          "plan_level",
          "plan_level_source",
          "activated_at",
          "activation_signal",
          "engaged_at",
        ],
      },
    });
    adminMock.mockReturnValue(fake.db);
    const res = await POST(
      req({ email: "a@b.co", stage: "complete", profile: { goal: "everything", mode: "automation", outcome: "complete" }, planLevelIntent: "beginner" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enrolled: false, reason: "profile-only", profileApplied: true });
    expect(fake.tables.email_subscribers[0].tags).toEqual([
      "wt-goal-everything",
      "wt-run-automation",
      "wt-done-complete",
      "plan-beginner",
    ]);
  });
});
