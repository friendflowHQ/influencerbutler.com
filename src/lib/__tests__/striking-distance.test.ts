import { describe, expect, it } from "vitest";
import {
  applyRecentEdits,
  actionableFirst,
  applySnapshot,
  benchmarkCtr,
  buildStrikingDistance,
  followUpFocus,
  groupByPage,
  isNoiseQuery,
  recheckDate,
  isBrandQuery,
  pageKindOf,
  recentEditDate,
  suggestAction,
  toPath,
  toSnapshot,
  type QueryPageRow,
} from "../striking-distance";

const row = (over: Partial<QueryPageRow>): QueryPageRow => ({
  query: "auto like instagram post",
  page: "https://www.influencerbutler.com/features/instagram-like-butler",
  clicks: 5,
  impressions: 100,
  position: 6.5,
  ...over,
});

describe("benchmarkCtr", () => {
  it("falls as position worsens and interpolates between whole positions", () => {
    expect(benchmarkCtr(1)).toBeGreaterThan(benchmarkCtr(3));
    expect(benchmarkCtr(3)).toBeGreaterThan(benchmarkCtr(10));
    const mid = benchmarkCtr(6.5);
    expect(mid).toBeLessThan(benchmarkCtr(6));
    expect(mid).toBeGreaterThan(benchmarkCtr(7));
  });
  it("clamps out-of-range positions", () => {
    expect(benchmarkCtr(0.2)).toBe(benchmarkCtr(1));
    expect(benchmarkCtr(80)).toBe(benchmarkCtr(20));
  });
});

describe("path helpers", () => {
  it("strips host, query string and hash", () => {
    expect(toPath("https://www.influencerbutler.com/blog/x?lang=es-ES#a")).toBe("/blog/x");
    expect(toPath("https://www.influencerbutler.com")).toBe("/");
  });
  it("classifies page kinds", () => {
    expect(pageKindOf("/")).toBe("home");
    expect(pageKindOf("/blog/x")).toBe("blog");
    expect(pageKindOf("/features/x")).toBe("feature");
    expect(pageKindOf("/tools/hashtag-generator")).toBe("tool");
    expect(pageKindOf("/guides/x")).toBe("guide");
    expect(pageKindOf("/best-amazon-influencer-tools")).toBe("guide");
    expect(pageKindOf("/course/amazon-influencer")).toBe("course");
  });
});

describe("isBrandQuery", () => {
  it("matches spaced and joined brand spellings only", () => {
    expect(isBrandQuery("Influencer Butler")).toBe(true);
    expect(isBrandQuery("influencerbutler login")).toBe(true);
    expect(isBrandQuery("auto like instagram post")).toBe(false);
  });
});

describe("buildStrikingDistance", () => {
  it("keeps positions 4 to 20, drops brand, top-3 and deep queries", () => {
    const out = buildStrikingDistance([
      row({ query: "influencer butler", position: 1.0, impressions: 226 }),
      row({ query: "already top three", position: 2.4 }),
      row({ query: "page two", position: 14, impressions: 60 }),
      row({ query: "too deep", position: 38 }),
      row({ query: "auto like instagram post", position: 6.5 }),
    ]);
    expect(out.map((r) => r.query).sort()).toEqual(["auto like instagram post", "page two"]);
  });

  it("drops queries under the impression floor", () => {
    expect(buildStrikingDistance([row({ impressions: 3 })])).toHaveLength(0);
    expect(buildStrikingDistance([row({ impressions: 3 })], { minImpressions: 1 })).toHaveLength(1);
  });

  it("merges pages per query with an impression-weighted position and the top page", () => {
    const out = buildStrikingDistance([
      row({ query: "idea list", page: "https://x.com/blog/a", impressions: 30, position: 8, clicks: 1 }),
      row({
        query: "idea list",
        page: "https://x.com/blog/b?lang=es-ES",
        impressions: 10,
        position: 12,
        clicks: 0,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].impressions).toBe(40);
    expect(out[0].position).toBeCloseTo((30 * 8 + 10 * 12) / 40, 5);
    expect(out[0].page).toBe("/blog/a");
    expect(out[0].pageKind).toBe("blog");
  });

  it("ranks by upside: more impressions at a better position beats a thin page-two row", () => {
    const out = buildStrikingDistance([
      row({ query: "small", impressions: 10, position: 15 }),
      row({ query: "big", impressions: 300, position: 7 }),
    ]);
    expect(out[0].query).toBe("big");
    expect(out[0].potentialClicks).toBeGreaterThan(out[1].potentialClicks);
  });

  it("respects the limit and never reports negative upside", () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ query: `q${i}`, impressions: 20 + i }));
    const out = buildStrikingDistance(many, { limit: 10 });
    expect(out).toHaveLength(10);
    expect(out.every((r) => r.potentialClicks >= 0)).toBe(true);
  });

  it("ignores zero-impression rows", () => {
    expect(buildStrikingDistance([row({ impressions: 0 })])).toHaveLength(0);
  });
});

describe("suggestAction", () => {
  it("asks for a title rewrite when a page-one row is seen but not clicked", () => {
    const text = suggestAction({ position: 5, ctr: 0.004, impressions: 200, pageKind: "feature" });
    expect(text).toMatch(/title and meta description/);
  });
  it("suggests on-page phrasing for healthy page-one rows", () => {
    const text = suggestAction({ position: 8, ctr: 0.03, impressions: 50, pageKind: "blog" });
    expect(text).toMatch(/H1/);
  });
  it("suggests a dedicated section for page-two blog rows", () => {
    expect(suggestAction({ position: 15, ctr: 0, impressions: 30, pageKind: "blog" })).toMatch(/Page 2/);
  });
});

describe("weekly snapshot", () => {
  const live = buildStrikingDistance([row({ query: "a", position: 6 }), row({ query: "b", position: 9 })]);

  it("stores queries with the supplied timestamp", () => {
    const snap = toSnapshot(live, "2026-10-05T14:00:00.000Z");
    expect(snap.takenAt).toBe("2026-10-05T14:00:00.000Z");
    expect(snap.rows.map((r) => r.query).sort()).toEqual(["a", "b"]);
  });

  it("flags new queries and carries previous positions", () => {
    const snap = { takenAt: "t", rows: [{ query: "a", position: 8.5, impressions: 90, clicks: 4 }] };
    const out = applySnapshot(live, snap);
    const a = out.find((r) => r.query === "a")!;
    const b = out.find((r) => r.query === "b")!;
    expect(a.isNew).toBe(false);
    expect(a.prevPosition).toBe(8.5);
    expect(b.isNew).toBe(true);
    expect(b.prevPosition).toBeNull();
  });

  it("leaves rows untouched without a snapshot", () => {
    expect(applySnapshot(live, null)).toBe(live);
  });
});

describe("recent edits", () => {
  const now = new Date("2026-10-21T15:00:00Z");
  const map = {
    "/features/instagram-like-butler": "2026-10-21",
    "/blog/old-post": "2026-08-01",
    "/compare/x": "2026-09-21",
  };

  it("flags pages edited inside the Search Console window", () => {
    expect(recentEditDate("/features/instagram-like-butler", map, now)).toBe("2026-10-21");
    expect(recentEditDate("/features/instagram-like-butler/", map, now)).toBe("2026-10-21");
    expect(recentEditDate("/compare/x", map, now)).toBe("2026-09-21");
  });

  it("ignores old edits and unknown pages", () => {
    expect(recentEditDate("/blog/old-post", map, now)).toBeNull();
    expect(recentEditDate("/nope", map, now)).toBeNull();
  });

  it("annotates rows without touching anything else", () => {
    const rows = buildStrikingDistance([row({})]);
    const out = applyRecentEdits(rows, map, now);
    expect(out[0].recentlyUpdated).toBe("2026-10-21");
    expect(out[0].action).toBe(rows[0].action);
    expect(applyRecentEdits(rows, {}, now)[0].recentlyUpdated).toBeNull();
  });
});

describe("noise filter", () => {
  it("flags host-like and truncated queries only", () => {
    expect(isNoiseQuery("site.help.openai.com chatgpt subscription api billed separately or")).toBe(true);
    expect(isNoiseQuery("site:example.com foo")).toBe(true);
    expect(isNoiseQuery("how to use the")).toBe(true);
    expect(isNoiseQuery("chatgpt vs openai api")).toBe(false);
    expect(isNoiseQuery("amazon idea list")).toBe(false);
  });
  it("is applied when building the list", () => {
    const out = buildStrikingDistance([row({ query: "foo.com bar" }), row({ query: "real one" })]);
    expect(out.map((r) => r.query)).toEqual(["real one"]);
  });
});

describe("groupByPage and ordering", () => {
  const rows = buildStrikingDistance([
    row({ query: "a", impressions: 300, position: 7 }),
    row({ query: "b", impressions: 100, position: 8 }),
    row({ query: "c", page: "https://x.com/blog/other", impressions: 50, position: 9 }),
  ]);

  it("folds same-page queries under the top one and sums upside", () => {
    const out = groupByPage(rows);
    expect(out).toHaveLength(2);
    expect(out[0].query).toBe("a");
    expect(out[0].relatedQueries?.map((q) => q.query)).toEqual(["b"]);
    expect(out[0].potentialClicks).toBeCloseTo(rows[0].potentialClicks + rows[1].potentialClicks, 5);
    expect(out[1].relatedQueries).toEqual([]);
  });

  it("puts rows waiting on Google last, keeping order inside each group", () => {
    const tagged = rows.map((r, i) => ({ ...r, recentlyUpdated: i === 0 ? "2026-10-21" : null }));
    expect(actionableFirst(tagged).map((r) => r.query)).toEqual(["b", "c", "a"]);
  });
});

describe("re-check guidance", () => {
  it("adds the window to the edit date", () => {
    expect(recheckDate("2026-10-21")).toBe("2026-11-21");
    expect(recheckDate("nope")).toBeNull();
  });
  it("points at CTR for seen-but-not-clicked rows, rank otherwise", () => {
    expect(followUpFocus({ position: 6, ctr: 0, impressions: 166 })).toBe("ctr");
    expect(followUpFocus({ position: 15, ctr: 0, impressions: 166 })).toBe("rank");
    expect(followUpFocus({ position: 6, ctr: 0.05, impressions: 166 })).toBe("rank");
  });
});
