import { describe, expect, it } from "vitest";
import {
  applySnapshot,
  benchmarkCtr,
  buildStrikingDistance,
  isBrandQuery,
  pageKindOf,
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
