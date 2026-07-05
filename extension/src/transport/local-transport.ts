import type { Finding, FindingTransport } from "./types";

// Local bridge to the Influencer Butler desktop app's HUD. Disabled stub in
// v1: the intended contract is a loopback WebSocket (ws://127.0.0.1:48620)
// with a pairing-code handshake, documented in docs/extension-local-bridge.md
// at the repo root. When the desktop app ships the bridge, implement
// isAvailable() as a probe and send() as a framed post; the router already
// prefers this transport, so findings will land in the HUD's Action Queue
// with no changes anywhere else.

export const localTransport: FindingTransport = {
  id: "local",

  async isAvailable(): Promise<boolean> {
    return false;
  },

  async send(_batch: Finding[]): Promise<{ ok: boolean; retry: boolean }> {
    return { ok: false, retry: false };
  },
};
