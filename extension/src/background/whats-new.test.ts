import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeShow,
  getWhatsNewView,
  markWhatsNewSeen,
  noteInstall,
  pickRelease,
  resolvedSince,
  sectionItems,
  type Changelog,
  type WhatsNewState,
} from "./whats-new";
import { WHATS_NEW_STORAGE_KEY } from "../shared/constants";

// In-memory chrome.storage.local plus a stubbable manifest, mirroring the
// convention in update.test.ts. `ib` (the main state blob read by getState) is
// seeded signed-out so fetchResolvedFeedback short-circuits without a network
// call.
function stubChrome(opts: {
  manifest?: { version: string };
  stored?: Record<string, unknown>;
}) {
  const stored: Record<string, unknown> = {
    ib: { auth: { licenseKey: null, email: null, verifiedAt: null } },
    ...opts.stored,
  };
  const chromeStub = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete stored[key];
        }),
      },
    },
    runtime: {
      getManifest: () => opts.manifest ?? { version: "0.2.0" },
      getURL: (p: string) => `chrome-extension://test/${p}`,
    },
  };
  vi.stubGlobal("chrome", chromeStub);
  return { stored };
}

const CHANGELOG: Changelog = {
  releases: [
    {
      version: "0.2.0",
      date: "August 25, 2026",
      sections: [
        { heading: "New Features", items: ["Feature A", "Feature B", "Feature C", "Feature D"] },
        { heading: "Bug Fixes", items: ["Fix A", "Fix B"] },
        { heading: "Other Notable Changes", items: ["Other A"] },
      ],
    },
    { version: "0.1.9", date: "older", sections: [] },
  ],
};

function stubChangelogFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => CHANGELOG })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickRelease", () => {
  it("matches the exact version", () => {
    expect(pickRelease(CHANGELOG, "0.1.9")?.version).toBe("0.1.9");
  });
  it("falls back to the newest release when the version is absent", () => {
    expect(pickRelease(CHANGELOG, "9.9.9")?.version).toBe("0.2.0");
  });
  it("is null for an empty changelog", () => {
    expect(pickRelease({ releases: [] }, "0.2.0")).toBeNull();
    expect(pickRelease(null, "0.2.0")).toBeNull();
  });
});

describe("sectionItems", () => {
  const release = CHANGELOG.releases[0]!;
  it("returns all items by default, matched case-insensitively", () => {
    expect(sectionItems(release, "new features")).toEqual([
      "Feature A",
      "Feature B",
      "Feature C",
      "Feature D",
    ]);
  });
  it("caps to the top N when max is given", () => {
    expect(sectionItems(release, "New Features", 3)).toEqual(["Feature A", "Feature B", "Feature C"]);
  });
  it("is empty for a missing section or release", () => {
    expect(sectionItems(release, "Nope")).toEqual([]);
    expect(sectionItems(null, "New Features")).toEqual([]);
  });
});

describe("computeShow", () => {
  it("is false with no recorded state", () => {
    expect(computeShow(null, "0.2.0")).toBe(false);
  });
  it("is false after a fresh install (marker equals current)", () => {
    const state: WhatsNewState = { lastShownVersion: "0.2.0", previousVersion: null };
    expect(computeShow(state, "0.2.0")).toBe(false);
  });
  it("shows after an update when nothing has been shown yet", () => {
    const state: WhatsNewState = { lastShownVersion: null, previousVersion: "0.1.9" };
    expect(computeShow(state, "0.2.0")).toBe(true);
  });
  it("shows when the running version is ahead of the last shown", () => {
    const state: WhatsNewState = { lastShownVersion: "0.1.9", previousVersion: "0.1.9" };
    expect(computeShow(state, "0.2.0")).toBe(true);
  });
  it("is false once dismissed at the running version", () => {
    const state: WhatsNewState = { lastShownVersion: "0.2.0", previousVersion: null };
    expect(computeShow(state, "0.2.0")).toBe(false);
  });
});

describe("resolvedSince", () => {
  it("prefers the last shown version, then previous, then current", () => {
    expect(resolvedSince({ lastShownVersion: "0.1.5", previousVersion: "0.1.0" }, "0.2.0")).toBe("0.1.5");
    expect(resolvedSince({ lastShownVersion: null, previousVersion: "0.1.0" }, "0.2.0")).toBe("0.1.0");
    expect(resolvedSince({ lastShownVersion: null, previousVersion: null }, "0.2.0")).toBe("0.2.0");
    expect(resolvedSince(null, "0.2.0")).toBe("0.2.0");
  });
});

describe("noteInstall", () => {
  it("records the current version on a fresh install (nothing to announce)", async () => {
    const { stored } = stubChrome({ manifest: { version: "0.2.0" } });
    await noteInstall("install", undefined);
    expect(stored[WHATS_NEW_STORAGE_KEY]).toEqual({
      lastShownVersion: "0.2.0",
      previousVersion: null,
    });
  });

  it("leaves the marker behind on update so the notice appears", async () => {
    const { stored } = stubChrome({ manifest: { version: "0.2.0" } });
    await noteInstall("update", "0.1.9");
    expect(stored[WHATS_NEW_STORAGE_KEY]).toEqual({
      lastShownVersion: null,
      previousVersion: "0.1.9",
    });
  });

  it("keeps a prior lastShownVersion across a later update", async () => {
    const { stored } = stubChrome({
      manifest: { version: "0.3.0" },
      stored: {
        [WHATS_NEW_STORAGE_KEY]: { lastShownVersion: "0.2.0", previousVersion: null },
      },
    });
    await noteInstall("update", "0.2.0");
    expect(stored[WHATS_NEW_STORAGE_KEY]).toEqual({
      lastShownVersion: "0.2.0",
      previousVersion: "0.2.0",
    });
  });
});

describe("markWhatsNewSeen", () => {
  it("advances the marker to the running version", async () => {
    const { stored } = stubChrome({
      manifest: { version: "0.2.0" },
      stored: {
        [WHATS_NEW_STORAGE_KEY]: { lastShownVersion: null, previousVersion: "0.1.9" },
      },
    });
    await markWhatsNewSeen();
    expect(stored[WHATS_NEW_STORAGE_KEY]).toEqual({
      lastShownVersion: "0.2.0",
      previousVersion: null,
    });
  });
});

describe("getWhatsNewView", () => {
  it("does not show for a fresh install and skips the changelog fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    stubChrome({
      manifest: { version: "0.2.0" },
      stored: { [WHATS_NEW_STORAGE_KEY]: { lastShownVersion: "0.2.0", previousVersion: null } },
    });
    const view = await getWhatsNewView();
    expect(view.show).toBe(false);
    expect(view.features).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("assembles changelog highlights when an update is due", async () => {
    stubChangelogFetch();
    stubChrome({
      manifest: { version: "0.2.0" },
      stored: { [WHATS_NEW_STORAGE_KEY]: { lastShownVersion: null, previousVersion: "0.1.9" } },
    });
    const view = await getWhatsNewView();
    expect(view.show).toBe(true);
    expect(view.version).toBe("0.2.0");
    expect(view.date).toBe("August 25, 2026");
    expect(view.features).toEqual(["Feature A", "Feature B", "Feature C", "Feature D"]);
    expect(view.fixes).toEqual(["Fix A", "Fix B"]);
    expect(view.other).toEqual(["Other A"]);
    // Signed out (seeded), so no personalized reports.
    expect(view.reportedBugs).toEqual([]);
  });

  it("does not re-show once dismissed", async () => {
    stubChangelogFetch();
    stubChrome({
      manifest: { version: "0.2.0" },
      stored: { [WHATS_NEW_STORAGE_KEY]: { lastShownVersion: "0.2.0", previousVersion: null } },
    });
    const view = await getWhatsNewView();
    expect(view.show).toBe(false);
  });
});
