import { afterEach, describe, expect, it, vi } from "vitest";

import { listKnownIssues, upvoteKnownIssue, volunteerLogsForKnownIssue } from "./feedback";
import { DEFAULTS } from "../storage/schema";

// Minimal chrome stub mirroring feedback.test.ts's stubChrome: an empty
// storage.local (getState migrates to a fresh, signed-out state) plus a
// manifest version for the volunteer-logs body. A licenseKey is injected into
// a full DEFAULTS clone (not a bare partial) -- migrate() discards anything
// without a recognized schemaVersion and returns fresh defaults instead.
function stubChrome(opts: { licenseKey?: string; version?: string } = {}) {
  const backing: Record<string, unknown> = {
    ib: opts.licenseKey
      ? { ...structuredClone(DEFAULTS), auth: { ...DEFAULTS.auth, licenseKey: opts.licenseKey } }
      : {},
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key?: string) => (key ? { [key]: backing[key] } : backing)),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(backing, patch);
        }),
      },
    },
    runtime: { getManifest: () => ({ version: opts.version || "0.1.34" }) },
  });
}

function okFetch(body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => body }));
}

function headersOf(fetchMock: ReturnType<typeof okFetch>): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string>) || {};
}

function bodyOf(fetchMock: ReturnType<typeof okFetch>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : {};
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listKnownIssues", () => {
  it("passes the query through and surfaces the issues on success", async () => {
    stubChrome();
    const fetchMock = okFetch({ ok: true, issues: [{ id: "ki-1", title: "T", cause: "C" }] });
    vi.stubGlobal("fetch", fetchMock);

    const res = await listKnownIssues("walmart");

    expect(res).toEqual({ ok: true, issues: [{ id: "ki-1", title: "T", cause: "C" }] });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("q=walmart");
  });

  it("surfaces a server error without throwing", async () => {
    stubChrome();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: "nope" }) })));

    const res = await listKnownIssues();

    expect(res.ok).toBe(false);
    expect(res.issues).toEqual([]);
  });
});

describe("upvoteKnownIssue", () => {
  it("sends the license bearer when signed in", async () => {
    stubChrome({ licenseKey: "LS-REAL-KEY" });
    const fetchMock = okFetch({ ok: true, alreadyVoted: false, upvoteCount: 1 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await upvoteKnownIssue("ki-1");

    expect(res).toEqual({ ok: true, alreadyVoted: false, upvoteCount: 1 });
    expect(headersOf(fetchMock).Authorization).toBe("Bearer LS-REAL-KEY");
    expect(headersOf(fetchMock)["X-Ib-Voter-Id"]).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/ki-1/upvote");
  });

  it("falls back to an anonymous voter id when signed out, and reuses the same id next time", async () => {
    stubChrome();
    const fetchMock = okFetch({ ok: true, alreadyVoted: false, upvoteCount: 1 });
    vi.stubGlobal("fetch", fetchMock);

    await upvoteKnownIssue("ki-1");
    const firstId = headersOf(fetchMock)["X-Ib-Voter-Id"];
    expect(typeof firstId).toBe("string");
    expect(firstId!.length).toBeGreaterThan(0);
    expect(headersOf(fetchMock).Authorization).toBeUndefined();

    fetchMock.mockClear();
    await upvoteKnownIssue("ki-2");
    expect(headersOf(fetchMock)["X-Ib-Voter-Id"]).toBe(firstId);
  });

  it("rejects an empty id without calling fetch", async () => {
    stubChrome();
    const fetchMock = okFetch({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const res = await upvoteKnownIssue("");

    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("volunteerLogsForKnownIssue", () => {
  it("reports the running manifest version and chrome as the platform, with source=extension", async () => {
    stubChrome({ licenseKey: "LS-REAL-KEY", version: "0.2.0" });
    const fetchMock = okFetch({ ok: true, ticketAdvanced: false });
    vi.stubGlobal("fetch", fetchMock);

    const res = await volunteerLogsForKnownIssue("ki-1");

    expect(res).toEqual({ ok: true, ticketAdvanced: false });
    const body = bodyOf(fetchMock);
    expect(body.source).toBe("extension");
    expect(body.appVersion).toBe("0.2.0");
    expect(body.platform).toBe("chrome");
    expect(typeof body.logText).toBe("string");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/ki-1/logs");
  });

  it("includes ticketId only when provided", async () => {
    stubChrome();
    const fetchMock = okFetch({ ok: true, ticketAdvanced: true });
    vi.stubGlobal("fetch", fetchMock);

    await volunteerLogsForKnownIssue("ki-1", "fb-aaaa");

    expect(bodyOf(fetchMock).ticketId).toBe("fb-aaaa");
  });

  it("surfaces a worker rejection (e.g. needsLogs is false) as an error, not a throw", async () => {
    stubChrome();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "This issue isn't requesting logs right now." }),
    })));

    const res = await volunteerLogsForKnownIssue("ki-1");

    expect(res).toEqual({ ok: false, error: "This issue isn't requesting logs right now." });
  });
});
