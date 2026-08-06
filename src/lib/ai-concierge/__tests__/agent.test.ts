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
      images: [
        { src: "/assets/tutorials/goldmine/setup.png", alt: "The Goldmine setup screen" },
      ],
    },
    {
      id: "instagram-butler",
      title: "Instagram Butler",
      category: "Instagram",
      summary: "DM outreach",
      text: "Instagram Butler sends DMs with safe pacing and follow-ups.",
      images: [],
    },
  ]),
}));

import {
  buildInstructions,
  searchHelp,
  executeAgentTool,
  extractReplyImages,
  toChatTools,
  toRealtimeTools,
  AGENT_TOOLS,
} from "../agent";

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

  it("includes the left-menu map and directional guidance", () => {
    const s = buildInstructions();
    expect(s).toContain("left menu");
    expect(s).toContain("API Integrations");
    expect(s).toContain("Instagram Goldmine");
    expect(s).toContain("exact click path");
  });

  it("instructs the confirm-first feedback flow", () => {
    const s = buildInstructions();
    expect(s).toContain("submit_feedback");
    expect(s.toLowerCase()).toContain("after the user");
  });
});

describe("extractReplyImages", () => {
  it("lifts /assets/ markdown images out of the reply text", () => {
    const { text, images } = extractReplyImages(
      "Click API Integrations in the left menu.\n\n![The setup screen](/assets/tutorials/goldmine/setup.png)",
    );
    expect(text).toBe("Click API Integrations in the left menu.");
    expect(images).toEqual([
      { url: "https://www.influencerbutler.com/assets/tutorials/goldmine/setup.png", alt: "The setup screen" },
    ]);
  });

  it("accepts absolute site urls and drops everything else", () => {
    const { text, images } = extractReplyImages(
      "See ![a](https://www.influencerbutler.com/assets/x.png) and ![b](https://evil.example.com/x.png).",
    );
    expect(images).toEqual([{ url: "https://www.influencerbutler.com/assets/x.png", alt: "a" }]);
    expect(text).not.toContain("evil.example.com/x.png)");
  });

  it("dedupes and caps images", () => {
    const md = Array.from({ length: 6 }, (_, i) => `![s](/assets/${i % 5}.png)`).join("\n");
    const { images } = extractReplyImages(md);
    expect(images.length).toBeLessThanOrEqual(4);
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

  it("surfaces tutorial screenshots as absolute urls", async () => {
    const hits = await searchHelp("how do I set up goldmine");
    expect(hits[0].images).toEqual([
      {
        url: "https://www.influencerbutler.com/assets/tutorials/goldmine/setup.png",
        alt: "The Goldmine setup screen",
      },
    ]);
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

  it("submit_feedback works without a shared key and omits the x-ib-key header", async () => {
    // The deployed worker only enforces x-ib-key when it has FEEDBACK_SHARED_KEY
    // set (today it does not), so the website side must not hard-require it.
    const prev = process.env.FEEDBACK_SHARED_KEY;
    delete process.env.FEEDBACK_SHARED_KEY;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, id: "fb-nokey" }), { status: 200 }));
    try {
      const r = (await executeAgentTool(
        "submit_feedback",
        { type: "bug", title: "It broke", description: "Details" },
        null,
      )) as { ok: boolean; id: string };
      expect(r.ok).toBe(true);
      expect(r.id).toBe("fb-nokey");
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.headers as Record<string, string>).not.toHaveProperty("x-ib-key");
    } finally {
      fetchSpy.mockRestore();
      if (prev !== undefined) process.env.FEEDBACK_SHARED_KEY = prev;
    }
  });

  it("submit_feedback posts to the worker with the shared key and user email", async () => {
    const prevKey = process.env.FEEDBACK_SHARED_KEY;
    process.env.FEEDBACK_SHARED_KEY = "test-shared-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, id: "fb-123" }), { status: 200 }));
    try {
      const r = (await executeAgentTool(
        "submit_feedback",
        { type: "feature", title: "Add dark mode", description: "Please" },
        { userId: "u1", email: "user@example.com", source: "license" },
        { surface: "desktop", appVersion: "1.0.58", platform: "win32" },
      )) as { ok: boolean; id: string };
      expect(r.ok).toBe(true);
      expect(r.id).toBe("fb-123");
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/submit");
      expect((init.headers as Record<string, string>)["x-ib-key"]).toBe("test-shared-key");
      const body = JSON.parse(String(init.body));
      expect(body.type).toBe("feature");
      expect(body.userEmail).toBe("user@example.com");
      expect(body.appVersion).toBe("1.0.58");
      expect(body.description).toContain("[Filed via Butler AI chat (desktop)]");
    } finally {
      fetchSpy.mockRestore();
      if (prevKey !== undefined) process.env.FEEDBACK_SHARED_KEY = prevKey;
      else delete process.env.FEEDBACK_SHARED_KEY;
    }
  });
});

describe("tool schemas", () => {
  it("exposes search_help in both chat and realtime shapes", () => {
    expect(AGENT_TOOLS.find((t) => t.name === "search_help")).toBeTruthy();
    expect(toChatTools()[0]).toHaveProperty("function.name");
    expect(toRealtimeTools()[0]).toHaveProperty("name");
  });

  it("exposes submit_feedback with the confirm-first contract", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "submit_feedback");
    expect(tool).toBeTruthy();
    expect(tool?.description).toMatch(/explicit yes/i);
    const props = (tool?.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(["description", "title", "type"]);
  });
});
