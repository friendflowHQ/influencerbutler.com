import { afterEach, describe, expect, it, vi } from "vitest";

import { collectBridgeDiagnostics } from "./bridge-diagnostics";

// A fake socket that opens, answers hello with a status frame, then answers
// auth with the frame the test chose.
function stubSocket(authReply: string) {
  class FakeSocket {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { setTimeout(() => this.onopen?.(), 0); }
    send(raw: string) {
      const frame = JSON.parse(raw) as { type: string };
      const reply = frame.type === "hello" ? { type: "status", appVersion: "1.0.95" } : { type: authReply };
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(reply) }), 0);
    }
    close() {}
  }
  vi.stubGlobal("WebSocket", FakeSocket);
}

function stubChrome(stored: Record<string, string>) {
  vi.stubGlobal("chrome", {
    runtime: { id: "abc" },
    storage: { local: { get: vi.fn(async (k: string) => ({ [k]: stored[k] })) } },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("collectBridgeDiagnostics", () => {
  it("reports an accepted token without leaking it", async () => {
    stubChrome({ "ib-bridge-token": "secret-token", "ib-bridge-client-id": "12345678-aaaa" });
    stubSocket("authed");
    const out = await collectBridgeDiagnostics();
    expect(out).toContain("Pairing token stored: yes");
    expect(out).toContain("token ACCEPTED");
    expect(out).not.toContain("secret-token");
    expect(out).toContain("12345678...");
  });

  it("reports a rejected token", async () => {
    stubChrome({ "ib-bridge-token": "t" });
    stubSocket("auth.error");
    expect(await collectBridgeDiagnostics()).toContain("token REJECTED");
  });

  it("reports a missing token", async () => {
    stubChrome({});
    stubSocket("authed");
    const out = await collectBridgeDiagnostics();
    expect(out).toContain("Pairing token stored: NO");
    expect(out).toContain("no pairing token");
  });
});
