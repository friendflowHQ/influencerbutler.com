/**
 * Summary: constant-time secret checks fail closed and match only the exact secret.
 * Dependencies: vitest, ../auth-secret.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyBearer, verifySecretHeader, safeEqual } from "../auth-secret";

const env = process.env as Record<string, string | undefined>;

function req(headers: Record<string, string>) {
  return new Request("https://example.test/api/cron/x", { headers });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  env.TEST_CRON_SECRET = "s3cret-value";
});
afterEach(() => {
  delete env.TEST_CRON_SECRET;
  vi.restoreAllMocks();
});

describe("verifyBearer", () => {
  it("accepts the exact bearer secret", () => {
    expect(verifyBearer(req({ authorization: "Bearer s3cret-value" }), "TEST_CRON_SECRET")).toBe(true);
  });
  it("rejects wrong, prefix, longer, empty and non-bearer values", () => {
    for (const h of ["Bearer s3cret-valu", "Bearer s3cret-value2", "Bearer ", "Bearer", "Basic s3cret-value", "s3cret-value", ""]) {
      expect(verifyBearer(req(h ? { authorization: h } : {}), "TEST_CRON_SECRET")).toBe(false);
    }
  });
  it("fails closed when the env var is unset or empty", () => {
    delete env.TEST_CRON_SECRET;
    expect(verifyBearer(req({ authorization: "Bearer " }), "TEST_CRON_SECRET")).toBe(false);
    expect(verifyBearer(req({ authorization: "Bearer undefined" }), "TEST_CRON_SECRET")).toBe(false);
    env.TEST_CRON_SECRET = "";
    expect(verifyBearer(req({ authorization: "Bearer " }), "TEST_CRON_SECRET")).toBe(false);
  });
});

describe("verifySecretHeader", () => {
  it("matches a custom header and fails closed", () => {
    expect(verifySecretHeader(req({ "x-cron-secret": "s3cret-value" }), "x-cron-secret", "TEST_CRON_SECRET")).toBe(true);
    expect(verifySecretHeader(req({ "x-cron-secret": "nope" }), "x-cron-secret", "TEST_CRON_SECRET")).toBe(false);
    expect(verifySecretHeader(req({}), "x-cron-secret", "TEST_CRON_SECRET")).toBe(false);
    delete env.TEST_CRON_SECRET;
    expect(verifySecretHeader(req({ "x-cron-secret": "" }), "x-cron-secret", "TEST_CRON_SECRET")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares strings of differing length without throwing", () => {
    expect(safeEqual("a", "abc")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
  });
});
