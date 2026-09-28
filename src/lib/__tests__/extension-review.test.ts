import { beforeAll, describe, expect, it } from "vitest";
import {
  personalizeReviewBody,
  reviewToken,
  verifyReviewToken,
  reviewClickUrl,
  reviewConfirmUrl,
  feedbackSurveyUrl,
} from "../extension-review";

// The token + URL helpers read the signing secret and site URL from the
// environment at call time, so set them before exercising the module.
beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-for-extension-review";
  process.env.SITE_URL = "https://www.influencerbutler.com";
});

describe("reviewToken / verifyReviewToken", () => {
  it("verifies a token it produced, case/whitespace-insensitive on the email", () => {
    const token = reviewToken("Creator@Example.com");
    expect(token).not.toBe("");
    expect(verifyReviewToken("  creator@example.com  ", token)).toBe(true);
  });

  it("rejects a token issued for a different address", () => {
    const token = reviewToken("a@example.com");
    expect(verifyReviewToken("b@example.com", token)).toBe(false);
  });

  it("rejects an empty or garbage token", () => {
    expect(verifyReviewToken("a@example.com", "")).toBe(false);
    expect(verifyReviewToken("a@example.com", "not-a-real-token")).toBe(false);
  });

  it("is distinct from a plain unsubscribe HMAC (purpose-scoped context)", async () => {
    const { unsubscribeToken } = await import("../email-unsubscribe");
    expect(reviewToken("a@example.com")).not.toBe(unsubscribeToken("a@example.com"));
  });
});

describe("personalizeReviewBody", () => {
  it("replaces all three placeholders with this recipient's signed links", () => {
    const body =
      "Feedback: {{FEEDBACK_URL}}\nReview: {{REVIEW_URL}}\nAlready did? {{REVIEW_CONFIRM_URL}}";
    const out = personalizeReviewBody(body, "creator@example.com");
    expect(out).toContain(reviewClickUrl("creator@example.com"));
    expect(out).toContain(reviewConfirmUrl("creator@example.com"));
    expect(out).toContain(feedbackSurveyUrl("creator@example.com"));
    expect(out).not.toContain("{{");
  });

  it("points the feedback link at the on-site survey page carrying the email", () => {
    const out = personalizeReviewBody("{{FEEDBACK_URL}}", "creator@example.com");
    expect(out).toContain("/extension-feedback");
    expect(out).toContain("e=creator%40example.com");
  });

  it("replaces every occurrence of a placeholder", () => {
    const body = "{{REVIEW_URL}} and again {{REVIEW_URL}}";
    const out = personalizeReviewBody(body, "creator@example.com");
    expect(out.split(reviewClickUrl("creator@example.com")).length).toBe(3);
  });

  it("returns the body untouched when there are no placeholders", () => {
    const body = "A normal drip step with no review link.";
    expect(personalizeReviewBody(body, "creator@example.com")).toBe(body);
  });

  it("carries the recipient email through the click link", () => {
    const out = personalizeReviewBody("{{REVIEW_URL}}", "creator@example.com");
    expect(out).toContain("e=creator%40example.com");
    expect(out).toContain("/api/extension/review/click");
  });
});
