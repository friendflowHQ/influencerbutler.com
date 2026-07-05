import {
  BRIDGE_PORTS,
  BRIDGE_PROBE_TIMEOUT_MS,
  BRIDGE_STATUS_TTL_MS,
} from "../shared/constants";
import { log } from "../shared/log";
import type { HudCommand, HudCommandResult, HudStatus } from "../transport/hud-commands";

// Talks to the desktop app's loopback WebSocket bridge from the background
// service worker (the content script cannot: an https Amazon page blocks
// ws://127.0.0.1 as mixed content, but the extension background origin is
// exempt). Everything degrades to "not connected" so the UI can show the
// download/upsell path. The bridge protocol (pairing, envelope) lives in
// docs/extension-local-bridge.md; until the desktop app ships it, probes
// simply fail fast and the funnel shows the upsell.

let cached: { status: HudStatus; at: number } | null = null;

export async function getHudStatus(force = false): Promise<HudStatus> {
  if (!force && cached && Date.now() - cached.at < BRIDGE_STATUS_TTL_MS) {
    return cached.status;
  }
  const status = await probe();
  cached = { status, at: Date.now() };
  return status;
}

async function probe(): Promise<HudStatus> {
  for (const port of BRIDGE_PORTS) {
    const result = await probePort(port);
    if (result) return result;
  }
  return { connected: false };
}

// Opens a short-lived socket, sends a hello, and reads one status frame.
// Resolves null on any failure (nothing listening, timeout, bad frame).
function probePort(port: number): Promise<HudStatus | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: HudStatus | null) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(() => done(null), BRIDGE_PROBE_TIMEOUT_MS);
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "hello", client: "extension" }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          appVersion?: string;
          dealWorkspaces?: Array<{ key: string; label: string }>;
        };
        if (frame.type === "hello" || frame.type === "status") {
          done({
            connected: true,
            appVersion: frame.appVersion,
            dealWorkspaces: frame.dealWorkspaces,
          });
          return;
        }
      } catch {
        // fall through
      }
      done(null);
    };
    socket.onerror = () => done(null);
    socket.onclose = () => done(null);
  });
}

export async function sendHudCommand(command: HudCommand): Promise<HudCommandResult> {
  for (const port of BRIDGE_PORTS) {
    const result = await sendToPort(port, command);
    if (result) return result;
  }
  cached = null; // nothing answered; refresh status next time
  return { ok: false, message: "The Influencer Butler app is not running." };
}

function sendToPort(port: number, command: HudCommand): Promise<HudCommandResult | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: HudCommandResult | null) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(() => done(null), BRIDGE_PROBE_TIMEOUT_MS * 3);
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "command", command }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          ok?: boolean;
          message?: string;
        };
        if (frame.type === "command.result") {
          log("hud", `command ${command.type} -> ${frame.ok ? "ok" : "fail"}`);
          done({ ok: frame.ok === true, message: frame.message });
          return;
        }
      } catch {
        // fall through
      }
      done(null);
    };
    socket.onerror = () => done(null);
    socket.onclose = () => done(null);
  });
}
