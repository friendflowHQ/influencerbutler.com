/**
 * Summary: Turnstile verification fails closed in production when unconfigured.
 * Dependencies: vitest, ../turnstile.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "../turnstile";

const env = process.env as Record<string, string | undefined>;
const saved = { ...env };

beforeEach(() => {
  delete env.TURNSTILE_SECRET_KEY;
  delete env.TURNSTILE_ALLOW_UNCONFIGURED;
});
afterEach(() => {
  for (const k of Object.keys(env)) if (!(k in saved)) delete env[k];
  Object.assign(env, saved);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("fails closed in production when the secret is unset", async () => {
    env.NODE_ENV = "production";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile("tok")).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("passes outside production when the secret is unset", async () => {
    env.NODE_ENV = "development";
    expect((await verifyTurnstile("")).ok).toBe(true);
  });

  it("honours the explicit owner override in production", async () => {
    env.NODE_ENV = "production";
    env.TURNSTILE_ALLOW_UNCONFIGURED = "1";
    expect((await verifyTurnstile("")).ok).toBe(true);
  });

  it("requires a token when configured", async () => {
    env.TURNSTILE_SECRET_KEY = "s";
    expect(await verifyTurnstile("")).toEqual({ ok: false, reason: "missing_token" });
  });

  it("accepts a token Cloudflare approves and rejects one it does not", async () => {
    env.TURNSTILE_SECRET_KEY = "s";
    const fetchMock = vi.fn().mockResolvedValueOnce({ json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ json: async () => ({ success: false }) });
    vi.stubGlobal("fetch", fetchMock);
    expect((await verifyTurnstile("good", "1.2.3.4")).ok).toBe(true);
    expect(await verifyTurnstile("bad")).toEqual({ ok: false, reason: "rejected" });
  });
});
