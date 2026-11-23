import { describe, expect, it } from "vitest";
import { CALL_TOPICS } from "@/lib/call-topics";
import { checkCallPrereqs, prereqsFor } from "@/lib/call-prerequisites";
import {
  SNAPSHOT_MAX_AGE_MS,
  TOPIC_SETUP,
  sanitizeSnapshot,
  setupNotDoneMessage,
  setupVerifyEnabled,
  verifiedPrereqIds,
  verifySetup,
  type SetupSnapshot,
} from "@/lib/setup-snapshot";

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const TRIED = "I followed the steps in the guide and the photos still did not load into the clone.";

function snap(butlers: SetupSnapshot["butlers"], at = new Date(NOW - 60_000).toISOString()): SetupSnapshot {
  return { v: 1, at, requiredDone: 0, requiredTotal: 0, line: "", butlers };
}
const done = { done: 1, total: 1, missing: [] };
const lacks = (id: string, label: string) => ({ done: 0, total: 1, missing: [{ id, label }] });

describe("TOPIC_SETUP table", () => {
  it("only names real topics and real checklist items", () => {
    const topicKeys = new Set(CALL_TOPICS.map((t) => t.key));
    for (const [topic, items] of Object.entries(TOPIC_SETUP)) {
      expect(topicKeys.has(topic)).toBe(true);
      const real = new Set(prereqsFor([topic], "support").map((p) => p.id));
      for (const [itemId, butlers] of Object.entries(items)) {
        expect(real.has(itemId)).toBe(true);
        expect(butlers.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("sanitizeSnapshot", () => {
  it("keeps the bounded shape and drops everything else", () => {
    const out = sanitizeSnapshot({
      v: 1, at: new Date(NOW).toISOString(), extra: "x", apiKey: "sk-proj-ABCDEF1234567890abcdef1234567890",
      butlers: { deals: { done: 1, total: 3, secret: "x", missing: [{ id: "destinations", label: "Turn on a place to post", value: "v" }, { id: "searchReady", label: "Add keywords" }] } },
    }, NOW)!;
    expect(out.butlers.deals).toEqual({ done: 1, total: 3, missing: [{ id: "destinations", label: "Turn on a place to post" }, { id: "searchReady", label: "Add keywords" }] });
    expect(out.requiredDone).toBe(1);
    expect(out.requiredTotal).toBe(3);
    expect(JSON.stringify(out)).not.toMatch(/sk-proj|secret|apiKey/);
  });

  it("scrubs emails, links and tokens out of labels, and drops unsafe ids", () => {
    const out = sanitizeSnapshot({
      butlers: {
        "https://evil.example/x": done,
        deals: { done: 0, total: 2, missing: [
          { id: "a", label: "Sign in me@example.com https://www.amazon.com/shop/x?tag=abc-20 sk-proj-ABCDEF1234567890abcdef1234567890" },
          { id: "not an id!", label: "dropped" },
        ] },
      },
    }, NOW)!;
    const blob = JSON.stringify(out);
    expect(blob).not.toMatch(/example\.com|https?:\/\/|sk-proj|evil|dropped/);
    expect(out.butlers.deals.missing).toHaveLength(1);
  });

  it("done can never exceed what the missing steps leave", () => {
    const out = sanitizeSnapshot({ butlers: { deals: { done: 9, total: 2, missing: [{ id: "a", label: "A" }] } } }, NOW)!;
    expect(out.butlers.deals.done).toBe(1);
  });

  it("rejects unusable bodies and never trusts a future timestamp", () => {
    for (const bad of [null, "x", [], {}, { butlers: {} }, { butlers: [] }, { butlers: { deals: { total: 0 } } }]) expect(sanitizeSnapshot(bad, NOW)).toBeNull();
    const out = sanitizeSnapshot({ at: "2999-01-01T00:00:00Z", butlers: { deals: done } }, NOW)!;
    expect(Date.parse(out.at)).toBeLessThanOrEqual(NOW);
  });
});

describe("verifySetup", () => {
  const verify = (topics: string[], butlers: SetupSnapshot["butlers"] | null, extra: { updatedAt?: string; type?: "support" | "demo" } = {}) =>
    verifySetup({ topics, type: extra.type ?? "support", snapshot: butlers ? snap(butlers) : null, updatedAt: extra.updatedAt, now: NOW });
  const state = (v: ReturnType<typeof verify>, id: string) => v.items.find((i) => i.prereqId === id)!;

  it("marks a finished butler verified and a missing one missing with the exact steps", () => {
    const v = verify(["deals-butler", "ai-influencer"], { deals: done, "ai-clone-butler": lacks("openai", "Connect your OpenAI key") });
    expect(v.hasSnapshot).toBe(true);
    expect(state(v, "deals-butler.guide").state).toBe("verified");
    const key = state(v, "ai-influencer.key");
    expect(key.state).toBe("missing");
    expect(key.missing).toEqual([{ butlerId: "ai-clone-butler", id: "openai", label: "Connect your OpenAI key" }]);
    expect(verifiedPrereqIds(v)).toEqual(["deals-butler.guide"]);
  });

  it("leaves items the app cannot prove as unknown, even with a snapshot", () => {
    const v = verify(["ai-influencer"], { "ai-clone-butler": done });
    expect(state(v, "ai-influencer.photos").state).toBe("unknown");
    expect(state(v, "ai-influencer.guide").state).toBe("unknown");
    expect(state(v, "general.computer").state).toBe("unknown");
    expect(state(v, "ai-influencer.key").state).toBe("verified");
  });

  it("falls back to unknown with no snapshot, a stale one, or a butler the app did not report", () => {
    expect(verify(["deals-butler"], null).items.every((i) => i.state === "unknown")).toBe(true);
    const stale = verify(["deals-butler"], { deals: lacks("a", "A") }, { updatedAt: new Date(NOW - SNAPSHOT_MAX_AGE_MS - 1000).toISOString() });
    expect(stale.hasSnapshot).toBe(false);
    expect(stale.items.every((i) => i.state === "unknown")).toBe(true);
    expect(state(verify(["deals-butler"], { instagram: done }), "deals-butler.guide").state).toBe("unknown");
  });

  it("a multi-butler item is verified only when every butler is reported done, missing as soon as one lacks a step", () => {
    expect(state(verify(["amazon"], { storefrontbutler: done, "cc-check": done, amazonbutler: done }), "amazon.checklist").state).toBe("verified");
    expect(state(verify(["amazon"], { storefrontbutler: done }), "amazon.checklist").state).toBe("unknown");
    const m = state(verify(["amazon"], { storefrontbutler: done, "cc-check": lacks("login", "Sign in to Amazon") }), "amazon.checklist");
    expect(m.state).toBe("missing");
    expect(m.missing[0].butlerId).toBe("cc-check");
  });

  it("builds a refusal that names the missing steps", () => {
    const v = verify(["amazon"], { storefrontbutler: lacks("login", "Sign in to Amazon"), "cc-check": lacks("storefrontHarvest", "Scan your Amazon storefront first") });
    const msg = setupNotDoneMessage(v);
    expect(msg).toContain("Sign in to Amazon");
    expect(msg).toContain("Scan your Amazon storefront first");
    expect(msg).toMatch(/Setup Checklist/);
  });

  it("honors the kill switch", () => {
    expect(setupVerifyEnabled({})).toBe(true);
    expect(setupVerifyEnabled({ CALL_SETUP_VERIFY: "0" })).toBe(false);
  });
});

describe("verified items and the checkbox gate", () => {
  const base = { type: "support" as const, topics: ["deals-butler"], viaWebsite: true, required: true };
  const need = prereqsFor(["deals-butler"], "support").map((p) => p.id);

  it("an app-verified item needs no tick, the rest still do", () => {
    const rest = need.filter((id) => id !== "deals-butler.guide");
    expect(checkCallPrereqs({ ...base, raw: { ack: rest, tried: TRIED }, verified: ["deals-butler.guide"] }).ok).toBe(true);
    const v = checkCallPrereqs({ ...base, raw: { ack: [], tried: TRIED }, verified: ["deals-butler.guide"] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.missing).toEqual(rest);
  });

  it("without verification the old rule is unchanged", () => {
    expect(checkCallPrereqs({ ...base, raw: { ack: need.slice(1), tried: TRIED } }).ok).toBe(false);
  });
});
