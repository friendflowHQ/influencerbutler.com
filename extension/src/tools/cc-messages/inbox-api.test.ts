import { describe, expect, it, vi } from "vitest";
import {
  INBOX_PAGE_SIZE,
  InboxApiError,
  RATE_LIMIT_MAX_RETRIES,
  backoffDelayMs,
  fetchAllInboxRows,
  fetchThreadStatus,
  parseInboxBlock,
  parseThreadMessages,
  summariseInboxRow,
  summariseThread,
  type ApiFetch,
  type ApiResponseLike,
} from "./inbox-api";

function res(body: unknown, init: { status?: number; retryAfter?: string } = {}): ApiResponseLike {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? (init.retryAfter ?? null) : null) },
    json: async () => body,
  };
}

function inboxBody(rows: unknown[], nextToken?: string) {
  return { responses: [{ addresses: [{ actorId: "a", addressBook: rows, ...(nextToken ? { nextToken } : {}) }] }] };
}

function row(name: string, token: string, last = 200, read = 100) {
  return { actorName: name, contextValidatorToken: token, lastMsgTimeStamp: last, lastReadMsgTimeStamp: read };
}

const noSleep = async () => undefined;

describe("summariseInboxRow", () => {
  it("derives unread from the two timestamps and keys the brand", () => {
    expect(summariseInboxRow(row("Litter-Robot", "t1", 300, 100))).toEqual({
      brand: "Litter-Robot",
      brandKey: "litter robot",
      token: "t1",
      lastMsgAt: 300,
      lastReadAt: 100,
      unread: true,
    });
    expect(summariseInboxRow(row("hairmax", "t2", 100, 100))?.unread).toBe(false);
  });

  it("rejects rows without a usable brand", () => {
    expect(summariseInboxRow(null)).toBeNull();
    expect(summariseInboxRow({ actorName: "  " })).toBeNull();
    expect(summariseInboxRow({ actorName: "!!!" })).toBeNull();
    expect(summariseInboxRow({ lastMsgTimeStamp: 5 })).toBeNull();
  });
});

describe("parseInboxBlock", () => {
  it("flattens addresses and prefers the top-level cursor", () => {
    const flat = parseInboxBlock({
      responses: [
        {
          nextToken: "top",
          addresses: [
            { addressBook: [row("A", "1")], nextToken: "addr" },
            { addressBook: [row("B", "2")] },
          ],
        },
      ],
    });
    expect(flat.rows).toHaveLength(2);
    expect(flat.nextToken).toBe("top");
  });

  it("falls back to the per-actor cursor and tolerates junk", () => {
    expect(parseInboxBlock({ responses: [{ addresses: [{ addressBook: [], nextToken: "addr" }] }] }).nextToken).toBe("addr");
    expect(parseInboxBlock(null)).toEqual({ rows: [], nextToken: null });
    expect(parseInboxBlock({ responses: [] })).toEqual({ rows: [], nextToken: null });
  });
});

describe("fetchAllInboxRows", () => {
  it("returns every row from one page and sends the storeid header", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchFn: ApiFetch = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return res(inboxBody([row("A", "1"), row("B", "2", 50, 50)]));
    };
    const rows = await fetchAllInboxRows({ fetchFn, storeId: "littleprettyl-20", sleep: noSleep });
    expect(rows.map((r) => r.brand)).toEqual(["A", "B"]);
    expect(rows.filter((r) => r.unread)).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/connect/api/chat/get?maxSize=${INBOX_PAGE_SIZE}`);
    expect(calls[0]?.headers.storeid).toBe("littleprettyl-20");
  });

  it("omits the storeid header when none is known", async () => {
    let seen: Record<string, string> = {};
    const fetchFn: ApiFetch = async (_url, init) => {
      seen = init.headers;
      return res(inboxBody([]));
    };
    await fetchAllInboxRows({ fetchFn, storeId: "", sleep: noSleep });
    expect(seen.storeid).toBeUndefined();
  });

  it("asks for a bigger page when one comes back exactly full, and de-dupes", async () => {
    const sizes: string[] = [];
    const fetchFn: ApiFetch = async (url) => {
      const size = Number(new URL(url, "https://x.test").searchParams.get("maxSize"));
      sizes.push(String(size));
      // The server has 2,600 conversations (with one duplicate token in the set).
      const total = 2600;
      const n = Math.min(size, total);
      const rows = Array.from({ length: n }, (_v, i) => row(`Brand ${i}`, `t${i === 5 ? 4 : i}`));
      return res(inboxBody(rows));
    };
    const rows = await fetchAllInboxRows({ fetchFn, storeId: "s", sleep: noSleep });
    expect(sizes).toEqual(["2000", "4000"]);
    expect(rows).toHaveLength(2599); // one duplicate token dropped
  });

  it("follows a cursor and stops on an empty page", async () => {
    const pages = [inboxBody([row("A", "1")], "c1"), inboxBody([row("B", "2")], "c2"), inboxBody([])];
    let i = 0;
    const fetchFn: ApiFetch = async () => res(pages[Math.min(i++, pages.length - 1)]);
    const rows = await fetchAllInboxRows({ fetchFn, storeId: "s", sleep: noSleep });
    expect(rows.map((r) => r.brand)).toEqual(["A", "B"]);
  });

  it("stops when the cursor does not advance", async () => {
    const fetchFn: ApiFetch = async () => res(inboxBody([row("A", "1")], "same"));
    const rows = await fetchAllInboxRows({ fetchFn, storeId: "s", sleep: noSleep });
    expect(rows).toHaveLength(1);
  });

  it("keeps what it has when a later cursor page throws", async () => {
    let i = 0;
    const fetchFn: ApiFetch = async () => {
      if (i++ === 0) return res(inboxBody([row("A", "1")], "c1"));
      return res({}, { status: 500 });
    };
    const rows = await fetchAllInboxRows({ fetchFn, storeId: "s", sleep: noSleep });
    expect(rows).toHaveLength(1);
  });

  it("retries 429 with backoff, honouring Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    let i = 0;
    const fetchFn: ApiFetch = async () => {
      i += 1;
      if (i === 1) return res({}, { status: 429, retryAfter: "3" });
      if (i === 2) return res({}, { status: 503 });
      return res(inboxBody([row("A", "1")]));
    };
    const rows = await fetchAllInboxRows({
      fetchFn,
      storeId: "s",
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0,
    });
    expect(rows).toHaveLength(1);
    expect(sleeps).toEqual([3000, 3000]); // 3s Retry-After, then 1500 * 2^(2-1)
  });

  it("gives up after the retry budget", async () => {
    const fetchFn = vi.fn<ApiFetch>(async () => res({}, { status: 429 }));
    await expect(fetchAllInboxRows({ fetchFn, storeId: "s", sleep: noSleep, random: () => 0 })).rejects.toMatchObject({
      code: "api-error",
      status: 429,
    });
    expect(fetchFn).toHaveBeenCalledTimes(RATE_LIMIT_MAX_RETRIES + 1);
  });

  it("flags a 401 as an expired session without retrying", async () => {
    const fetchFn = vi.fn<ApiFetch>(async () => res({}, { status: 401 }));
    const error = await fetchAllInboxRows({ fetchFn, storeId: "", sleep: noSleep }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InboxApiError);
    expect((error as InboxApiError).code).toBe("session-expired");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("backoffDelayMs", () => {
  it("doubles from 1.5s with jitter, and Retry-After wins", () => {
    expect(backoffDelayMs(1, 0, () => 0)).toBe(1500);
    expect(backoffDelayMs(3, 0, () => 0)).toBe(6000);
    expect(backoffDelayMs(1, 0, () => 0.999)).toBe(1999);
    expect(backoffDelayMs(4, 2500, () => 0)).toBe(2500);
  });
});

function chat(...messages: Array<{ type: string; at: number }>) {
  return {
    responses: [
      { chatMessages: messages.map((m, i) => ({ messageId: `m${i}`, createdTimestamp: m.at, sender: { type: m.type } })) },
    ],
  };
}

describe("parseThreadMessages / summariseThread", () => {
  it("maps sender types and reads the cursor", () => {
    const parsed = parseThreadMessages({
      responses: [
        {
          nextToken: "older",
          chatMessages: [
            { createdTimestamp: 300, sender: { type: "BRAND" } },
            { createdTimestamp: 200, sender: { type: "CREATOR" } },
            { createdTimestamp: 100, sender: { type: "SYSTEM" } },
          ],
        },
      ],
    });
    expect(parsed.nextToken).toBe("older");
    expect(parsed.messages.map((m) => m.who)).toEqual(["brand", "me", null]);
  });

  it("finds who wrote last regardless of order, and whether the brand replied", () => {
    const status = summariseThread([
      { who: "me", at: 500 },
      { who: "brand", at: 100 },
    ]);
    expect(status).toEqual({ lastSender: "me", lastAt: 500, brandReplied: true, iMessaged: true });
  });

  it("handles an empty or all-unknown thread", () => {
    expect(summariseThread([])).toEqual({ lastSender: null, lastAt: 0, brandReplied: false, iMessaged: false });
    expect(summariseThread([{ who: null, at: 5 }]).lastSender).toBeNull();
  });
});

describe("fetchThreadStatus", () => {
  const thread = { actorId: "amzn1.creator.abc", brand: "Litter-Robot", token: "tok" };

  it("sends the actor, brand and token, and stops at the first page that has a brand message", async () => {
    const urls: string[] = [];
    const fetchFn: ApiFetch = async (url) => {
      urls.push(url);
      return res({
        responses: [
          {
            nextToken: "older",
            chatMessages: [
              { createdTimestamp: 300, sender: { type: "BRAND" } },
              { createdTimestamp: 200, sender: { type: "CREATOR" } },
            ],
          },
        ],
      });
    };
    const status = await fetchThreadStatus({ fetchFn, storeId: "s", sleep: noSleep }, thread);
    expect(status).toEqual({ lastSender: "brand", lastAt: 300, brandReplied: true, iMessaged: true });
    expect(urls).toHaveLength(1);
    const q = new URL(urls[0] ?? "", "https://x.test").searchParams;
    expect(q.get("actorId")).toBe("amzn1.creator.abc");
    expect(q.get("actorName")).toBe("Litter-Robot");
    expect(q.get("contextToken")).toBe("tok");
  });

  it("walks older pages while the thread is one-sided, up to a cap", async () => {
    let page = 0;
    const fetchFn: ApiFetch = async () => {
      page += 1;
      return res({
        responses: [{ nextToken: `p${page}`, chatMessages: [{ createdTimestamp: 1000 - page, sender: { type: "CREATOR" } }] }],
      });
    };
    const status = await fetchThreadStatus({ fetchFn, storeId: "s", sleep: noSleep }, thread);
    expect(page).toBe(5);
    expect(status.brandReplied).toBe(false);
    expect(status.lastSender).toBe("me");
  });

  it("finds a brand reply that is only on an older page", async () => {
    const pages = [
      chatPage("p1", [{ type: "CREATOR", at: 900 }]),
      chatPage(undefined, [{ type: "BRAND", at: 100 }]),
    ];
    let i = 0;
    const fetchFn: ApiFetch = async () => res(pages[i++]);
    const status = await fetchThreadStatus({ fetchFn, storeId: "s", sleep: noSleep }, thread);
    expect(status).toEqual({ lastSender: "me", lastAt: 900, brandReplied: true, iMessaged: true });
    expect(i).toBe(2);
  });
});

function chatPage(nextToken: string | undefined, messages: Array<{ type: string; at: number }>) {
  const body = chat(...messages);
  if (nextToken) (body.responses[0] as Record<string, unknown>).nextToken = nextToken;
  return body;
}
