import type { Finding } from "../transport/types";
import type { HudCommand, HudCommandResult, HudStatus } from "../transport/hud-commands";
import type { IntegrationsState, IntegrationTestResult } from "../storage/schema";

type IntegrationsGlobal = IntegrationsState["global"];

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
  pageType: "product" | "order-history" | "storefront" | "creator-upload" | "other";
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
  | { kind: "OPEN_URL"; url: string }
  // API integrations (options page + on-page link/AI use). Credentials never
  // ride these messages back to the UI; only non-secret field values do.
  | { kind: "GET_INTEGRATIONS" }
  | {
      kind: "SAVE_INTEGRATION";
      id: string;
      values: Record<string, string>;
      enabled?: boolean;
      routingParticipates?: boolean;
    }
  | { kind: "SET_INTEGRATION_GLOBAL"; partial: Partial<IntegrationsGlobal> }
  | { kind: "TEST_INTEGRATION"; id: string }
  | { kind: "TEST_ALL_INTEGRATIONS" }
  | { kind: "GENERATE_AFFILIATE_LINK"; asin: string; marketplace: string; url?: string }
  | { kind: "REWRITE_LINK"; url: string }
  | { kind: "OPENAI_COMPLETE"; prompt: string }
  // Per-country availability for a tagged product, checked from the worker
  // (cross-marketplace fetch needs the host_permissions CORS bypass).
  | { kind: "FETCH_MARKET_AVAILABILITY"; asin: string; markets: string[] };

export type FeedbackInput = {
  feedbackType: "bug" | "feature" | "praise" | "other";
  message: string;
  pageUrl?: string;
};

export type FeedbackResult = { ok: boolean; error?: string };

export type SignInResult = { ok: boolean; email?: string; error?: string };

// What the options page renders for one provider. `values` holds only
// non-secret field values (never a password/secret); `configured` says whether
// a credential is saved so the UI can show "connected" without exposing it.
export type IntegrationView = {
  id: string;
  enabled: boolean;
  configured: boolean;
  values: Record<string, string>;
  lastTest: IntegrationTestResult;
  routingParticipates: boolean;
};

export type IntegrationsView = {
  global: IntegrationsGlobal;
  providers: IntegrationView[];
};

export type IntegrationTestOutcome = { ok: boolean; message: string };
export type GenerateLinkResult = { ok: boolean; url?: string; error?: string };
export type OpenAiResult = { ok: boolean; text?: string; error?: string };

export type { HudCommand, HudCommandResult, HudStatus };

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
