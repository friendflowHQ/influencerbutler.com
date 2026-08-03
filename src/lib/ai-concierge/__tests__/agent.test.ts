/**
 * Summary: Unit tests for the Butler AI agent core - persona guardrails, the
 *   search_help retrieval ranking (over a mocked tutorial index), and the tool
 *   executor's routing/auth behavior.
 * Dependencies: vitest, ../agent, @/lib/tutorials (mocked).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/tutorials", () => ({
  loadSearchIndex: vi.fn(async () => [
    {
      id: "goldmine-butler",
      title: "Goldmine Butler setup",
      category: "Amazon",
      summary: "Find brands paying creators",
      text: "Goldmine Butler scans other creators' storefronts for ad posts and lists brand names and ASINs. To set up Goldmine, open the workspace and enter keywords.",
    },
    {
      id: "instagram-butler",
      title: "Instagram Butler",
      category: "Instagram",
      summary: "DM outreach",
      text: "Instagram Butler sends DMs with safe pacing and follow-ups.",
    },
  ]),
}));

import { buildInstructions, searchHelp, executeAgentTool, toChatTools, toRealtimeTools, AGENT_TOOLS } from "../agent";

describe("buildInstructions", () => {
  it("carries the persona and guardrails", () => {
    const s = buildInstructions();
    expect(s).toContain("Butler AI");
    expect(s).toContain("butlers");
    expect(s.toLowerCase()).toContain("do not use em-dashes");
    expect(s).toContain("/dashboard/book");
    // The prompt itself must not contain an em-dash.
    expect(s).not.toContain("—");
  });
});

describe("searchHelp", () => {
  it("ranks the matching tutorial first with a snippet + url", async () => {
    const hits = await searchHelp("how do I set up goldmine");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe("goldmine-butler");
    expect(hits[0].url).toContain("/help/tutorials/goldmine-butler");
    expect(hits[0].snippet.length).toBeGreaterThan(0);
  });

  it("returns nothing for a too-short or no-match query", async () => {
    expect(await searchHelp("zz")).toEqual([]);
  });
});

describe("executeAgentTool", () => {
  it("routes search_help to the retriever", async () => {
    const r = (await executeAgentTool("search_help", { query: "goldmine" }, null)) as { results: unknown[] };
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
  });

  it("offer_human_call returns the booking url", async () => {
    const r = (await executeAgentTool("offer_human_call", {}, null)) as { bookUrl: string };
    expect(r.bookUrl).toContain("/dashboard/book");
  });

  it("get_subscription requires sign-in", async () => {
    const r = (await executeAgentTool("get_subscription", {}, null)) as { error: string };
    expect(r.error).toMatch(/not signed in/i);
  });

  it("unknown tool returns an error", async () => {
    const r = (await executeAgentTool("nope", {}, null)) as { error: string };
    expect(r.error).toMatch(/unknown/i);
  });
});

describe("tool schemas", () => {
  it("exposes search_help in both chat and realtime shapes", () => {
    expect(AGENT_TOOLS.find((t) => t.name === "search_help")).toBeTruthy();
    expect(toChatTools()[0]).toHaveProperty("function.name");
    expect(toRealtimeTools()[0]).toHaveProperty("name");
  });
});
