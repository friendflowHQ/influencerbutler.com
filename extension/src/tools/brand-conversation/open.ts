// Where a brand-conversation chip leads. Two destinations:
//  - Creator Connections: the conversation itself. From a CC page this clicks the
//    brand's row in the Messages drawer; from any other page it opens the campaigns
//    list with `#ib-open-thread=<brand>`, which the CC content script finishes
//    (tools/cc-messages/open-conversation.ts).
//  - The desktop app: Messenger Butler's conversation with the brand, through the
//    site's /app/open bounce page to influencerbutler://messenger?brand=<brand>
//    (the app's deep-link handler is app/protocolHandler.js in the desktop repo).

import { API_BASE } from "../../shared/constants";
import { buildOpenUrl } from "../cc-messages/open-target";

// /app/open rejects a `to` longer than this (src/app/app/open/route.ts).
const MAX_TO_LEN = 512;
const SCHEME_PREFIX = "influencerbutler://messenger?brand=";

export function buildDesktopDeepLink(brand: string): string {
  let name = brand.replace(/\s+/g, " ").trim();
  // Trim until the whole deep link fits the bounce page's limit.
  while (name.length > 0 && `${SCHEME_PREFIX}${encodeURIComponent(name)}`.length > MAX_TO_LEN) {
    name = name.slice(0, Math.max(0, name.length - 10)).trim();
  }
  return `${SCHEME_PREFIX}${encodeURIComponent(name)}`;
}

export function buildDesktopOpenUrl(brand: string): string {
  return `${API_BASE}/app/open?to=${encodeURIComponent(buildDesktopDeepLink(brand))}`;
}

export function creatorConnectionsUrl(brand: string): string {
  return buildOpenUrl(brand);
}

export function onCreatorConnectionsPage(hostname: string): boolean {
  return /^affiliate-program\.amazon\.(?:com|ca|co\.uk)$/i.test(hostname);
}
