import type { DeeplinkProviderId, IntegrationAdapter, LinkTarget, TestResult } from "../types";
import { withAffiliateTag } from "../url";

// Deeplink providers (PostTap, Linktw.in, URLGenius, Geniuslink, self-hosted).
//
// Wrapping a product url in a provider's tracked/branded link is pure string
// construction from the user's own link pattern, so it needs no network call
// and no host permission. The user pastes their link pattern (which encodes
// their branded domain and account), and we validate and apply it. A pattern
// uses {url} for the affiliate-tagged product url, url-encoded (or {rawurl} for
// the un-encoded form).
//
// Live API-key verification against each provider is intentionally NOT done
// here: their endpoints are proprietary and undocumented publicly, so guessing
// them would produce false failures. The adapter validates the link pattern
// instead; a real ping can be dropped into test() once an endpoint is confirmed
// (see the plan's open items). OpenAI and the Amazon PA-API do make real calls.

type DeeplinkMeta = {
  id: DeeplinkProviderId;
  labelKey: string;
  templatePlaceholder: string;
};

const PROVIDERS: DeeplinkMeta[] = [
  { id: "posttap", labelKey: "provPosttap", templatePlaceholder: "https://go.yourbrand.com/?url={url}" },
  { id: "linktwin", labelKey: "provLinktwin", templatePlaceholder: "https://linktw.in/api/redirect?url={url}" },
  { id: "urlgenius", labelKey: "provUrlgenius", templatePlaceholder: "https://links.yourbrand.com/?url={url}" },
  { id: "geniuslink", labelKey: "provGeniuslink", templatePlaceholder: "https://geni.us/redirect?url={url}" },
  { id: "selfhosted", labelKey: "provSelfhosted", templatePlaceholder: "https://links.yoursite.com/go?url={url}" },
];

function templateValid(template: string): boolean {
  return template.includes("{url}") || template.includes("{rawurl}");
}

export function applyTemplate(template: string, target: LinkTarget): string {
  const tagged = target.tag ? withAffiliateTag(target.url, target.tag) : target.url;
  return template
    .split("{url}").join(encodeURIComponent(tagged))
    .split("{rawurl}").join(tagged)
    .split("{tag}").join(target.tag ?? "")
    .split("{asin}").join(target.asin);
}

function makeAdapter(meta: DeeplinkMeta): IntegrationAdapter {
  return {
    id: meta.id,
    labelKey: meta.labelKey,
    category: "deeplink",
    hosts: [],
    fields: [
      { name: "linkTemplate", labelKey: "fieldLinkTemplate", type: "text", placeholder: meta.templatePlaceholder },
    ],
    async test(creds): Promise<TestResult> {
      const template = (creds.linkTemplate ?? "").trim();
      if (!template) {
        return { ok: true, message: "No link pattern set. Links will carry your affiliate tag only." };
      }
      if (!templateValid(template)) {
        return { ok: false, message: "Add {url} where the product link goes in your pattern." };
      }
      return { ok: true, message: "Link pattern looks valid." };
    },
    async generateLink(target, creds): Promise<string> {
      const template = (creds.linkTemplate ?? "").trim();
      const tagged = target.tag ? withAffiliateTag(target.url, target.tag) : target.url;
      if (!template || !templateValid(template)) return tagged;
      return applyTemplate(template, target);
    },
  };
}

export const deeplinkAdapters: IntegrationAdapter[] = PROVIDERS.map(makeAdapter);
