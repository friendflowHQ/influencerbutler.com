import type { Finding, FindingTransport } from "./types";
import { getState } from "../storage/store";
import { localTransport } from "./local-transport";
import { relaySend } from "../background/relay";

// Cross-device sink for the passive findings stream. When the extension runs on
// a computer (or a phone, via a Chromium browser that loads extensions) with NO
// local desktop app, but the user has linked a desktop app on ANOTHER machine,
// findings ride the same cloud relay the "send to another computer" deal hand-off
// uses. They are delivered as a `findings.push.batch` command the desktop ingests
// exactly like a same-machine `findings` frame, so browsing on the phone builds
// the desktop's Content Butler / research history just as local browsing does.
//
// Gated to fire ONLY when the local bridge is absent, so a running local app is
// never double-fed, and only when a device has been linked as the default target,
// so the (rate-limited, paid-plan) relay is never touched by the common
// single-machine user. The website API sink stays independent, so findings still
// reach the dashboard whether or not a device is linked.

export const relayTransport: FindingTransport = {
  id: "relay",

  async isAvailable(): Promise<boolean> {
    const state = await getState();
    // One master toggle governs every outbound sink, relay included.
    if (!state.settings.syncEnabled) return false;
    // The relay authenticates with the signed-in license key (the Bearer the
    // background worker sends); no key, nothing to send.
    if (!state.auth?.licenseKey) return false;
    // No device linked as the default target: nothing to relay to. This is the
    // cheap local gate that keeps the relay untouched for single-machine users
    // (the claim flow persists the first linked device as the default).
    if (!state.settings.relayDefaultTarget) return false;
    // A local app on THIS machine already receives these findings over the
    // loopback bridge, so relaying them to a remote device too would double-feed
    // and burn relay quota. Only relay when there is no local app here.
    if (await localTransport.isAvailable()) return false;
    return true;
  },

  async send(batch: Finding[]): Promise<{ ok: boolean; retry: boolean }> {
    const state = await getState();
    const target = state.settings.relayDefaultTarget;
    // The default vanished between the gate and here (device unlinked): drop
    // rather than wedge the queue; the website sink still carries the findings.
    if (!target) return { ok: true, retry: false };

    const res = await relaySend({ type: "findings.push.batch", findings: batch }, target.instanceId);
    if (res.ok) return { ok: true, retry: false };

    // Keep the batch only for a transient reach problem (offline, rate-limited,
    // license not verifiable right now); the re-send is idempotent on the desktop
    // side. A definitive rejection (not linked, receiver disabled, needs a paid
    // plan) is unrecoverable for this sink, so drop it rather than wedge forever.
    const retry = res.error ? /network|reach|verify|try again/i.test(res.error) : false;
    return { ok: false, retry };
  },
};
