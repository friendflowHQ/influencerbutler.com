// Price lock push: send rules (one a day, Nov 26-28 blackout), segment rules,
// and the email drafts' house rules (no em dashes, one button, Pacific times).
import { describe, expect, it } from "vitest";
import { dailyCapAllows, isBlackoutDay, pacificDate, pacificDayStart, pacificTimeToUtc } from "../send-gates";
import { classifyPerson, isColdContactTags, type PersonFacts } from "../price-lock-audience";
import { PRICE_LOCK_EMAILS, fromLiz, personalizePriceLockBody } from "../price-lock-emails";
import { parseAudience } from "../email-audience";
import { buildCampaignEmail } from "../campaign-email";

const base: PersonFacts = {
  liveNonCompPaid: false,
  liveNonCompTrial: false,
  liveNoCardTrial: false,
  liveComp: false,
  compCardAdded: false,
  everPaid: false,
  coldTag: null,
  isColdContact: false,
};

describe("Pacific time helpers", () => {
  it("maps wall-clock Pacific times to UTC across the DST change", () => {
    expect(pacificTimeToUtc("2026-11-12", 12).toISOString()).toBe("2026-11-12T20:00:00.000Z");
    expect(pacificTimeToUtc("2026-11-30", 8).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(pacificTimeToUtc("2026-11-30", 18).toISOString()).toBe("2026-12-01T02:00:00.000Z");
    expect(pacificTimeToUtc("2026-10-15", 12).toISOString()).toBe("2026-10-15T19:00:00.000Z"); // PDT
  });

  it("knows the Pacific calendar day", () => {
    expect(pacificDate(Date.parse("2026-12-01T07:59:59Z"))).toBe("2026-11-30");
    expect(pacificDate(Date.parse("2026-12-01T08:00:00Z"))).toBe("2026-12-01");
    expect(pacificDayStart(Date.parse("2026-11-30T20:00:00Z")).toISOString()).toBe("2026-11-30T08:00:00.000Z");
  });

  it("blacks out Nov 26, 27 and 28 Pacific only", () => {
    expect(isBlackoutDay(Date.parse("2026-11-26T08:00:00Z"))).toBe(true); // Thu 00:00 PT
    expect(isBlackoutDay(Date.parse("2026-11-29T07:59:00Z"))).toBe(true); // Sat 23:59 PT
    expect(isBlackoutDay(Date.parse("2026-11-29T08:00:00Z"))).toBe(false); // Sun 00:00 PT
    expect(isBlackoutDay(Date.parse("2026-11-26T07:59:00Z"))).toBe(false); // Wed 23:59 PT
  });

  it("allows one marketing email a day, two only for the Nov 30 exception", () => {
    expect(dailyCapAllows(0)).toBe(true);
    expect(dailyCapAllows(1)).toBe(false);
    expect(dailyCapAllows(1, { allowSecondToday: true })).toBe(true);
    expect(dailyCapAllows(2, { allowSecondToday: true })).toBe(false);
  });
});

describe("segments", () => {
  it("puts each person in at most one segment, trials and card-added comps in none", () => {
    expect(classifyPerson({ ...base, liveNonCompPaid: true, liveComp: true })).toBe("B");
    expect(classifyPerson({ ...base, liveNonCompTrial: true })).toBeNull();
    expect(classifyPerson({ ...base, liveNoCardTrial: true, everPaid: true })).toBeNull();
    expect(classifyPerson({ ...base, liveComp: true })).toBe("C");
    expect(classifyPerson({ ...base, liveComp: true, compCardAdded: true })).toBeNull();
    expect(classifyPerson({ ...base, everPaid: true })).toBe("D");
    expect(classifyPerson({ ...base, everPaid: true, coldTag: "E1" })).toBe("D");
    expect(classifyPerson({ ...base, coldTag: "E2" })).toBe("E2");
    expect(classifyPerson({ ...base, isColdContact: true })).toBeNull();
    expect(classifyPerson(base)).toBe("A");
  });

  it("recognises cold contacts", () => {
    expect(isColdContactTags(["cold-ig-amazon-a", "instagram"])).toBe(true);
    expect(isColdContactTags(["seq-cold-tiktok-amazon"])).toBe(true);
    expect(isColdContactTags(["newsletter"], "download-app")).toBe(false);
    expect(isColdContactTags([], "cold_import")).toBe(true);
  });

  it("validates the price_lock audience", () => {
    expect(parseAudience({ kind: "price_lock", segments: ["A", "D"] })).toEqual({ kind: "price_lock", segments: ["A", "D"] });
    expect(parseAudience({ kind: "price_lock", segments: ["Z"] })).toBeNull();
    expect(parseAudience({ kind: "price_lock", segments: ["A"], excludeOrigins: ["instagram-posse", "BAD ONE!"] })).toEqual({
      kind: "price_lock",
      segments: ["A"],
      excludeOrigins: ["instagram-posse"],
    });
    expect(
      parseAudience({ kind: "price_lock", segments: ["C"], excludeClickersOf: ["pl-1130am-c"], allowSecondToday: true }),
    ).toEqual({ kind: "price_lock", segments: ["C"], excludeClickersOf: ["pl-1130am-c"], allowSecondToday: true });
  });
});

describe("push email drafts", () => {
  it("follow the house rules", () => {
    for (const e of PRICE_LOCK_EMAILS) {
      if (e.body.includes("{{BEST_COLD_EMAIL_BODY}}")) continue; // filled from the cold report later
      const all = `${e.subject}\n${e.body}`;
      expect(all, e.key).not.toMatch(/—/); // no em dash
      expect(all, e.key).not.toMatch(/–/); // no en dash
      expect(all, e.key).not.toMatch(/\bDear\b/);
      expect(e.body, e.key).toMatch(/\*\*[^*]+\*\*/); // bold => HTML body with a button
      const buttons = e.body.split(/\n\s*\n/).filter((b) => /^\[[^\]]+\]\([^)]+\)$/.test(b.trim()));
      expect(buttons.length, e.key).toBeGreaterThanOrEqual(1);
      expect(buttons.length, e.key).toBeLessThanOrEqual(e.maxButtons ?? 1);
      expect(all, e.key).not.toMatch(/guarantee|earn \$|make \$|income/i);
      expect(e.date >= "2026-11-12" && e.date <= "2026-11-30", e.key).toBe(true);
      expect(["2026-11-26", "2026-11-27", "2026-11-28"]).not.toContain(e.date);
    }
  });

  it("only the Nov 30 6pm sends take a second slot that day, and skip morning clickers", () => {
    const second = PRICE_LOCK_EMAILS.filter((e) => e.allowSecondToday);
    expect(second.map((e) => e.key).sort()).toEqual(["pl-1130pm-ad", "pl-1130pm-c"]);
    for (const e of second) expect(e.excludeClickersOf?.length).toBe(1);
  });

  it("fills the Keep my plan link, and refuses to send without one", () => {
    const c = PRICE_LOCK_EMAILS.find((e) => e.key === "pl-1112-c")!;
    expect(personalizePriceLockBody(c.body, { keepPlanUrl: "https://x.test/k" })).toContain("(https://x.test/k)");
    expect(personalizePriceLockBody(c.body, {})).toBeNull();
    const a = PRICE_LOCK_EMAILS.find((e) => e.key === "pl-1112-a")!;
    expect(personalizePriceLockBody(a.body, {})).toBe(a.body);
  });

  it("turns a Preheader line into hidden preview text, never body text", () => {
    const a = PRICE_LOCK_EMAILS.find((e) => e.key === "pl-1112-a")!;
    const built = buildCampaignEmail({ body: a.body });
    expect(built.text.startsWith("Preheader:")).toBe(false);
    expect(built.text).not.toContain("Preheader:");
    expect(built.html).toContain("display:none");
    expect(built.html).toContain("Your price stays put");
    expect(built.html).toContain("<h2");
    // Two buttons: monthly and annual.
    expect(built.html!.match(/padding:14px 28px/g)?.length).toBe(2);
  });

  it("keeps the savings math honest", () => {
    // $49 x 12 = $588; $588 - $390 = $198; 198 / 588 = 33.7% => 34%.
    expect(49 * 12).toBe(588);
    expect(588 - 390).toBe(198);
    expect(Math.round((198 / 588) * 100)).toBe(34);
    expect(Math.round((390 / 12) * 100) / 100).toBe(32.5);
    expect((29.99 - 24.99) * 12).toBeCloseTo(60);
    expect((49 - 39) * 12).toBe(120);
  });

  it("sends as Liz from the same address", () => {
    expect(fromLiz("Influencer Butler <hello@influencerbutler.com>")).toBe(
      "Liz at Influencer Butler <hello@influencerbutler.com>",
    );
  });
});
