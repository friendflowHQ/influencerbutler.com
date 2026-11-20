/**
 * Summary: Support notes, assignee and bot drafts live in Supabase beside the
 * Worker's tickets. These cover the "migration not applied yet" fallbacks, the
 * one-pending-draft-per-ticket rule, and that auto-filed tickets carry the agent
 * token so the Worker honors requesterEmail.
 * Dependencies: vitest, ../support-meta, ../support-worker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Call = { table: string; op: string; args: unknown[] };

const calls: Call[] = [];
let responses: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }> = {};

/** Chainable stand-in for a PostgREST query builder: records calls, resolves per table. */
function builder(table: string) {
  const result = () => responses[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "in", "gte", "order", "limit"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return chain;
}

vi.mock("@/lib/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

import { getTicketMeta, isMissingTable, saveBotDraft, DRAFT_TTL_MS } from "../support-meta";
import { submitSupportTicket } from "../support-worker";

beforeEach(() => {
  calls.length = 0;
  responses = {};
});

describe("isMissingTable", () => {
  it("recognizes the errors Postgres and PostgREST give for an unapplied migration", () => {
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table in the schema cache" })).toBe(true);
    expect(isMissingTable({ message: 'relation "support_ticket_notes" does not exist' })).toBe(true);
  });
  it("does not hide real errors", () => {
    expect(isMissingTable({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});

describe("getTicketMeta", () => {
  it("combines assignee, note count and the pending draft per ticket", async () => {
    responses = {
      support_ticket_assignments: { data: [{ ticket_id: "fb-1", assignee_email: "liz@example.com" }] },
      support_ticket_notes: { data: [{ ticket_id: "fb-1" }, { ticket_id: "fb-1" }, { ticket_id: "fb-2" }] },
      support_bot_drafts: { data: [{ id: "d-1", ticket_id: "fb-2" }] },
    };
    const { meta, pending } = await getTicketMeta(["fb-1", "fb-2"]);
    expect(pending).toBe(false);
    expect(meta["fb-1"]).toEqual({ assignee: "liz@example.com", noteCount: 2, draftId: null });
    expect(meta["fb-2"]).toEqual({ assignee: "", noteCount: 1, draftId: "d-1" });
  });

  it("reports pending (not an error) before the migration is applied", async () => {
    const missing = { data: null, error: { code: "PGRST205", message: "schema cache" } };
    responses = { support_ticket_assignments: missing, support_ticket_notes: missing, support_bot_drafts: missing };
    const { meta, pending } = await getTicketMeta(["fb-1"]);
    expect(pending).toBe(true);
    expect(meta).toEqual({});
  });

  it("skips the database entirely for an empty page", async () => {
    await getTicketMeta([]);
    expect(calls).toHaveLength(0);
  });
});

describe("saveBotDraft", () => {
  const input = {
    ticketId: "fb-1",
    title: "How do I start?",
    customerEmail: "c@example.com",
    priority: "P2",
    subject: "Re: How do I start?",
    body: "Open the app.",
    confidence: 0.9,
    grounded: true,
    classification: "question",
    reason: "clear how-to",
  };

  it("supersedes the older pending draft before inserting the new one", async () => {
    await saveBotDraft(input);
    const ops = calls.filter((c) => c.table === "support_bot_drafts").map((c) => c.op);
    expect(ops.indexOf("update")).toBeGreaterThanOrEqual(0);
    expect(ops.indexOf("update")).toBeLessThan(ops.indexOf("insert"));
    const update = calls.find((c) => c.op === "update");
    expect((update?.args[0] as { status: string }).status).toBe("superseded");
  });

  it("quietly does nothing when the table does not exist yet", async () => {
    responses = { support_bot_drafts: { data: null, error: { code: "42P01", message: "does not exist" } } };
    await expect(saveBotDraft(input)).resolves.toBeUndefined();
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("hides drafts older than a week from review", () => {
    expect(DRAFT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("submitSupportTicket requester", () => {
  const originalFetch = globalThis.fetch;
  let seen: { headers: Record<string, string>; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    seen = null;
    process.env.SUPPORT_BOT_TOKEN = "bot-token";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen = {
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(JSON.stringify({ ok: true, id: "fb-new" }), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.SUPPORT_BOT_TOKEN;
  });

  it("sends the agent token and requesterEmail for an auto-filed ticket", async () => {
    const res = await submitSupportTicket({
      type: "bug",
      title: "Stalls",
      description: "x",
      userEmail: "owner@example.com",
      requesterEmail: "customer@example.com",
      tags: "from-call",
    });
    expect(res).toEqual({ ok: true, id: "fb-new" });
    expect(seen?.headers["x-ib-agent-token"]).toBe("bot-token");
    expect(seen?.body.requesterEmail).toBe("customer@example.com");
  });

  it("sends no agent token for an ordinary ticket", async () => {
    await submitSupportTicket({ type: "bug", title: "Stalls", description: "x", userEmail: "u@example.com" });
    expect(seen?.headers["x-ib-agent-token"]).toBeUndefined();
  });
});
