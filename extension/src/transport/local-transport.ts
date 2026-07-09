import type { Finding, FindingTransport } from "./types";
import { getState } from "../storage/store";
import { getHudStatus, isPaired, sendFindings } from "../background/hud-bridge";

// Local bridge to the Influencer Butler desktop app's HUD: a loopback WebSocket
// (ws://127.0.0.1:48620) with a pairing-code handshake, documented in
// docs/extension-local-bridge.md. The finding router dual-sends, so when the app
// is running and paired a finding reaches the HUD here AND still syncs to the
// website via apiTransport: the two are independent sinks and neither blocks the
// other. Available only when sync is on, the install is paired, and a probe says
// the app is up, so an app that is closed simply falls through to the website.

export const localTransport: FindingTransport = {
  id: "local",

  async isAvailable(): Promise<boolean> {
    const state = await getState();
    // One toggle governs all outbound findings: if the user turned sync off,
    // nothing leaves the page, HUD included.
    if (!state.settings.syncEnabled) return false;
    if (!(await isPaired())) return false;
    const status = await getHudStatus(); // cached probe (15s TTL)
    return status.connected === true;
  },

  async send(batch: Finding[]): Promise<{ ok: boolean; retry: boolean }> {
    return sendFindings(batch);
  },
};
