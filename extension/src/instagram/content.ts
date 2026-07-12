// Instagram Goldmine content script (self-hosted build only). Injected on
// instagram.com so the crawl's fetches are same-origin and carry the user's own
// logged-in session. It does no UI: the Goldmine tab (goldmine.html) drives it
// over a direct tab port and renders progress/results. Findings are emitted to
// the background the same way every other tool does, so they queue, dedupe, and
// dual-send to the website API and the desktop HUD with zero new plumbing.

import { runGoldmine, type GoldmineRow, type GoldmineSettings } from "./goldmine";
import { sendToBackground, type IgBioLinkResult } from "../shared/messages";
import type { InstagramCreatorFinding } from "../transport/types";

const PORT_NAME = "ib-goldmine";
const CACHE_KEY = "ib-ig-creator-cache";

let running = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  let aborted = false;
  const shouldAbort = () => aborted;

  port.onMessage.addListener((msg: { type?: string; settings?: GoldmineSettings }) => {
    if (msg?.type === "stop") {
      aborted = true;
      return;
    }
    if (msg?.type === "run" && msg.settings && !running) {
      running = true;
      void drive(port, msg.settings, shouldAbort).finally(() => {
        running = false;
      });
    }
  });

  // The Goldmine tab closed (or navigated away): stop the crawl rather than run
  // on with no consumer.
  port.onDisconnect.addListener(() => {
    aborted = true;
  });
});

async function drive(
  port: chrome.runtime.Port,
  settings: GoldmineSettings,
  shouldAbort: () => boolean,
): Promise<void> {
  const cache = await loadCache();
  const post = (message: unknown) => {
    try {
      port.postMessage(message);
    } catch {
      // port closed mid-run: the abort flag stops the loop on its own
    }
  };

  try {
    const summary = await runGoldmine({
      settings,
      cache,
      shouldAbort,
      onProgress: (progress) => post({ type: "progress", progress }),
      onRow: (row) => {
        emitFinding(row);
        post({ type: "row", row });
      },
      fetchBioLinkEmail: async (url) => {
        try {
          const res = await sendToBackground<IgBioLinkResult>({ kind: "IG_FETCH_BIO_LINK", url });
          return res?.email ?? null;
        } catch {
          return null;
        }
      },
    });
    await saveCache(cache);
    post({ type: "done", summary });
  } catch (error) {
    await saveCache(cache);
    post({ type: "error", message: error instanceof Error ? error.message : "Crawl failed" });
  }
}

// One harvested creator -> a finding sent to the background, which queues it and
// dual-sends to the website API and the desktop app (Pitch / Group Invite).
function emitFinding(row: GoldmineRow): void {
  const finding: InstagramCreatorFinding = {
    type: "instagram_creator",
    username: row.username,
    email: row.email,
    sourceHashtag: row.sourceHashtag,
    fullName: row.fullName,
    followerCount: row.followerCount,
    engagementRatePct: row.engagementRatePct,
    bioLinkUrl: row.bioLinkUrl,
    postUrl: row.postUrl,
    detectedAt: new Date().toISOString(),
  };
  void sendToBackground<void>({ kind: "RECORD_FINDING", finding }).catch(() => {
    // background waking; the client-side queue resends on the next flush
  });
}

async function loadCache(): Promise<Map<string, number>> {
  try {
    const out = await chrome.storage.local.get(CACHE_KEY);
    const raw = out?.[CACHE_KEY] as Record<string, number> | undefined;
    if (raw && typeof raw === "object") {
      return new Map(Object.entries(raw).filter(([, v]) => typeof v === "number"));
    }
  } catch {
    // no cache yet
  }
  return new Map();
}

async function saveCache(cache: Map<string, number>): Promise<void> {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(cache) });
  } catch {
    // best effort; a lost cache only means an extra revisit next run
  }
}
