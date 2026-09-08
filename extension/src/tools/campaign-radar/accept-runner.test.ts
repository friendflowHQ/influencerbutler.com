import { describe, expect, it } from "vitest";
import { classifyAcceptState } from "./accept-runner";

// The DOM driver (runAcceptOnPage) needs a browser document and is validated by
// live QA; the pure classifier that decides what the card is telling us after
// the click is covered here on fixture strings. The card texts mimic the live
// CC card (brand / rate / budget / dates) with the post-click wording we expect
// Amazon to add (UNVERIFIED until QA).

const CARD_BEFORE =
  "YHSF YHSF - Mink Blankets July/Aug Commission rate 10% Budget $1,000,000.00 Dates 7/13/26 - 8/13/26 Accept Not interested";

describe("classifyAcceptState", () => {
  it("reads a newly accepted card as accepted", () => {
    const after = CARD_BEFORE.replace("Accept Not interested", "Accepted");
    expect(classifyAcceptState(after, false, false, CARD_BEFORE)).toBe("accepted");
    // Success wording wins even if some button is still on the card.
    expect(classifyAcceptState(after, false, true, CARD_BEFORE)).toBe("accepted");
  });

  it("reads a queued request as pending", () => {
    const after = CARD_BEFORE.replace("Accept Not interested", "Pending brand approval");
    expect(classifyAcceptState(after, false, false, CARD_BEFORE)).toBe("pending");
  });

  it("ignores accepted / pending wording that was already on the card before the click", () => {
    const before = "Brand X Commission rate 12% Pending approval Accept";
    // Same text, button still there: nothing changed yet.
    expect(classifyAcceptState(before, false, true, before)).toBe("waiting");
    // Same text, button gone: that is the only new evidence, so accepted.
    expect(classifyAcceptState(before, false, false, before)).toBe("accepted");
  });

  it("asks to confirm when a dialog is open", () => {
    expect(classifyAcceptState(CARD_BEFORE, true, true, CARD_BEFORE)).toBe("confirm");
    // A dialog outranks a vanished button (the card may hide it behind the modal).
    expect(classifyAcceptState(CARD_BEFORE, true, false, CARD_BEFORE)).toBe("confirm");
  });

  it("reports an error toast", () => {
    const withToast = `${CARD_BEFORE} Something went wrong. Please try again.`;
    expect(classifyAcceptState(withToast, false, true, CARD_BEFORE)).toBe("error");
  });

  it("does not report an error that was already on the page before the click", () => {
    const before = `${CARD_BEFORE} Error loading recommendations`;
    expect(classifyAcceptState(before, false, true, before)).toBe("waiting");
  });

  it("treats a vanished button with no wording as accepted", () => {
    expect(classifyAcceptState(CARD_BEFORE, false, false, CARD_BEFORE)).toBe("accepted");
  });

  it("keeps waiting while nothing has changed", () => {
    expect(classifyAcceptState(CARD_BEFORE, false, true, CARD_BEFORE)).toBe("waiting");
    expect(classifyAcceptState("", false, true)).toBe("waiting");
  });

  it("works without a baseline (first read on a fresh card)", () => {
    expect(classifyAcceptState("Brand Accepted", false, false)).toBe("accepted");
    expect(classifyAcceptState("Brand Pending", false, false)).toBe("pending");
    expect(classifyAcceptState("Brand Accept", false, true)).toBe("waiting");
  });
});
