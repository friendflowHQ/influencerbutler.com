/**
 * Summary: The admin Support routes accept both ticket id families the feedback
 * Worker files (fb-<uuid> reports and tf-* TestFlight tickets) and nothing else.
 * Dependencies: vitest, ../support-worker.
 */
import { describe, it, expect } from "vitest";
import { isSupportTicketId } from "../support-worker";

describe("isSupportTicketId", () => {
  it("accepts app reports and TestFlight tickets", () => {
    expect(isSupportTicketId("fb-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe(true);
    expect(isSupportTicketId("tf-screenshot-AJ7k_2-xYz")).toBe(true);
    expect(isSupportTicketId("tf-crash-123456")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const id of ["", "fb-nope", "tf-other-1", "tf-crash-../x", "tf-crash-a b", null, 42]) {
      expect(isSupportTicketId(id)).toBe(false);
    }
  });
});
