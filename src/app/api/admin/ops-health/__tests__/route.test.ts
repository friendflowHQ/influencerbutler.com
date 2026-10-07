/**
 * Summary: Unit tests for /api/admin/ops-health - bearer auth, body validation,
 * and the ?dry=1 rendering path (nothing sent, nothing stored).
 * Dependencies: vitest, ../route; the Supabase client and email sender are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      upsert,
    }),
  }),
}));
const sendEmailMock = vi.fn(async () => ({ ok: true, id: "x" }));
vi.mock("@/lib/email-send", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...(a as [])) }));

import { POST } from "../route";

const SECRET = "test-cron-secret";

function req(body: unknown, opts: { auth?: boolean; query?: string } = {}) {
  return new Request(`http://localhost/api/admin/ops-health${opts.query ?? ""}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.auth === false ? {} : { authorization: `Bearer ${SECRET}` }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const criticalReport = {
  findings: [{ service: "supabase", severity: "critical", title: "DB paused", detail: "d", fix: "Restore it" }],
};

describe("POST /api/admin/ops-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.ADMIN_EMAILS = "owner@example.com";
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_EMAILS;
  });

  it("returns 401 without the bearer secret", async () => {
    const res = await POST(req(criticalReport, { auth: false }));
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(criticalReport));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-JSON body and for a body without findings", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ nope: true }))).status).toBe(400);
  });

  it("dry run renders the email but sends and stores nothing", async () => {
    const res = await POST(req(criticalReport, { query: "?dry=1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.wouldAlert).toBe(true);
    expect(json.alerted).toBe(false);
    expect(json.subject).toContain("1 critical");
    expect(json.text).toContain("Fix: Restore it");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sends one alert email to the owner and stores the report", async () => {
    const res = await POST(req(criticalReport));
    const json = await res.json();
    expect(json.alerted).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("an all-clear report stores state without emailing", async () => {
    const res = await POST(req({ findings: [] }));
    const json = await res.json();
    expect(json.alerted).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
