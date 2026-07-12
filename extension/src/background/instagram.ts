import { IG_BIOLINK_FETCH_TIMEOUT_MS } from "../shared/constants";
import { extractEmailsFromText } from "../instagram/helpers";
import { log } from "../shared/log";
import type { RuntimeMessage } from "../shared/messages";

// Instagram Goldmine, background half (self-hosted build only). The crawl runs
// same-origin in an instagram.com content script, but a creator's bio-link
// points at a THIRD-PARTY site the content script cannot fetch cross-origin.
// So, exactly like the Deal Sites Harvester, the worker fetches it (the Goldmine
// page has already prompted the user to grant the host permission), sweeps it
// for an email, and returns the first hit. Credential-less and time-boxed.
//
// This whole module is referenced only behind `if (IB_IG_ENABLED)` in the
// background entry, so the public build dead-code-eliminates it away.

export function handleInstagramMessage(
  message: RuntimeMessage,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.kind === "IG_FETCH_BIO_LINK") {
    void harvestBioLinkEmail(message.url).then((email) => sendResponse({ email }));
    return true;
  }
  return false;
}

async function harvestBioLinkEmail(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IG_BIOLINK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    // Prefer a mailto: anchor (an explicit contact link), then any email in the
    // page text.
    const mailto = html.match(/mailto:([^"'?\s>]+)/i);
    if (mailto) {
      let addr = mailto[1] ?? "";
      try {
        addr = decodeURIComponent(addr);
      } catch {
        /* keep raw */
      }
      const found = extractEmailsFromText(addr);
      if (found[0]) return found[0];
    }
    return extractEmailsFromText(html)[0] ?? null;
  } catch (error) {
    log("ig", `bio-link fetch failed for ${url}`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
