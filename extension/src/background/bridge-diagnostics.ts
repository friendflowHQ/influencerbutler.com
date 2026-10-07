// Summary: Builds the "Desktop connection" block attached to extension feedback
//   reports, so support can see why the extension is not talking to the desktop
//   app without a screen share. Probes each bridge port, then tries the stored
//   pairing token. Never includes the token or full client id.
import { BRIDGE_PORTS } from "../shared/constants";

const TOKEN_KEY = "ib-bridge-token";
const CLIENT_ID_KEY = "ib-bridge-client-id";
const STEP_TIMEOUT_MS = 2_500;

type PortResult = { port: number; outcome: string; detail?: string };

async function readStored(key: string): Promise<string | null> {
  try {
    const out = await chrome.storage.local.get(key);
    const v = out?.[key];
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

// Opens one socket, sends hello then (when a token exists) auth, and records
// what happened at each step. Always resolves; every failure becomes a line.
function probePort(port: number, token: string | null): Promise<PortResult> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let opened = false;
    let helloSeen = false;
    let settled = false;
    let detail = "";
    const finish = (outcome: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* ignore */ }
      resolve({ port, outcome, detail: detail || undefined });
    };
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch (err) {
      resolve({ port, outcome: "socket-create-failed", detail: String((err as Error)?.message || err) });
      return;
    }
    const timer = setTimeout(
      () => finish(!opened ? "no-answer (nothing listening, blocked, or handshake refused)" : helloSeen ? "timeout-after-hello" : "opened-but-no-hello-reply"),
      STEP_TIMEOUT_MS,
    );
    socket.onopen = () => {
      opened = true;
      try { socket.send(JSON.stringify({ type: "hello", client: "extension" })); } catch { finish("send-failed"); }
    };
    socket.onmessage = (event) => {
      let frame: { type?: string; appVersion?: string; paired?: boolean; message?: string } = {};
      try { frame = JSON.parse(String(event.data)); } catch { finish("bad-frame"); return; }
      if (frame.type === "status" || frame.type === "hello") {
        helloSeen = true;
        detail = `app ${frame.appVersion || "?"}`;
        if (!token) { finish("app-reachable, extension has no pairing token"); return; }
        try { socket.send(JSON.stringify({ type: "auth", token })); } catch { finish("auth-send-failed"); }
        return;
      }
      if (frame.type === "authed") { finish("app-reachable, token ACCEPTED"); return; }
      if (frame.type === "auth.error") { finish("app-reachable, token REJECTED (re-pair needed)"); return; }
      finish(`unexpected-frame:${frame.type || "?"}`);
    };
    socket.onerror = () => finish(opened ? "socket-error" : "connection-refused-or-blocked");
    socket.onclose = () => finish(opened ? "closed-early" : "connection-refused-or-blocked");
  });
}

export async function collectBridgeDiagnostics(): Promise<string> {
  const token = await readStored(TOKEN_KEY);
  const clientId = await readStored(CLIENT_ID_KEY);
  const lines = [
    "== Desktop connection ==",
    `Pairing token stored: ${token ? "yes" : "NO"}`,
    `Client id: ${clientId ? `${clientId.slice(0, 8)}...` : "(none)"}`,
    `Extension id: ${typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "?"}`,
  ];
  try {
    const results = await Promise.all(BRIDGE_PORTS.map((p) => probePort(p, token)));
    for (const r of results) lines.push(`Port ${r.port}: ${r.outcome}${r.detail ? ` (${r.detail})` : ""}`);
  } catch (err) {
    lines.push(`Probe failed: ${String((err as Error)?.message || err)}`);
  }
  return lines.join("\n");
}
