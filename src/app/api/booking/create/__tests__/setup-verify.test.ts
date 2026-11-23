/**
 * Summary: Server-side verification in POST /api/booking/create. A website
 *   booking whose picked topic maps to a butler whose required setup the app
 *   reports as missing is refused (422 setup_not_done) with the exact steps; a
 *   finished butler needs no tick; no snapshot falls back to the checkboxes;
 *   app, extension and phone bookings (license bearer) skip it.
 * Dependencies: vitest, ../route (everything after the gate is mocked out).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/license-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/scheduling-server", () => ({
  getAdmin: vi.fn(() => ({})),
  validateSlot: vi.fn(async () => ({ ok: false, reason: "stop here" })),
  loadConfig: vi.fn(),
}));
vi.mock("@/lib/setup-gate", () => ({ setupWalkthroughSkipped: vi.fn(async () => false), SETUP_REQUIRED_CODE: "setup_required", SETUP_REQUIRED_MESSAGE: "x" }));
vi.mock("@/lib/call-prep", () => ({ callPrepRequired: () => false, checkCallPrep: () => ({ ok: true }) }));
vi.mock("@/lib/call-policy", () => ({ callPolicyActive: () => false, checkCallPolicy: () => ({ ok: true }) }));
vi.mock("@/lib/call-policy-server", () => ({ supportBookingsInMonth: vi.fn(async () => 0) }));
vi.mock("@/lib/google-meet", () => ({ createMeetEvent: vi.fn(), isGoogleConfigured: () => false }));
vi.mock("@/lib/recall", () => ({ scheduleBot: vi.fn(), isRecallConfigured: () => false, shouldScheduleRecordingBot: () => false }));
vi.mock("@/lib/call-emails", () => ({ sendBookingConfirmation: vi.fn(), sendOwnerNotification: vi.fn() }));
vi.mock("@/lib/partner-call-slots-server", () => ({ isPartnerAudience: vi.fn(), openPartnerSlots: vi.fn(), partnerBookingsForUser: vi.fn() }));
vi.mock("@/lib/lemonsqueezy", () => ({ planForVariantId: () => "power", planLevelForVariantId: () => "power" }));
const readMock = vi.fn();
vi.mock("@/lib/setup-snapshot-server", () => ({ readSetupSnapshot: (...a: unknown[]) => readMock(...a) }));

import { POST } from "../route";
import { resolveAuth } from "@/lib/license-auth";
import { prereqsFor } from "@/lib/call-prerequisites";

const authMock = resolveAuth as unknown as ReturnType<typeof vi.fn>;
const TRIED = "I followed the steps in the guide and the key still would not connect to the app.";

function booking(body: Record<string, unknown>, bearer = false) {
  return new Request("http://localhost/api/booking/create", {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: "Bearer IB-KEY" } : {}) },
    body: JSON.stringify({ type: "demo", startMs: Date.now() + 86_400_000, ...body }),
  });
}
const snapshot = (butlers: Record<string, unknown>) => ({
  updatedAt: new Date().toISOString(),
  snapshot: { v: 1, at: new Date().toISOString(), requiredDone: 0, requiredTotal: 1, line: "", butlers },
});
const allTicked = (topics: string[]) => ({ ack: prereqsFor(topics, "demo").map((p) => p.id), tried: TRIED });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ ok: true, auth: { userId: "user-1", email: "a@b.co" } });
});

describe("POST /api/booking/create setup verification", () => {
  it("refuses with the exact missing steps even when every box is ticked", async () => {
    readMock.mockResolvedValue(snapshot({ "ai-clone-butler": { done: 0, total: 1, missing: [{ id: "openai", label: "Connect your OpenAI key" }] } }));
    const res = await POST(booking({ topics: ["ai-influencer"], prereq: allTicked(["ai-influencer"]) }));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.code).toBe("setup_not_done");
    expect(j.error).toContain("Connect your OpenAI key");
    expect(j.missingSetup[0].prereqId).toBe("ai-influencer.key");
  });

  it("lets a verified item through without its tick", async () => {
    readMock.mockResolvedValue(snapshot({ deals: { done: 1, total: 1, missing: [] } }));
    const ids = prereqsFor(["deals-butler"], "demo").map((p) => p.id).filter((id) => id !== "deals-butler.guide");
    const res = await POST(booking({ topics: ["deals-butler"], prereq: { ack: ids, tried: TRIED } }));
    // It passed both gates and stopped at the mocked slot check.
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("stop here");
  });

  it("falls back to the checkboxes with no snapshot", async () => {
    readMock.mockResolvedValue(null);
    const none = await POST(booking({ topics: ["deals-butler"], prereq: { ack: [], tried: TRIED } }));
    expect(none.status).toBe(422);
    expect((await none.json()).code).toBe("prereq_required");
    const ticked = await POST(booking({ topics: ["deals-butler"], prereq: allTicked(["deals-butler"]) }));
    expect(ticked.status).toBe(409);
  });

  it("skips verification for app, extension and phone bookings", async () => {
    readMock.mockResolvedValue(snapshot({ "ai-clone-butler": { done: 0, total: 1, missing: [{ id: "openai", label: "Connect your OpenAI key" }] } }));
    const res = await POST(booking({ topics: ["ai-influencer"] }, true));
    expect(readMock).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });
});
