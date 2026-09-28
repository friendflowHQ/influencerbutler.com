import type { IntegrationAdapter, TestResult } from "../types";
import { REQUEST_TIMEOUT_MS, obj, str } from "../adapter-utils";
import { LinkNoticeError } from "../link-notice";
import { looksSignedOutUrl, mintWalmartCreatorLink } from "../walmart-creator-mint";

// Walmart affiliate link providers, mirroring the desktop app: both are
// session-based with no credential fields. The user signs in to the provider's
// site in this browser, and the extension mints links from that session.
//
// - Walmart Creator drives the signed-in creator.walmart.com portal in a
//   background tab and returns the real walmrt.us short link the portal mints
//   (see ../walmart-creator-mint).
// - Mavely posts one GraphQL mutation to creators.joinmavely.com with the
//   session cookie and returns the mave.ly short link. There is no API key;
//   the HttpOnly session cookie rides along because the host is granted.
//
// The user picks ONE in options (integrations.global.walmartLinkProvider),
// mirroring how the primary deeplink provider is chosen. routing.ts calls the
// chosen provider's generateLink for Walmart products and falls back to the
// plain /ip/ url (with a signInRequired notice where it applies) on any throw.

// ---------------------------------------------------------------------------
// Walmart Creator (creator.walmart.com) - portal session, walmrt.us links
// ---------------------------------------------------------------------------

const CREATOR_HOME = "https://creator.walmart.com/";

const walmartCreatorAdapter: IntegrationAdapter = {
  id: "walmartCreator",
  labelKey: "provWalmartCreator",
  category: "walmartLink",
  descriptionKey: "provWalmartCreatorDesc",
  // identity.walmart.com is where a signed-out portal fetch redirects; without
  // that host granted the redirect hop fails CORS and reads as "offline".
  hosts: ["https://creator.walmart.com/*", "https://identity.walmart.com/*"],
  credentialsUrl: CREATOR_HOME,
  fields: [],
  async test(): Promise<TestResult> {
    let res: Response;
    try {
      res = await fetch(CREATOR_HOME, {
        credentials: "include",
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach creator.walmart.com. Are you online?" };
    }
    if (looksSignedOutUrl(res.url || "")) {
      return {
        ok: false,
        message:
          "Sign in to Walmart Creator at creator.walmart.com in this browser, then test again.",
      };
    }
    if (!res.ok) {
      return { ok: false, message: `creator.walmart.com returned ${res.status}. Try again in a minute.` };
    }
    return { ok: true, message: "Signed in. Walmart links will mint as walmrt.us short links." };
  },
  async generateLink(target): Promise<string> {
    return mintWalmartCreatorLink(target.url);
  },
};

// ---------------------------------------------------------------------------
// Mavely (creators.joinmavely.com) - session cookie, mave.ly links
// ---------------------------------------------------------------------------

const MAVELY_ORIGIN = "https://creators.joinmavely.com";
const MAVELY_GRAPHQL_URL = `${MAVELY_ORIGIN}/api/graphql`;
const MAVELY_SESSION_URL = `${MAVELY_ORIGIN}/api/auth/session`;
const MAVELY_SIGNIN_MSG =
  "Sign in to Mavely at creators.joinmavely.com in this browser, then try again.";
const MAVELY_UNAUTH_RE = /unauth|not.?signed|forbidden/i;

// Verbatim from the Mavely creators web app bundle, matching the desktop app's
// integrations/mavelyClient.js.
const CREATE_AFFILIATE_LINK_MUTATION = `mutation createAffiliateLink($url: String!) {
  createAffiliateLink(url: $url) {
    id
    link
    metaTitle
    metaDescription
    metaImage
    metaUrl
    metaSiteName
    brand { id name slug }
    originalUrl
    canonicalLink
    attributionUrl
  }
}`;

const mavelyAdapter: IntegrationAdapter = {
  id: "mavely",
  labelKey: "provMavely",
  category: "walmartLink",
  descriptionKey: "provMavelyDesc",
  hosts: ["https://creators.joinmavely.com/*"],
  credentialsUrl: `${MAVELY_ORIGIN}/`,
  fields: [],
  async test(): Promise<TestResult> {
    let res: Response;
    try {
      res = await fetch(MAVELY_SESSION_URL, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Mavely. Are you online?" };
    }
    if (!res.ok) return { ok: false, message: MAVELY_SIGNIN_MSG };
    let session: Record<string, unknown> = {};
    try {
      session = obj(await res.json());
    } catch {
      // An empty body means no session; fall through to the sign-in message.
    }
    const email = str(obj(session.user).email);
    const signedIn = Boolean(email || session.userId || session.token);
    if (!signedIn) return { ok: false, message: MAVELY_SIGNIN_MSG };
    return {
      ok: true,
      message: email ? `Connected to Mavely as ${email}.` : "Connected to Mavely.",
    };
  },
  async generateLink(target): Promise<string> {
    let res: Response;
    try {
      res = await fetch(MAVELY_GRAPHQL_URL, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          query: CREATE_AFFILIATE_LINK_MUTATION,
          variables: { url: target.url },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Could not reach Mavely.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new LinkNoticeError("signInRequired", MAVELY_SIGNIN_MSG);
    }
    if (!res.ok) throw new Error(`Mavely returned ${res.status}.`);
    let data: Record<string, unknown> = {};
    try {
      data = obj(await res.json());
    } catch {
      throw new Error("Mavely returned an unreadable response.");
    }
    const errors = Array.isArray(data.errors) ? data.errors : [];
    if (errors.length) {
      const message = errors
        .map((e) => str(obj(e).message))
        .filter(Boolean)
        .join("; ");
      if (MAVELY_UNAUTH_RE.test(message)) {
        throw new LinkNoticeError("signInRequired", MAVELY_SIGNIN_MSG);
      }
      throw new Error(message || "Mavely could not create a link.");
    }
    const link = str(obj(obj(data.data).createAffiliateLink).link);
    if (!link) throw new Error("Mavely returned no link.");
    return link;
  },
};

export const walmartLinkAdapters: IntegrationAdapter[] = [walmartCreatorAdapter, mavelyAdapter];
