import type { IntegrationAdapter, TestResult } from "../types";
import { CREATOR_API_CREDENTIALS_URL } from "../../shared/constants";
import {
  CREATORS_HOST_PATTERNS,
  marketplaceInfoFor,
  normalizeMarketplace,
  mintCreatorsToken,
  creatorsGetItems,
} from "../creators-api-client";

// Amazon Creators API, the same API the desktop app uses. This is the real
// OAuth2 Creator API (not the older Product Advertising API): credentials are a
// Credential ID (an amzn1.application-oa2-client... value) and a Credential
// Secret from the Amazon Creator Connections console, plus a Credential Version
// and an Associates partner tag. Test mints an OAuth2 token and runs a read-only
// getItems probe, sent straight to https://creatorsapi.amazon/catalog/v1/*.
//
// Note: Creator API access requires an approved Amazon Influencer / Associates
// account. Amazon lets a new account CREATE credentials before it may USE them,
// returning an eligibility 4xx until qualifying sales land; we surface that as
// eligibilityBlocked so the options page can offer backup credentials.

// A widely-available sample ASIN used only to exercise the partner tag on Test.
const PROBE_ASIN = "B0CVZWMD34";

// Re-exported so the marketplace field and the options page share one list.
export { CREATORS_HOST_PATTERNS } from "../creators-api-client";

// Clean a pasted partner tag. A real Associates tracking id looks like `tag-20`
// with no leading `@` and no spaces; people routinely paste an `@handle` or a
// value with a stray space/line break. We strip a leading `@` and every
// whitespace character. Case is preserved: tracking ids are case-sensitive.
export function normalizePartnerTag(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
}

// A local sanity check before we ever hit Amazon. The most common mistakes are
// (a) a stray space/line break on paste and (b) pasting the OLD Product
// Advertising API access key (an AKIA/ASIA... 20-char key) into the Credential
// ID box now that this card wants the newer OAuth Creator API credentials.
// Naming the real cause up front saves a confusing round-trip.
export function precheckCredentials(credentialId: string, credentialSecret: string): string | null {
  if (/\s/.test(credentialId)) {
    return "Your Credential ID has a space or line break in it. Re-copy just the id, with no surrounding text.";
  }
  if (/\s/.test(credentialSecret)) {
    return "Your Credential Secret has a space or line break in it. Re-copy just the secret, with no surrounding text.";
  }
  // An old PA-API access key is 20 uppercase alphanumerics with no dots, usually
  // starting AKIA/ASIA. A real Creator API Credential ID is an
  // amzn1.application-oa2-client... value. If it looks like the former, say so.
  if (/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(credentialId) || /^[A-Z0-9]{20}$/.test(credentialId)) {
    return "This looks like a Product Advertising API access key, not a Creator API Credential ID. This card needs the Credential ID and Secret from the Amazon Creator Connections console (they start with amzn1.).";
  }
  return null;
}

// Map an auth/probe failure to a plain next step. The token endpoint returns
// OAuth error codes; the catalog endpoint returns PA-API-style { Errors } or an
// eligibility 4xx. Returns { message, eligibilityBlocked }.
export function guidanceFor(
  status: number,
  code: string,
  message: string,
): { message: string; eligibilityBlocked: boolean } | null {
  const c = code.toLowerCase();
  const m = message.toLowerCase();
  if (c.includes("invalid_client") || c.includes("unauthorized_client") || m.includes("invalid_client")) {
    return {
      message:
        "Amazon did not accept these credentials. Re-copy the Credential ID and Credential Secret from the Amazon Creator Connections console, and check for stray spaces.",
      eligibilityBlocked: false,
    };
  }
  if (c.includes("invalid_scope") || m.includes("scope")) {
    return {
      message:
        "Amazon rejected the Creator API scope. Confirm the Credential Version matches the region you selected, then try again.",
      eligibilityBlocked: false,
    };
  }
  if (c.includes("invalidpartnertag") || m.includes("partner tag") || m.includes("not registered")) {
    return {
      message:
        "Amazon did not accept the partner tag. Use your Associates tracking id (like tag-20) with no '@', and make sure it belongs to this marketplace.",
      eligibilityBlocked: false,
    };
  }
  // Eligibility: the credentials authenticate, but Amazon has not unlocked
  // Creator API access for the account yet (a new account needs qualifying
  // sales). This is where the backup-credentials offer applies.
  if (
    status === 403 ||
    (status === 400 &&
      (m.includes("not eligible") || m.includes("not authorized") || m.includes("access") || m.includes("permission")))
  ) {
    return {
      message:
        "Your credentials work, but Amazon has not unlocked the Creator API for this account yet. New accounts need a few qualifying sales first. You can use Influencer Butler's backup credentials in the meantime.",
      eligibilityBlocked: true,
    };
  }
  return null;
}

async function readError(res: Response): Promise<{ code: string; detail: string }> {
  try {
    const data = (await res.json()) as {
      Errors?: Array<{ Code?: string; Message?: string }>;
      errors?: Array<{ code?: string; message?: string }>;
      error?: string;
      error_description?: string;
      message?: string;
      Message?: string;
    };
    const first = data.Errors?.[0] ?? data.errors?.[0];
    const code = (first as { Code?: string })?.Code ?? (first as { code?: string })?.code ?? data.error ?? "";
    const detail =
      (first as { Message?: string })?.Message ??
      (first as { message?: string })?.message ??
      data.error_description ??
      data.message ??
      data.Message ??
      "";
    return { code, detail };
  } catch {
    return { code: "", detail: "" };
  }
}

async function test(creds: Record<string, string>): Promise<TestResult> {
  const credentialId = (creds.credentialId ?? "").trim();
  const credentialSecret = (creds.credentialSecret ?? "").trim();
  const partnerTag = normalizePartnerTag(creds.partnerTag);
  if (!credentialId || !credentialSecret || !partnerTag) {
    return { ok: false, message: "Enter your Credential ID, Credential Secret, and partner tag." };
  }
  const precheck = precheckCredentials(credentialId, credentialSecret);
  if (precheck) return { ok: false, message: precheck };

  const info = marketplaceInfoFor(creds.marketplace);
  const credentialVersion = (creds.credentialVersion ?? "").trim() || info.credentialVersion;

  let token: string;
  try {
    token = await mintCreatorsToken({ credentialId, credentialSecret, credentialVersion, region: info.region });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    const guidance = guidanceFor(e.status ?? 0, e.code ?? "", e.message ?? "");
    if (guidance) return { ok: false, message: guidance.message, eligibilityBlocked: guidance.eligibilityBlocked };
    return { ok: false, message: e.message || "Could not reach Amazon to mint a token. Are you online?" };
  }

  try {
    const res = await creatorsGetItems(token, {
      credentialVersion,
      marketplace: info.marketplace,
      partnerTag,
      itemIds: [PROBE_ASIN],
    });
    if (res.ok) return { ok: true, message: "Connected to the Amazon Creator API." };
    const { code, detail } = await readError(res);
    const guidance = guidanceFor(res.status, code, detail);
    if (guidance) {
      const suffix = detail ? `\n\nAmazon said: ${detail}` : "";
      return { ok: false, message: `${guidance.message}${suffix}`, eligibilityBlocked: guidance.eligibilityBlocked };
    }
    return { ok: false, message: detail || `Amazon returned ${res.status}.` };
  } catch {
    return { ok: false, message: "Could not reach the Amazon Creator API. Are you online?" };
  }
}

export const creatorsApiAdapter: IntegrationAdapter = {
  id: "creatorsApi",
  labelKey: "provCreatorsApi",
  category: "productData",
  hosts: CREATORS_HOST_PATTERNS,
  // The real OAuth2 Creator API, matching the desktop app: it needs the
  // Credential ID + Secret from the Amazon Creator Connections console, not the
  // older Product Advertising API access key.
  descriptionKey: "creatorsApiHint",
  credentialsUrl: CREATOR_API_CREDENTIALS_URL,
  fields: [
    { name: "credentialId", labelKey: "fieldCredentialId", type: "password" },
    { name: "credentialSecret", labelKey: "fieldCredentialSecret", type: "password" },
    {
      name: "credentialVersion",
      labelKey: "fieldCredentialVersion",
      type: "select",
      options: [
        { value: "3.0" },
        { value: "3.1" },
        { value: "3.2", recommended: true },
        { value: "3.3" },
        { value: "3.4" },
      ],
    },
    { name: "marketplace", labelKey: "fieldMarketplace", type: "text", placeholder: "www.amazon.com", optional: true },
    {
      name: "partnerTag",
      labelKey: "fieldPartnerTag",
      type: "text",
      placeholder: "mytag-20",
      normalize: normalizePartnerTag,
    },
  ],
  test,
};

// Kept exported for callers that normalize a marketplace value (e.g. the options
// page's per-region tests).
export { normalizeMarketplace };
