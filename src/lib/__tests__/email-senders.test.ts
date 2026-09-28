/**
 * Summary: Unit tests for the per-stream sender/key resolver (src/lib/email-senders).
 * Covers the env-backed "from" addresses, the transactional-vs-marketing API key
 * selection, and the cold-stream pause gate. Pure env reads, so each test sets and
 * restores the relevant process.env keys.
 * Dependencies: vitest, ../email-senders.
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  DEFAULT_BRAND_FROM,
  transactionalFrom,
  lifecycleFrom,
  coldFrom,
  coldStreamEnabled,
  fromForStream,
  resendKeyFor,
} from "../email-senders";

const KEYS = [
  "EMAIL_FROM_TRANSACTIONAL",
  "EMAIL_FROM_LIFECYCLE",
  "EMAIL_FROM_COLD",
  "RESEND_API_KEY",
  "RESEND_API_KEY_TRANSACTIONAL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sender addresses", () => {
  it("default to the brand sender when no env is set", () => {
    expect(transactionalFrom()).toBe(DEFAULT_BRAND_FROM);
    expect(lifecycleFrom()).toBe(DEFAULT_BRAND_FROM);
  });

  it("prefer their env override when set", () => {
    process.env.EMAIL_FROM_TRANSACTIONAL = "IB <mail@mail.influencerbutler.com>";
    process.env.EMAIL_FROM_LIFECYCLE = "IB <hello@influencerbutler.com>";
    expect(transactionalFrom()).toBe("IB <mail@mail.influencerbutler.com>");
    expect(lifecycleFrom()).toBe("IB <hello@influencerbutler.com>");
  });

  it("fromForStream routes each stream to its sender", () => {
    process.env.EMAIL_FROM_TRANSACTIONAL = "T <t@x.com>";
    process.env.EMAIL_FROM_LIFECYCLE = "L <l@x.com>";
    process.env.EMAIL_FROM_COLD = "C <c@cold.com>";
    expect(fromForStream("transactional")).toBe("T <t@x.com>");
    expect(fromForStream("lifecycle")).toBe("L <l@x.com>");
    expect(fromForStream("cold")).toBe("C <c@cold.com>");
  });
});

describe("cold stream pause gate", () => {
  it("is disabled and empty when EMAIL_FROM_COLD is unset", () => {
    expect(coldFrom()).toBe("");
    expect(coldStreamEnabled()).toBe(false);
  });

  it("is disabled when EMAIL_FROM_COLD is only whitespace", () => {
    process.env.EMAIL_FROM_COLD = "   ";
    expect(coldStreamEnabled()).toBe(false);
  });

  it("is enabled once a cold sender is configured", () => {
    process.env.EMAIL_FROM_COLD = "Posse <hi@thesocialmediaposse.com>";
    expect(coldStreamEnabled()).toBe(true);
    expect(coldFrom()).toBe("Posse <hi@thesocialmediaposse.com>");
  });
});

describe("resendKeyFor", () => {
  it("transactional uses the dedicated key when set", () => {
    process.env.RESEND_API_KEY = "re_main";
    process.env.RESEND_API_KEY_TRANSACTIONAL = "re_txn";
    expect(resendKeyFor("transactional")).toBe("re_txn");
  });

  it("transactional falls back to the main key when no dedicated key", () => {
    process.env.RESEND_API_KEY = "re_main";
    expect(resendKeyFor("transactional")).toBe("re_main");
  });

  it("lifecycle and cold always use the main key", () => {
    process.env.RESEND_API_KEY = "re_main";
    process.env.RESEND_API_KEY_TRANSACTIONAL = "re_txn";
    expect(resendKeyFor("lifecycle")).toBe("re_main");
    expect(resendKeyFor("cold")).toBe("re_main");
  });

  it("returns undefined when no key is configured at all", () => {
    expect(resendKeyFor("transactional")).toBeUndefined();
    expect(resendKeyFor("lifecycle")).toBeUndefined();
  });
});
