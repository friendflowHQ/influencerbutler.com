// Shared shapes for the integration adapters. Each provider is described by an
// adapter: what credential fields it needs, which host it must be granted, how
// to test it read-only, and (where it applies) how to generate a link or run a
// completion. The background worker is the only caller; credentials arrive
// already decrypted and never leave the worker.

export type DeeplinkProviderId =
  | "influencerbutler"
  | "linktwin"
  | "urlgenius"
  | "geniuslink"
  | "selfhosted";

export type AffiliateNetworkId = "levanta" | "archer" | "logie" | "benable";

// Walmart affiliate link providers. Both are session-based (no credential
// fields): Walmart Creator mints walmrt.us links from the signed-in
// creator.walmart.com portal, Mavely mints mave.ly links from the signed-in
// creators.joinmavely.com session. The user picks one in options.
export type WalmartLinkId = "walmartCreator" | "mavely";

export type IntegrationId =
  | "openai"
  | "creatorsApi"
  | "associates"
  | DeeplinkProviderId
  | AffiliateNetworkId
  | WalmartLinkId;

export type IntegrationCategory =
  | "ai"
  | "productData"
  | "affiliateTag"
  | "deeplink"
  | "affiliateNetwork"
  | "walmartLink";

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
  // The retailer's product id: an Amazon ASIN or a Walmart item id. Named `asin`
  // for back-compat across the adapters; on Walmart it holds the item id.
  asin: string;
  marketplace: string; // for example "amazon.com" / "walmart.com"
  url: string; // canonical product url
  tag?: string; // resolved affiliate tag for this marketplace, if any
  retailer?: "amazon" | "walmart"; // defaults to "amazon" when absent
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
  // Optional one-line explainer shown under the provider name on the options
  // page (i18n key). Useful for providers with no credential fields, where the
  // form alone would not explain what the provider does.
  descriptionKey?: string;
  // Where to find these credentials on the provider's own site. When set, the
  // options page shows a "Show me where" button next to the provider that opens
  // this page in a new tab, matching the desktop app's button of the same name.
  credentialsUrl?: string;
  // Read-only verification. Never mutates anything on the provider side.
  test(creds: Record<string, string>): Promise<TestResult>;
  // Deeplink providers turn an Amazon url into a wrapped/tracked link.
  generateLink?(target: LinkTarget, creds: Record<string, string>): Promise<string>;
  // OpenAI turns a prompt into text.
  complete?(prompt: string, creds: Record<string, string>): Promise<string>;
};
