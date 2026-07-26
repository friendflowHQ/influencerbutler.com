import {
  BRIDGE_PORTS,
  BRIDGE_PROBE_TIMEOUT_MS,
  BRIDGE_STATUS_TTL_MS,
} from "../shared/constants";
import { normalizeCreatorMode } from "../shared/creator-mode";
import { log } from "../shared/log";
import { getSettings, patchSettings } from "../storage/store";
import type {
  DesktopHistoryResult,
  EarningsLookupResult,
  HudCommand,
  HudCommandResult,
  HudStatus,
  NotifyPollResult,
  PairResult,
} from "../transport/hud-commands";
import type { Finding } from "../transport/types";

// Where the pairing token + this extension install's stable client id live.
// The client id is generated once and reused so re-pairing rotates the token
// on the same identity rather than accumulating dead entries in the app.
const TOKEN_KEY = "ib-bridge-token";
const CLIENT_ID_KEY = "ib-bridge-client-id";

async function getStored(key: string): Promise<string | null> {
  try {
    const out = await chrome.storage.local.get(key);
    const value = out?.[key];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  return getStored(TOKEN_KEY);
}

// Whether this install has a pairing token, i.e. the app has been connected at
// least once. Used by the local finding transport to decide it can deliver.
export async function isPaired(): Promise<boolean> {
  return (await getToken()) !== null;
}

export async function getClientId(): Promise<string> {
  const existing = await getStored(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  try {
    await chrome.storage.local.set({ [CLIENT_ID_KEY]: id });
  } catch {
    // If storage is unavailable the id just won't persist; pairing can retry.
  }
  return id;
}

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
  // Mirror the creator channel into Settings so every surface can read it
  // synchronously through getSettings() (content router, popup) rather than
  // awaiting a live probe. Only persist on a real connection and only when it
  // changed, so a closed app keeps the last-known mode and we avoid churn.
  if (status.connected && status.creatorMode) {
    try {
      const settings = await getSettings();
      if (settings.creatorMode !== status.creatorMode) {
        await patchSettings({ creatorMode: status.creatorMode });
      }
    } catch {
      // storage may be unavailable; filtering falls back to the stored default
    }
  }
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
          creatorMode?: unknown;
        };
        if (frame.type === "hello" || frame.type === "status") {
          done({
            connected: true,
            appVersion: frame.appVersion,
            dealWorkspaces: frame.dealWorkspaces,
            creatorMode: normalizeCreatorMode(frame.creatorMode),
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
  const token = await getToken();
  if (!token) {
    // No pairing yet: the panel should prompt the user to connect the app
    // rather than show a "not running" error.
    return { ok: false, needsPairing: true, message: "Connect the app to the extension first." };
  }
  let sawApp = false;
  for (const port of BRIDGE_PORTS) {
    const result = await sendToPort(port, command, token);
    if (result) {
      if (result.needsPairing) sawApp = true; // app answered but rejected the token
      else return result;
    }
  }
  cached = null; // nothing answered; refresh status next time
  if (sawApp) {
    return { ok: false, needsPairing: true, message: "The app no longer recognizes this extension. Reconnect it." };
  }
  return { ok: false, message: "The Influencer Butler app is not running." };
}

// Command socket: authenticate with the stored token, then send the command.
// Resolves null when nothing is listening on this port (so the caller tries the
// next), a result on a real answer, or { needsPairing } when the app answered
// but rejected the token.
function sendToPort(
  port: number,
  command: HudCommand,
  token: string,
): Promise<HudCommandResult | null> {
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
        socket.send(JSON.stringify({ type: "auth", token }));
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
          needsPairing?: boolean;
        };
        if (frame.type === "authed") {
          socket.send(JSON.stringify({ type: "command", command }));
          return;
        }
        if (frame.type === "auth.error") {
          done({ ok: false, needsPairing: true, message: frame.message });
          return;
        }
        if (frame.type === "command.result") {
          log("hud", `command ${command.type} -> ${frame.ok ? "ok" : "fail"}`);
          done({ ok: frame.ok === true, message: frame.message, needsPairing: frame.needsPairing });
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

// ── Findings ─────────────────────────────────────────────────────────────────
// The passive sync stream (scans, gaps, orders, deals, storefront issues) the
// extension already posts to the website, mirrored into the running app so a
// finding lands in the HUD too, not only the web dashboard. The finding router
// dual-sends: this path and the website API are independent sinks, so a failure
// here never affects the website record. Returns transport-style {ok, retry}:
// retry when the app was expected but did not answer (it may be coming up),
// no-retry when it answered but rejected the token (re-pairing is the fix).

export async function sendFindings(findings: Finding[]): Promise<{ ok: boolean; retry: boolean }> {
  const token = await getToken();
  if (!token) return { ok: false, retry: false }; // not paired: nothing to deliver to
  for (const port of BRIDGE_PORTS) {
    const result = await sendFindingsToPort(port, findings, token);
    if (result) return result;
  }
  cached = null; // nothing answered; refresh status next time
  return { ok: false, retry: true };
}

function sendFindingsToPort(
  port: number,
  findings: Finding[],
  token: string,
): Promise<{ ok: boolean; retry: boolean } | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: { ok: boolean; retry: boolean } | null) => {
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
        socket.send(JSON.stringify({ type: "auth", token }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          ok?: boolean;
        };
        if (frame.type === "authed") {
          socket.send(JSON.stringify({ type: "findings", findings }));
          return;
        }
        if (frame.type === "auth.error") {
          done({ ok: false, retry: false }); // rejected the token; re-pairing needed
          return;
        }
        if (frame.type === "findings.result") {
          done({ ok: frame.ok === true, retry: frame.ok !== true });
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

// ── Earnings lookup ──────────────────────────────────────────────────────────
// Ask the running app what the creator earned on a batch of ASINs, so the
// extension can show real earnings on the Amazon page. Read-only; authed with
// the pairing token because it returns private earnings. Returns paired:false
// when never connected so callers stay silent instead of erroring.

export async function lookupEarnings(asins: string[]): Promise<EarningsLookupResult> {
  const token = await getToken();
  if (!token) return { ok: false, paired: false, results: [] };
  for (const port of BRIDGE_PORTS) {
    const result = await lookupEarningsOnPort(port, asins, token);
    if (result) return result;
  }
  cached = null;
  return { ok: false, results: [] };
}

function lookupEarningsOnPort(
  port: number,
  asins: string[],
  token: string,
): Promise<EarningsLookupResult | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: EarningsLookupResult | null) => {
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
        socket.send(JSON.stringify({ type: "auth", token }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          ok?: boolean;
          results?: EarningsLookupResult["results"];
        };
        if (frame.type === "authed") {
          socket.send(JSON.stringify({ type: "earnings.lookup", payload: { asins } }));
          return;
        }
        if (frame.type === "auth.error") {
          done({ ok: false, paired: false, results: [] });
          return;
        }
        if (frame.type === "earnings.result") {
          // The whole AsinEarnings[] is forwarded as-is, so the optional
          // byStore/byYear/byMonth/campaigns buckets a newer app sends reach the
          // page without any transform here; older apps just omit them.
          done({
            ok: frame.ok === true,
            results: Array.isArray(frame.results) ? frame.results : [],
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

// ── Product history (durable desktop store) ──────────────────────────────────
// Ask the running app for an ASIN's full price/rank history from its durable
// time-series (the app may in turn backfill from a deep-history provider, at
// most once per ASIN). The overlay prefers this over the extension's capped
// local store. Authed with the pairing token because it returns the creator's
// private research data. Returns paired:false when never connected so the
// caller silently falls back to the local sparkline.

export async function fetchDesktopHistory(asin: string): Promise<DesktopHistoryResult> {
  const token = await getToken();
  if (!token) return { ok: false, paired: false, points: [] };
  for (const port of BRIDGE_PORTS) {
    const result = await fetchDesktopHistoryOnPort(port, asin, token);
    if (result) return result;
  }
  cached = null;
  return { ok: false, points: [] };
}

function fetchDesktopHistoryOnPort(
  port: number,
  asin: string,
  token: string,
): Promise<DesktopHistoryResult | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: DesktopHistoryResult | null) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    // A first-time backfill can call out to a provider, so allow a little
    // longer than the pure-local lookups before giving up.
    const timer = setTimeout(() => done(null), BRIDGE_PROBE_TIMEOUT_MS * 6);
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "auth", token }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          ok?: boolean;
          asin?: string;
          points?: DesktopHistoryResult["points"];
        };
        if (frame.type === "authed") {
          socket.send(JSON.stringify({ type: "history.backfill", payload: { asin } }));
          return;
        }
        if (frame.type === "auth.error") {
          done({ ok: false, paired: false, points: [] });
          return;
        }
        if (frame.type === "history.result") {
          done({
            ok: frame.ok === true,
            asin: frame.asin,
            points: Array.isArray(frame.points) ? frame.points : [],
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

// ── Notification poll (reverse channel) ──────────────────────────────────────
// Ask the running app for anything it wants to show the creator (a butler run
// finished, earnings synced) since our last cursor. Pull, not push: an MV3
// worker cannot keep a socket open for the app to push to. Authed with the
// pairing token. Returns ok:false (silently) when not paired or not answering.

export async function pollNotifications(since: number): Promise<NotifyPollResult> {
  const token = await getToken();
  if (!token) return { ok: false, entries: [], cursor: since };
  for (const port of BRIDGE_PORTS) {
    const result = await pollNotificationsOnPort(port, since, token);
    if (result) return result;
  }
  return { ok: false, entries: [], cursor: since };
}

function pollNotificationsOnPort(
  port: number,
  since: number,
  token: string,
): Promise<NotifyPollResult | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    const done = (value: NotifyPollResult | null) => {
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
        socket.send(JSON.stringify({ type: "auth", token }));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          ok?: boolean;
          entries?: NotifyPollResult["entries"];
          cursor?: number;
        };
        if (frame.type === "authed") {
          socket.send(JSON.stringify({ type: "notify.poll", since }));
          return;
        }
        if (frame.type === "auth.error") {
          done({ ok: false, entries: [], cursor: since });
          return;
        }
        if (frame.type === "notify.result") {
          done({
            ok: frame.ok === true,
            entries: Array.isArray(frame.entries) ? frame.entries : [],
            cursor: Number(frame.cursor) || since,
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

// ── Pairing ────────────────────────────────────────────────────────────────
// Two round trips driven from the popup: first ask the app to show a 6-digit
// code (it pops the code in the HUD), then submit the code the user typed. On
// success the token is persisted and every later command authenticates with it.

export async function requestPairing(): Promise<PairResult> {
  const clientId = await getClientId();
  for (const port of BRIDGE_PORTS) {
    const r = await pairRoundTrip(port, { type: "pair.request", clientId }, "pair.pending");
    if (r) return r;
  }
  return { ok: false, stage: "error", message: "The Influencer Butler app is not running." };
}

export async function submitPairingCode(code: string): Promise<PairResult> {
  const clientId = await getClientId();
  for (const port of BRIDGE_PORTS) {
    const r = await pairRoundTrip(port, { type: "pair", clientId, code }, "paired");
    if (r) return r;
  }
  return { ok: false, stage: "error", message: "The Influencer Butler app is not running." };
}

// One pairing exchange on a single port. Resolves null when nothing answers on
// this port; otherwise a PairResult. On a "paired" frame it persists the token.
function pairRoundTrip(
  port: number,
  outbound: Record<string, unknown>,
  successType: "pair.pending" | "paired",
): Promise<PairResult | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/butler`);
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value: PairResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(() => done(null), BRIDGE_PROBE_TIMEOUT_MS * 4);
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(outbound));
      } catch {
        done(null);
      }
    };
    socket.onmessage = (event) => {
      let frame: { type?: string; token?: string; message?: string };
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        done(null);
        return;
      }
      if (frame.type === "pair.pending" && successType === "pair.pending") {
        done({ ok: true, stage: "pending", message: frame.message });
        return;
      }
      if (frame.type === "paired" && successType === "paired") {
        void chrome.storage.local
          .set({ [TOKEN_KEY]: String(frame.token || "") })
          .then(() => done({ ok: true, stage: "paired" }))
          .catch(() => done({ ok: true, stage: "paired" }));
        return;
      }
      if (frame.type === "pair.error" || frame.type === "auth.error") {
        done({ ok: false, stage: "error", message: frame.message });
        return;
      }
    };
    socket.onerror = () => done(null);
    socket.onclose = () => done(null);
  });
}

export async function unpair(): Promise<void> {
  try {
    await chrome.storage.local.remove(TOKEN_KEY);
  } catch {
    // best effort
  }
}
