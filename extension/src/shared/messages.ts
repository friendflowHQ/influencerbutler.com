import type { Finding } from "../transport/types";
import type { HudCommand, HudCommandResult, HudStatus } from "../transport/hud-commands";

// Typed chrome.runtime message contracts. Content scripts and the popup talk
// to the background through these; content scripts never call the network
// for influencerbutler.com themselves.

export type AuthStatus = {
  signedIn: boolean;
  email: string | null;
  queueDepth: number;
  lastSyncAt: number | null;
};

export type PageStatus = {
  pageType: "product" | "order-history" | "storefront" | "other";
  toolSummaries: Array<{ label: string; value: string }>;
};

export type RuntimeMessage =
  | { kind: "RECORD_FINDING"; finding: Finding }
  | { kind: "GET_AUTH_STATUS" }
  | { kind: "SIGN_IN"; licenseKey: string }
  | { kind: "SIGN_OUT" }
  | { kind: "FLUSH_QUEUE" }
  | { kind: "GET_PAGE_STATUS" }
  | { kind: "GET_HUD_STATUS"; force?: boolean }
  | { kind: "SEND_HUD_COMMAND"; command: HudCommand }
  | { kind: "SEND_FEEDBACK"; feedback: FeedbackInput }
  | { kind: "OPEN_URL"; url: string };

export type FeedbackInput = {
  feedbackType: "bug" | "feature" | "praise" | "other";
  message: string;
  pageUrl?: string;
};

export type FeedbackResult = { ok: boolean; error?: string };

export type SignInResult = { ok: boolean; email?: string; error?: string };

export type { HudCommand, HudCommandResult, HudStatus };

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
