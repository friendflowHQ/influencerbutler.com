/**
 * Summary: Testimonial ask rules: lifetime cap, cooldown, tolerance of the
 * un-migrated columns, and open-ticket suppression (fail-open on Worker errors).
 * Dependencies: vitest, ../testimonial-ask, ../support-worker (mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../support-worker", () => ({
  callSupportWorker: vi.fn(),
  isSupportWorkerConfigured: vi.fn(() => true),
}));

import { callSupportWorker, isSupportWorkerConfigured } from "../support-worker";
import { askAllowed, hasOpenSupportTicket, readAskState, recordAsk, MAX_ASKS, COOLDOWN_DAYS } from "../testimonial-ask";

const DAY = 24 * 60 * 60 * 1000;

describe("askAllowed", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  it("allows a user who was never asked", () => {
    expect(askAllowed({ count: 0, lastAskedAt: null, known: true }, now)).toBe(true);
  });
  it("blocks at the lifetime cap", () => {
    expect(askAllowed({ count: MAX_ASKS, lastAskedAt: null, known: true }, now)).toBe(false);
  });
  it("blocks inside the cooldown and allows after it", () => {
    expect(askAllowed({ count: 1, lastAskedAt: now - (COOLDOWN_DAYS - 1) * DAY, known: true }, now)).toBe(false);
    expect(askAllowed({ count: 1, lastAskedAt: now - (COOLDOWN_DAYS + 1) * DAY, known: true }, now)).toBe(true);
  });
});

describe("readAskState / recordAsk", () => {
  it("reads as never-asked and unknown when the columns are missing", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42703" } }) }) }),
      }),
    };
    expect(await readAskState(client, "u1")).toEqual({ count: 0, lastAskedAt: null, known: false });
  });

  it("increments the count when known, and skips the write when not", async () => {
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    const client = { from: () => ({ update }) };
    await recordAsk(client, "u1", { count: 1, lastAskedAt: null, known: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ testimonial_ask_count: 2 }));
    update.mockClear();
    await recordAsk(client, "u1", { count: 0, lastAskedAt: null, known: false });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("hasOpenSupportTicket", () => {
  beforeEach(() => {
    vi.mocked(callSupportWorker).mockReset();
    vi.mocked(isSupportWorkerConfigured).mockReturnValue(true);
  });

  it("is true only when a returned ticket matches the email", async () => {
    vi.mocked(callSupportWorker).mockResolvedValue({
      ok: true,
      status: 200,
      data: { tickets: [{ userEmail: "Pat@Example.com" }] },
    });
    expect(await hasOpenSupportTicket("pat@example.com")).toBe(true);
    expect(await hasOpenSupportTicket("someone@else.com")).toBe(false);
  });

  it("matches auto-filed tickets by requesterEmail", async () => {
    vi.mocked(callSupportWorker).mockResolvedValue({
      ok: true,
      status: 200,
      data: { tickets: [{ userEmail: "owner@x.com", requesterEmail: "pat@example.com" }] },
    });
    expect(await hasOpenSupportTicket("pat@example.com")).toBe(true);
  });

  it("fails open when the Worker errors or is not configured", async () => {
    vi.mocked(callSupportWorker).mockResolvedValue({ ok: false, status: 502, error: "down" });
    expect(await hasOpenSupportTicket("pat@example.com")).toBe(false);
    vi.mocked(isSupportWorkerConfigured).mockReturnValue(false);
    expect(await hasOpenSupportTicket("pat@example.com")).toBe(false);
  });
});
