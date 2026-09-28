/**
 * Summary: Unit tests for submitSupportTicket (feedback worker /submit intake).
 * Dependencies: vitest, ../support-worker. The worker fetch is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitSupportTicket } from "../support-worker";

describe("submitSupportTicket", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.FEEDBACK_SHARED_KEY;
    delete process.env.FEEDBACK_WORKER_URL;
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  function stubOk(id = "fb-00000000-0000-0000-0000-000000000000") {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, id }) });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts to the default worker /submit and returns the ticket id", async () => {
    const fetchMock = stubOk("fb-abc");
    const res = await submitSupportTicket({ type: "bug", title: "Export broke", description: "details" });
    expect(res).toEqual({ ok: true, id: "fb-abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://feedback.influencerbutler.com/submit");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("bug");
    expect(body.title).toBe("Export broke");
    expect(body.platform).toBe("call-notes");
    expect(typeof body.submittedAt).toBe("string");
  });

  it("omits x-ib-key unless FEEDBACK_SHARED_KEY is set", async () => {
    const noKey = stubOk();
    await submitSupportTicket({ type: "bug", title: "t", description: "d" });
    expect(noKey.mock.calls[0][1].headers["x-ib-key"]).toBeUndefined();

    vi.unstubAllGlobals();
    process.env.FEEDBACK_SHARED_KEY = "secret";
    const withKey = stubOk();
    await submitSupportTicket({ type: "bug", title: "t", description: "d" });
    expect(withKey.mock.calls[0][1].headers["x-ib-key"]).toBe("secret");
  });

  it("honors FEEDBACK_WORKER_URL and normalizes a trailing slash", async () => {
    process.env.FEEDBACK_WORKER_URL = "https://staging.example.com/";
    const fetchMock = stubOk();
    await submitSupportTicket({ type: "feature", title: "t", description: "d" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://staging.example.com/submit");
  });

  it("returns {ok:false} without calling fetch when the title is blank", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await submitSupportTicket({ type: "bug", title: "   ", description: "d" })).toEqual({ ok: false, id: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns {ok:false} on a worker error and does not throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ ok: false }) }));
    expect(await submitSupportTicket({ type: "bug", title: "t", description: "d" })).toEqual({ ok: false, id: null });

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await submitSupportTicket({ type: "bug", title: "t", description: "d" })).toEqual({ ok: false, id: null });
  });
});
