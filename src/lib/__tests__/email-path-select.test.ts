import { beforeAll, describe, expect, it } from "vitest";
import {
  PATH_TAGS,
  isFunnelPath,
  pathSelectToken,
  pathSelectUrl,
  personalizePathBody,
  verifyPathSelectToken,
} from "../email-path-select";

// The token + URL helpers read the signing secret and site URL from the
// environment at call time, so set them before exercising the module.
beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-for-email-path-select";
  process.env.SITE_URL = "https://www.influencerbutler.com";
});

describe("pathSelectToken / verifyPathSelectToken", () => {
  it("verifies a token it produced, case/whitespace-insensitive on the email", () => {
    const token = pathSelectToken("Creator@Example.com", "beginner");
    expect(token).not.toBe("");
    expect(verifyPathSelectToken("  creator@example.com  ", "beginner", token)).toBe(true);
  });

  it("rejects a token issued for a different address", () => {
    const token = pathSelectToken("a@example.com", "beginner");
    expect(verifyPathSelectToken("b@example.com", "beginner", token)).toBe(false);
  });

  it("rejects a beginner token replayed as the creator path", () => {
    const token = pathSelectToken("a@example.com", "beginner");
    expect(verifyPathSelectToken("a@example.com", "creator", token)).toBe(false);
  });

  it("rejects an empty or garbage token", () => {
    expect(verifyPathSelectToken("a@example.com", "beginner", "")).toBe(false);
    expect(verifyPathSelectToken("a@example.com", "beginner", "not-a-real-token")).toBe(false);
  });

  it("is distinct from a plain unsubscribe HMAC (purpose-scoped context)", async () => {
    const { unsubscribeToken } = await import("../email-unsubscribe");
    expect(pathSelectToken("a@example.com", "beginner")).not.toBe(unsubscribeToken("a@example.com"));
  });
});

describe("isFunnelPath", () => {
  it("accepts the two known paths and rejects anything else", () => {
    expect(isFunnelPath("beginner")).toBe(true);
    expect(isFunnelPath("creator")).toBe(true);
    expect(isFunnelPath("influencer")).toBe(false);
    expect(isFunnelPath("")).toBe(false);
  });
});

describe("personalizePathBody", () => {
  it("replaces both placeholders with this recipient's signed links", () => {
    const body = "Starting out? {{PATH_BEGINNER_URL}}\nGot followers? {{PATH_CREATOR_URL}}";
    const out = personalizePathBody(body, "creator@example.com");
    expect(out).toContain(pathSelectUrl("creator@example.com", "beginner"));
    expect(out).toContain(pathSelectUrl("creator@example.com", "creator"));
    expect(out).not.toContain("{{");
  });

  it("carries the recipient email and path through the link", () => {
    const out = personalizePathBody("{{PATH_BEGINNER_URL}}", "creator@example.com");
    expect(out).toContain("/api/email/path");
    expect(out).toContain("e=creator%40example.com");
    expect(out).toContain("p=beginner");
  });

  it("replaces every occurrence of a placeholder", () => {
    const body = "{{PATH_CREATOR_URL}} and again {{PATH_CREATOR_URL}}";
    const out = personalizePathBody(body, "creator@example.com");
    expect(out.split(pathSelectUrl("creator@example.com", "creator")).length).toBe(3);
  });

  it("returns the body untouched when there are no placeholders", () => {
    const body = "A normal drip step with no fork link.";
    expect(personalizePathBody(body, "creator@example.com")).toBe(body);
  });

  it("maps each path to its enroll tag", () => {
    expect(PATH_TAGS.beginner).toBe("ib-beginner");
    expect(PATH_TAGS.creator).toBe("ib-creator");
  });
});
