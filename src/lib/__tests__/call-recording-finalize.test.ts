/**
 * Summary: Tests the shared recording-finalize step, focusing on idempotent
 * auto-filing of support tickets (webhook + cron must never double-file).
 * Dependencies: vitest; ../ai-notes, ../call-tickets, ../support-worker are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../ai-notes", () => ({
  summarizeTranscript: vi.fn(),
}));
vi.mock("../call-tickets", () => ({
  isCallTicketsConfigured: vi.fn(() => true),
  extractSupportItems: vi.fn(),
}));
vi.mock("../support-worker", () => ({
  submitSupportTicket: vi.fn(),
}));

import { applyTranscriptResult } from "../call-recording-finalize";
import { summarizeTranscript } from "../ai-notes";
import { extractSupportItems, isCallTicketsConfigured } from "../call-tickets";
import { submitSupportTicket } from "../support-worker";

const summarizeMock = summarizeTranscript as unknown as ReturnType<typeof vi.fn>;
const extractMock = extractSupportItems as unknown as ReturnType<typeof vi.fn>;
const configuredMock = isCallTicketsConfigured as unknown as ReturnType<typeof vi.fn>;
const submitMock = submitSupportTicket as unknown as ReturnType<typeof vi.fn>;

/** Fake supabase admin that captures the update payload from from().update().eq(). */
function fakeAdmin() {
  const captured: { update: Record<string, unknown> | null } = { update: null };
  const admin = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        captured.update = payload;
        return { eq: async () => ({ error: null }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, captured };
}

const baseBooking = {
  id: "b1",
  call_type: "support",
  topic: "issues",
  user_email: "customer@example.com",
  tickets_filed_at: null as string | null,
};

describe("applyTranscriptResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuredMock.mockReturnValue(true);
    summarizeMock.mockResolvedValue({ summary: "s", keyTopics: [], actionItems: [], followUps: [] });
    process.env.SCHEDULING_OWNER_EMAIL = "owner@influencerbutler.com";
  });
  afterEach(() => {
    delete process.env.SCHEDULING_OWNER_EMAIL;
  });

  it("writes notes and files a ticket per extracted item, stamping tickets_filed_at", async () => {
    extractMock.mockResolvedValue([
      { type: "bug", title: "Export drops last row", description: "repro" },
      { type: "feature", title: "Bulk-tag", description: "asked" },
    ]);
    submitMock
      .mockResolvedValueOnce({ ok: true, id: "fb-1" })
      .mockResolvedValueOnce({ ok: true, id: "fb-2" });

    const { admin, captured } = fakeAdmin();
    await applyTranscriptResult(admin, { ...baseBooking }, { transcript: "t", recordingUrl: "http://rec" });

    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledTimes(2);
    // Filed under the owner inbox, not the customer, to avoid a surprise ack.
    expect(submitMock.mock.calls[0][0].userEmail).toBe("owner@influencerbutler.com");
    // Provenance + customer email live in the description.
    expect(submitMock.mock.calls[0][0].description).toContain("customer@example.com");
    expect(submitMock.mock.calls[0][0].tags).toBe("from-call");

    expect(captured.update?.recording_status).toBe("ready");
    expect(captured.update?.filed_ticket_ids).toEqual(["fb-1", "fb-2"]);
    expect(typeof captured.update?.tickets_filed_at).toBe("string");
  });

  it("does NOT extract or file when tickets_filed_at is already set", async () => {
    const { admin, captured } = fakeAdmin();
    await applyTranscriptResult(
      admin,
      { ...baseBooking, tickets_filed_at: "2026-09-01T00:00:00Z" },
      { transcript: "t", recordingUrl: null },
    );

    expect(extractMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(captured.update?.recording_status).toBe("ready");
    expect(captured.update?.filed_ticket_ids).toBeUndefined();
    expect(captured.update?.tickets_filed_at).toBeUndefined();
  });

  it("still stamps tickets_filed_at when extraction finds nothing (no re-run next pass)", async () => {
    extractMock.mockResolvedValue([]);
    const { admin, captured } = fakeAdmin();
    await applyTranscriptResult(admin, { ...baseBooking }, { transcript: "t", recordingUrl: null });

    expect(submitMock).not.toHaveBeenCalled();
    expect(captured.update?.filed_ticket_ids).toEqual([]);
    expect(typeof captured.update?.tickets_filed_at).toBe("string");
  });

  it("swallows extractor errors, still writes notes, and stamps to avoid a retry loop", async () => {
    extractMock.mockRejectedValue(new Error("llm down"));
    const { admin, captured } = fakeAdmin();
    await applyTranscriptResult(admin, { ...baseBooking }, { transcript: "t", recordingUrl: null });

    expect(captured.update?.recording_status).toBe("ready");
    expect(captured.update?.filed_ticket_ids).toBeUndefined();
    expect(typeof captured.update?.tickets_filed_at).toBe("string");
  });
});
