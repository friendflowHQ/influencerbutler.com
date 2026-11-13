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
  priceLockSender,
  MAIN_FROM,
  COLD_FROM,
  PRICE_LOCK_COLD_HELD,
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

describe("sender addresses (main for known people, subdomain for cold, 2026-11-13)", () => {
  it("transactional and lifecycle send from hello@influencerbutler.com", () => {
    expect(MAIN_FROM).toBe("Influencer Butler <hello@influencerbutler.com>");
    expect(DEFAULT_BRAND_FROM).toBe(MAIN_FROM);
    expect(transactionalFrom()).toBe(MAIN_FROM);
    expect(lifecycleFrom()).toBe(MAIN_FROM);
    expect(fromForStream("transactional")).toBe(MAIN_FROM);
    expect(fromForStream("lifecycle")).toBe(MAIN_FROM);
  });

  it("cold sends from the separate news. subdomain, never the main domain", () => {
    expect(coldFrom()).toBe(COLD_FROM);
    expect(fromForStream("cold")).toBe(COLD_FROM);
    expect(COLD_FROM).toMatch(/@news\.influencerbutler\.com>$/);
    expect(coldFrom()).not.toBe(MAIN_FROM);
  });

  it("ignores stale EMAIL_FROM_* env values (e.g. lifecycle on news.)", () => {
    process.env.EMAIL_FROM_TRANSACTIONAL = "T <t@x.com>";
    process.env.EMAIL_FROM_LIFECYCLE = "Influencer Butler <hello@news.influencerbutler.com>";
    process.env.EMAIL_FROM_COLD = "C <c@cold.com>";
    expect(transactionalFrom()).toBe(MAIN_FROM);
    expect(lifecycleFrom()).toBe(MAIN_FROM);
    expect(coldFrom()).toBe(COLD_FROM);
  });

  it("the cold stream has its own sender, so it is not paused for lack of one", () => {
    expect(coldStreamEnabled()).toBe(true);
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

describe("priceLockSender", () => {
  it("sends A-D from the main address on the transactional stream", () => {
    process.env.EMAIL_FROM_LIFECYCLE = "Influencer Butler <hello@news.influencerbutler.com>";
    for (const segs of [["A"], ["B"], ["C"], ["D"], ["A", "D"]]) {
      expect(priceLockSender(segs)).toEqual({ from: MAIN_FROM, stream: "transactional" });
    }
  });

  it("holds cold E1-E3 until the owner approves the deliverability fixes", () => {
    expect(PRICE_LOCK_COLD_HELD).toBe(true);
    expect(priceLockSender(["E1"])).toBeNull();
    expect(priceLockSender(["E2"])).toBeNull();
    expect(priceLockSender(["E3"])).toBeNull();
  });
});
