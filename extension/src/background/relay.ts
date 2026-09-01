import { IB_RELAY_ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import { getClientId } from "./hud-bridge";
import type { HudCommand } from "../transport/hud-commands";

// Cross-device command relay (sender side). The local bridge (hud-bridge.ts)
// only reaches the desktop app on THIS machine; these calls send the same
// HudCommand envelope to the app on ANOTHER computer, through the licensing
// Worker's /relay/* endpoints. The user's signed-in license key is the Bearer
// credential (the same one the branded-links client uses), and this install's
// stable client id (getClientId) is the sender identity the receiver approved
// during the device-link handshake.
//
// All requests run in the background so the license key never reaches a page.

export type RelayTarget = { receiverInstanceId: string; receiverLabel: string | null };
export type RelayClaimResult = {
  ok: boolean;
  receiverInstanceId?: string;
  receiverLabel?: string | null;
  error?: string;
};
export type RelayTargetsResult = { ok: boolean; targets: RelayTarget[]; error?: string };
export type RelaySendResult = { ok: boolean; id?: string; error?: string };

async function licenseKey(): Promise<string | null> {
  try {
    const state = await getState();
    return state.auth?.licenseKey ?? null;
  } catch {
    return null;
  }
}

// Turn a Worker error code into a line the popup / deal page shows verbatim.
function friendly(code: unknown): string {
  switch (String(code || "")) {
    case "relay_requires_paid_plan":
      return "Cross-device sending needs a paid plan.";
    case "receiver_disabled":
      return "That computer is not accepting remote commands. Turn on receiving in the app there.";
    case "not_linked":
      return "This extension is not linked to that computer yet.";
    case "invalid_code":
      return "That link code is wrong or has expired. Generate a new one in the app on the other computer.";
    case "could_not_verify_license":
      return "Could not verify your license right now. Try again in a minute.";
    default:
      return "Could not reach your other device.";
  }
}

// Claim a 6-digit link code shown by the desktop app on another computer. On
// success the relay records this extension as an approved sender for that
// device, so later /relay/send calls to it are accepted.
export async function relayClaimLink(code: string, label?: string): Promise<RelayClaimResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Sign in with your license key in the extension first." };
  const trimmed = String(code || "").trim();
  if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: "Enter the 6-digit code shown in the app." };
  const senderId = await getClientId();
  try {
    const res = await fetch(IB_RELAY_ENDPOINTS.linkClaim, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, senderLabel: label || "", code: trimmed }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; receiverInstanceId?: string; receiverLabel?: string | null; error?: string }
      | null;
    if (json && json.ok && json.receiverInstanceId) {
      return { ok: true, receiverInstanceId: json.receiverInstanceId, receiverLabel: json.receiverLabel ?? null };
    }
    return { ok: false, error: friendly(json?.error) };
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }
}

// List the desktop apps (on other computers) this extension is linked to.
export async function relayListTargets(): Promise<RelayTargetsResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, targets: [], error: "not-signed-in" };
  const senderId = await getClientId();
  try {
    const url = `${IB_RELAY_ENDPOINTS.targets}?senderId=${encodeURIComponent(senderId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; targets?: RelayTarget[]; error?: string }
      | null;
    if (json && json.ok && Array.isArray(json.targets)) {
      return { ok: true, targets: json.targets };
    }
    return { ok: false, targets: [], error: friendly(json?.error) };
  } catch {
    return { ok: false, targets: [], error: "network" };
  }
}

// Send one command to a linked desktop on another computer. Fire-and-forget:
// the Worker queues it in that device's inbox and the desktop drains it on its
// next poll, so this returns as soon as the command is queued (id is the inbox
// message id). The desktop reports the real result back separately.
export async function relaySend(command: HudCommand, targetInstanceId: string): Promise<RelaySendResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "Sign in with your license key in the extension first." };
  const target = String(targetInstanceId || "").trim();
  if (!target) return { ok: false, error: "No remote device selected." };
  const senderId = await getClientId();
  try {
    const res = await fetch(IB_RELAY_ENDPOINTS.send, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, targetInstanceId: target, command }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
    if (json && json.ok) return { ok: true, id: json.id };
    return { ok: false, error: friendly(json?.error) };
  } catch {
    return { ok: false, error: "network" };
  }
}
