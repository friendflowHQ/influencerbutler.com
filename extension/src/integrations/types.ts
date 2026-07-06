// Shared shapes for the integration adapters. Each provider is described by an
// adapter: what credential fields it needs, which host it must be granted, how
// to test it read-only, and (where it applies) how to generate a link or run a
// completion. The background worker is the only caller; credentials arrive
// already decrypted and never leave the worker.

export type DeeplinkProviderId =
  | "posttap"
  | "linktwin"
  | "urlgenius"
  | "geniuslink"
  | "selfhosted";

export type AffiliateNetworkId = "levanta" | "archer" | "logie" | "benable";

export type IntegrationId =
  | "openai"
  | "creatorsApi"
  | "associates"
  | DeeplinkProviderId
  | AffiliateNetworkId;

export type IntegrationCategory =
  | "ai"
  | "productData"
  | "affiliateTag"
  | "deeplink"
  | "affiliateNetwork";

export type FieldSpec = {
  name: string;
  // Label/help are i18n keys resolved by the options page (src/options/strings).
  labelKey: string;
  type: "password" | "text";
  placeholder?: string;
  optional?: boolean;
};

export type TestResult = { ok: boolean; message: string };

export type LinkTarget = {
  asin: string;
  marketplace: string; // for example "amazon.com"
  url: string; // canonical product url
  tag?: string; // resolved affiliate tag for this marketplace, if any
};

export type IntegrationAdapter = {
  id: IntegrationId;
  labelKey: string;
  category: IntegrationCategory;
  // Origin match patterns to request via optional_host_permissions before a
  // network call. Empty for adapters that only validate locally. Every pattern
  // here must also appear in static/manifest.json optional_host_permissions.
  hosts: string[];
  fields: FieldSpec[];
  // Read-only verification. Never mutates anything on the provider side.
  test(creds: Record<string, string>): Promise<TestResult>;
  // Deeplink providers turn an Amazon url into a wrapped/tracked link.
  generateLink?(target: LinkTarget, creds: Record<string, string>): Promise<string>;
  // OpenAI turns a prompt into text.
  complete?(prompt: string, creds: Record<string, string>): Promise<string>;
};
