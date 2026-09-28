/**
 * Summary: Unit tests for the month-end tax-review reminder + submitted-alert bodies.
 * Dependencies: vitest, ../tax-review-reminder-email.
 */

import { describe, it, expect } from "vitest";
import {
  isLastDayOfLocalMonth,
  buildTaxReviewReminderBody,
  buildTaxFormSubmittedBody,
  submittedAlertSubject,
  type TaxReviewReminderInput,
} from "../tax-review-reminder-email";

const EM_DASH = /—/;

describe("isLastDayOfLocalMonth", () => {
  it("accepts month ends", () => {
    expect(isLastDayOfLocalMonth({ year: 2026, month: 1, day: 31 })).toBe(true);
    expect(isLastDayOfLocalMonth({ year: 2026, month: 4, day: 30 })).toBe(true);
    expect(isLastDayOfLocalMonth({ year: 2026, month: 12, day: 31 })).toBe(true);
  });

  it("rejects non-final days", () => {
    expect(isLastDayOfLocalMonth({ year: 2026, month: 1, day: 30 })).toBe(false);
    expect(isLastDayOfLocalMonth({ year: 2026, month: 8, day: 1 })).toBe(false);
  });

  it("handles February in leap and non-leap years", () => {
    expect(isLastDayOfLocalMonth({ year: 2026, month: 2, day: 28 })).toBe(true);
    expect(isLastDayOfLocalMonth({ year: 2028, month: 2, day: 28 })).toBe(false);
    expect(isLastDayOfLocalMonth({ year: 2028, month: 2, day: 29 })).toBe(true);
  });
});

function reminderInput(overrides: Partial<TaxReviewReminderInput> = {}): TaxReviewReminderInput {
  return {
    period: "2026-09",
    armed: true,
    pending: [
      {
        name: "Beth Thompson",
        email: "beth@example.com",
        formType: "W-9",
        submittedAt: "2026-08-12T10:00:00.000Z",
        payableCents: 4500,
      },
    ],
    heldOverCap: [],
    notReady: [],
    ...overrides,
  };
}

describe("buildTaxReviewReminderBody", () => {
  it("lists each pending form with name, type, and payable amount", () => {
    const body = buildTaxReviewReminderBody(reminderInput());
    expect(body).toContain("Tax forms pending your review (1):");
    expect(body).toContain("Beth Thompson (beth@example.com): W-9");
    expect(body).toContain("$45.00");
    expect(body).toContain("/dashboard/admin/affiliates");
  });

  it("renders held-over-cap and not-ready sections only when non-empty", () => {
    const empty = buildTaxReviewReminderBody(reminderInput());
    expect(empty).not.toContain("Held for manual review");
    expect(empty).not.toContain("not set up on their side");

    const full = buildTaxReviewReminderBody(
      reminderInput({
        heldOverCap: [{ name: "Sam", payableCents: 30000, detail: "over the $200.00 auto-pay cap" }],
        notReady: [{ name: "Kay", payableCents: 2000, detail: "missing PayPal email" }],
      }),
    );
    expect(full).toContain("Held for manual review (over the auto-pay cap):");
    expect(full).toContain("Sam: $300.00");
    expect(full).toContain("Payable but not set up on their side");
    expect(full).toContain("Kay: $20.00  (missing PayPal email)");
  });

  it("phrases armed vs shadow differently", () => {
    const armed = buildTaxReviewReminderBody(reminderInput({ armed: true }));
    const shadow = buildTaxReviewReminderBody(reminderInput({ armed: false }));
    expect(armed).toContain("ARMED");
    expect(shadow).toContain("SHADOW");
    expect(armed).not.toEqual(shadow);
  });

  it("renders an all-clear body when nothing is pending", () => {
    const body = buildTaxReviewReminderBody(reminderInput({ pending: [] }));
    expect(body).toContain("No tax forms are waiting on review.");
  });

  it("contains no em dashes", () => {
    const body = buildTaxReviewReminderBody(
      reminderInput({
        heldOverCap: [{ name: "Sam", payableCents: 30000, detail: "over the cap" }],
        notReady: [{ name: "Kay", payableCents: 2000, detail: "missing tax form + PayPal email" }],
      }),
    );
    expect(body).not.toMatch(EM_DASH);
  });
});

describe("buildTaxFormSubmittedBody", () => {
  const input = {
    userId: "user-123",
    name: "Beth Thompson",
    email: "beth@example.com",
    formType: "W-9",
    country: "United States",
    tinLast4: "3267",
    tinKind: "ssn",
    submittedAt: "2026-08-26T17:00:00.000Z",
    isResubmit: false,
  };

  it("includes the name, form type, masked TIN, and direct review link", () => {
    const body = buildTaxFormSubmittedBody(input);
    expect(body).toContain("Beth Thompson submitted a W-9 tax form.");
    expect(body).toContain("**** 3267 (SSN)");
    expect(body).toContain("/dashboard/admin/affiliates/user-123");
    expect(body).not.toMatch(EM_DASH);
  });

  it("flags resubmissions", () => {
    const body = buildTaxFormSubmittedBody({ ...input, isResubmit: true });
    expect(body).toContain("re-submitted");
  });
});

describe("submittedAlertSubject", () => {
  it("names the form type but never the affiliate's legal name", () => {
    const subject = submittedAlertSubject("W-9");
    expect(subject).toBe("Tax form submitted (W-9)");
    expect(subject).not.toContain("Beth");
    expect(subject).not.toContain("Samantha");
  });
});
