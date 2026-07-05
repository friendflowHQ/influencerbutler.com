import type { Finding } from "../transport/types";

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
  | { kind: "GET_PAGE_STATUS" };

export type SignInResult = { ok: boolean; email?: string; error?: string };

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
