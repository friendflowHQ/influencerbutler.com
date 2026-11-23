import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CALL_TOPICS } from "@/lib/call-topics";
import {
  CALL_PREREQ_CODE,
  TRIED_MIN_CHARS,
  callPrepEmailLines,
  callPrereqsRequired,
  checkCallPrereqs,
  prereqsFor,
  summarizeCallPrereqs,
  topicKeysFromText,
} from "@/lib/call-prerequisites";

const TRIED = "I followed the steps in the guide and the photos still did not load into the clone.";

function allIds(topics: string[], type: "support" | "demo") {
  return prereqsFor(topics, type).map((p) => p.id);
}

describe("prereqsFor", () => {
  it("asks everyone to be at the computer, and troubleshooting callers to have tried the AI", () => {
    expect(allIds(["instagram"], "support")).toEqual(["general.computer", "general.ai", "instagram.guide"]);
    expect(allIds(["instagram"], "demo")).toEqual(["general.computer", "instagram.guide"]);
  });

  it("makes the AI clone caller have photos ready before the call", () => {
    const items = prereqsFor(["ai-influencer"], "demo");
    expect(items.map((p) => p.id)).toContain("ai-influencer.photos");
    expect(items.find((p) => p.id === "ai-influencer.photos")!.text).toContain("BEFORE the call");
  });

  it("asks nothing for a billing-only call, and de-duplicates across topics", () => {
    expect(prereqsFor(["billing"], "support")).toEqual([]);
    const ids = allIds(["facebook-deals", "deals-butler"], "support");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still asks the general items when no topic is picked yet", () => {
    expect(allIds([], "support")).toEqual(["general.computer", "general.ai"]);
  });

  it("ignores unknown topic keys", () => {
    expect(allIds(["nope"], "demo")).toEqual(["general.computer"]);
  });
});

describe("checkCallPrereqs", () => {
  const base = { type: "support" as const, topics: ["ai-influencer"], viaWebsite: true, required: true };
  const need = prereqsFor(["ai-influencer"], "support").map((p) => p.id);

  it("refuses a booking with nothing confirmed", () => {
    const v = checkCallPrereqs({ ...base, raw: undefined });
    expect(v).toMatchObject({ ok: false, status: 422, code: CALL_PREREQ_CODE });
    if (!v.ok) expect(v.missing).toEqual(need);
  });

  it("refuses when one box is missing", () => {
    const v = checkCallPrereqs({ ...base, raw: { ack: need.slice(1), tried: TRIED } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.missing).toEqual([need[0]]);
  });

  it("refuses an empty or too-short 'what I tried'", () => {
    expect(checkCallPrereqs({ ...base, raw: { ack: need, tried: "" } }).ok).toBe(false);
    expect(checkCallPrereqs({ ...base, raw: { ack: need, tried: "x".repeat(TRIED_MIN_CHARS.support - 1) } }).ok).toBe(false);
  });

  it("accepts a complete answer and returns it cleaned", () => {
    const v = checkCallPrereqs({ ...base, raw: { ack: [...need, 42, "  "], tried: `  ${TRIED}  ` } });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.tried).toBe(TRIED);
  });

  it("accepts a billing-only call with no answers", () => {
    expect(checkCallPrereqs({ ...base, topics: ["billing"], raw: undefined }).ok).toBe(true);
  });

  it("skips app, extension and phone bookings and honors the kill switch", () => {
    expect(checkCallPrereqs({ ...base, viaWebsite: false, raw: undefined }).ok).toBe(true);
    expect(checkCallPrereqs({ ...base, required: false, raw: undefined }).ok).toBe(true);
    expect(callPrereqsRequired({ CALL_PREREQS_REQUIRED: "0" })).toBe(false);
    expect(callPrereqsRequired({})).toBe(true);
  });
});

describe("summary and topic recovery", () => {
  it("stores what the customer confirmed and tried for the owner, and the topic keys round-trip", () => {
    const ack = prereqsFor(["ai-influencer"], "support").map((p) => p.id);
    const s = summarizeCallPrereqs({ type: "support", topics: ["ai-influencer"], ack, tried: TRIED });
    expect(s).toContain("[Booking prep]");
    expect(s).toContain("Already tried: " + TRIED);
    expect(s).toContain("photos");
    expect(topicKeysFromText("Please help" + s)).toEqual(["ai-influencer"]);
  });

  it("falls back to keyword guessing for older bookings", () => {
    expect(topicKeysFromText("my Instagram will not connect")).toEqual(["instagram"]);
    expect(topicKeysFromText("")).toEqual([]);
  });
});

describe("callPrepEmailLines", () => {
  it("is empty until CALL_PREP_EMAIL=1, unless forced by the one-off notice", () => {
    expect(callPrepEmailLines({ type: "support", topics: ["instagram"], env: {} })).toEqual([]);
    const on = callPrepEmailLines({ type: "support", topics: ["instagram"], env: { CALL_PREP_EMAIL: "1" } }).join("\n");
    expect(on).toContain("Setup Checklist");
    expect(on).toContain("First-run walkthrough");
    expect(on).toContain("/help/tutorials/instagram");
    expect(callPrepEmailLines({ type: "support", topics: ["instagram"], force: true, env: {} }).length).toBeGreaterThan(0);
  });

  it("reads the topics back out of a stored booking when the chips are not passed", () => {
    const stored = "x" + summarizeCallPrereqs({ type: "demo", topics: ["ai-influencer"], ack: [], tried: "" });
    const text = callPrepEmailLines({ type: "demo", topicText: stored, force: true, env: {} }).join("\n");
    expect(text).toContain("photos");
  });
});

describe("content guards", () => {
  const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content/tutorials/_index.json"), "utf8")) as { tutorials?: { id: string }[] } | { id: string }[];
  const ids = new Set((Array.isArray(index) ? index : index.tutorials ?? []).map((t) => t.id));

  it("every guide a checklist links to is a real tutorial", () => {
    const slugs = CALL_TOPICS.flatMap((t) => prereqsFor([t.key], "support")).flatMap((p) => (p.helpSlug ? [p.helpSlug] : []));
    expect(slugs.length).toBeGreaterThan(5);
    for (const s of slugs) expect(ids.has(s), `missing tutorial ${s}`).toBe(true);
  });

  it("uses no em-dashes in any checklist text", () => {
    for (const t of CALL_TOPICS) for (const p of prereqsFor([t.key], "support")) expect(p.text).not.toContain("—");
  });
});
