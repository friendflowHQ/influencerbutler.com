/**
 * Summary: Unit tests for the screenshot-to-Community-template builder: only a real
 *   image on a user turn is picked up, moderation must pass before anything is
 *   published, the vision spec is sent to the licensing worker with the shared
 *   secret and an opaque creator ref (never the image), the daily limit and a
 *   missing screenshot come back as friendly messages, and the kill switch works.
 * Dependencies: vitest, ../look-templates.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildLookTemplate, pickLatestImage } from "../look-templates";

const IMG = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;

function fakeFetch(opts: { flagged?: boolean; worker?: { status: number; body: unknown } } = {}) {
  const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, headers: (init?.headers || {}) as Record<string, string> });
    if (url.endsWith("/moderations")) return new Response(JSON.stringify({ results: [{ flagged: !!opts.flagged }] }), { status: 200 });
    if (url.endsWith("/chat/completions")) {
      const spec = { name: { "en-US": "Cream board" }, slots: [{ x: 0.1, y: 0.3, w: 0.3, h: 0.3 }, { x: 0.5, y: 0.3, w: 0.3, h: 0.3 }] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(spec) } }] }), { status: 200 });
    }
    if (url.endsWith("/community-templates")) {
      const w = opts.worker || { status: 200, body: { ok: true, template: { id: "ct_0123456789abcdef", name: { "en-US": "Cream board" }, category: "editorial" } } };
      return new Response(JSON.stringify(w.body), { status: w.status });
    }
    return new Response("{}", { status: 404 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.LICENSING_WORKER_SECRET = "s3cret";
  delete process.env.COMMUNITY_TEMPLATES_ENABLED;
});

describe("pickLatestImage", () => {
  it("takes the newest user image and ignores assistant turns and junk", () => {
    const other = `data:image/jpeg;base64,${Buffer.from("x").toString("base64")}`;
    expect(pickLatestImage([{ role: "user", images: [other] }, { role: "assistant", images: [IMG] }])).toBe(other);
    expect(pickLatestImage([{ role: "user", images: [other] }, { role: "user", images: [IMG] }])).toBe(IMG);
    expect(pickLatestImage([{ role: "user", images: ["https://x/y.png"] }])).toBeNull();
    expect(pickLatestImage(null)).toBeNull();
  });
});

describe("buildLookTemplate", () => {
  it("moderates, extracts, and publishes with the secret and an opaque creator ref", async () => {
    const { impl, calls } = fakeFetch();
    const r = await buildLookTemplate({ butler: "collage", image: IMG, userId: "user-42" }, impl);
    expect(r.ok).toBe(true);
    expect(r.template).toMatchObject({ id: "ct_0123456789abcdef", butler: "collage", name: "Cream board" });
    const publish = calls.find((c) => c.url.endsWith("/community-templates"))!;
    expect(publish.headers["x-ib-worker-secret"]).toBe("s3cret");
    const body = publish.body as { spec: Record<string, unknown>; creatorRef: string };
    expect(body.spec.butler).toBe("collage");
    expect(JSON.stringify(body)).not.toContain("png-bytes");
    expect(body.creatorRef).toMatch(/^u:[0-9a-f]{40}$/);
    expect(body.creatorRef).not.toContain("user-42");
  });

  it("never publishes a flagged image", async () => {
    const { impl, calls } = fakeFetch({ flagged: true });
    const r = await buildLookTemplate({ butler: "fashion", image: IMG, userId: "u" }, impl);
    expect(r.error).toBe("rejected");
    expect(calls.some((c) => c.url.endsWith("/community-templates"))).toBe(false);
  });

  it("explains a missing screenshot, an unclear butler and the daily limit", async () => {
    const { impl } = fakeFetch({ worker: { status: 429, body: { ok: false, error: "daily_limit" } } });
    expect((await buildLookTemplate({ butler: "collage", image: null, userId: "u" }, impl)).error).toBe("no_image");
    expect((await buildLookTemplate({ butler: "deals", image: IMG, userId: "u" }, impl)).error).toBe("bad_butler");
    expect((await buildLookTemplate({ butler: "collage", image: IMG, userId: "u" }, impl)).error).toBe("daily_limit");
  });

  it("kill switch", async () => {
    process.env.COMMUNITY_TEMPLATES_ENABLED = "0";
    const { impl, calls } = fakeFetch();
    expect((await buildLookTemplate({ butler: "collage", image: IMG, userId: "u" }, impl)).error).toBe("disabled");
    expect(calls).toHaveLength(0);
  });
});
