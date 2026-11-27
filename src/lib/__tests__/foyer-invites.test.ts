import { describe, expect, it } from "vitest";
import {
  DRIP_STATUSES,
  advances,
  hasWrittenStep,
  inviteValuesFor,
  isCrawlerUserAgent,
  isExpired,
  isValidInviteCode,
  newInviteCode,
  normalizeEmailSteps,
  personalizeInviteText,
  normalizeOpportunities,
  publicOpportunities,
  FREE_CAMPAIGN_POSTS,
} from "@/lib/foyer-invites";

const steps = [
  { subject: "@examplecozyhome, your Storefront Score is 46", body: "Hey Jamie,\n\nYour page: {{INVITE_PREVIEW_URL}}\n\nLiz" },
  { subject: "The #1 fix for your storefront", body: "Details: {{INVITE_PREVIEW_URL}}" },
  { subject: "What happens when you claim", body: "Claim: {{INVITE_PREVIEW_URL}}" },
  { subject: "Last note", body: "Stays up 90 days, remove anytime. {{INVITE_PREVIEW_URL}}" },
];

const row = {
  first_name: "Jamie",
  ig_handle: "examplecozyhome",
  code: "abcDEF123456_-xy",
  expires_at: "2027-02-08T15:00:00.000Z",
  email_steps: steps,
};

describe("personalizeInviteText", () => {
  it("fills a step slot with that creator's own email, then the link", () => {
    const v = inviteValuesFor(row);
    expect(personalizeInviteText("{{INVITE_SUBJECT_1}}", v)).toBe("@examplecozyhome, your Storefront Score is 46");
    const body = personalizeInviteText("{{INVITE_BODY_1}}", v);
    expect(body).toContain("/p/abcDEF123456_-xy");
    expect(body).not.toMatch(/\{\{/);
  });

  it("returns null (hold) for a step with no written email", () => {
    const v = inviteValuesFor(row);
    expect(personalizeInviteText("{{INVITE_BODY_5}}", v)).toBeNull();
    expect(hasWrittenStep(row, 4)).toBe(true);
    expect(hasWrittenStep(row, 5)).toBe(false);
  });

  it("refuses an unknown leftover placeholder", () => {
    expect(personalizeInviteText("Hi {{CREATOR_COUNT}}", inviteValuesFor(row))).toBeNull();
  });
});

describe("normalizeEmailSteps", () => {
  it("accepts written emails and rejects empty or em-dash copy", () => {
    expect(normalizeEmailSteps(steps)).toHaveLength(4);
    expect(normalizeEmailSteps([{ subject: "", body: "x" }])).toBeNull();
    expect(normalizeEmailSteps([{ subject: "Hi \u2014 there", body: "x" }])).toBeNull();
    expect(normalizeEmailSteps("nope")).toBeNull();
  });
});

describe("funnel helpers", () => {
  it("only moves forward and never out of removed or declined", () => {
    expect(advances("sent", "viewed")).toBe(true);
    expect(advances("claimed", "viewed")).toBe(false);
    expect(advances("removed", "claimed")).toBe(false);
    expect(advances("declined", "claimed")).toBe(false);
    expect(DRIP_STATUSES).not.toContain("replied");
  });

  it("expires an unclaimed page at 90 days or once its content is gone, never a claimed one", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(isExpired({ expires_at: past, status: "sent" })).toBe(true);
    expect(isExpired({ expires_at: past, status: "claimed" })).toBe(false);
    expect(isExpired({ expires_at: null, status: "drafted" })).toBe(false);
    expect(isExpired({ expires_at: null, status: "viewed", content_deleted_at: past })).toBe(true);
  });

  it("mints codes that pass validation", () => {
    for (let i = 0; i < 20; i += 1) expect(isValidInviteCode(newInviteCode())).toBe(true);
    expect(isValidInviteCode("../etc")).toBe(false);
  });
});

describe("v3 opportunities", () => {
  const post = (asin: string, deal: boolean, campaign: boolean) => ({
    postUrl: `https://www.amazon.com/shop/x/photo/${asin}`,
    thumbUrl: "",
    kind: "photo",
    title: asin,
    asin,
    deal: deal ? { percentOff: 20 } : null,
    campaign: campaign ? { ratePct: 10 } : null,
    perSale: { base: null, campaign: null },
    caption: "",
  });

  it("accepts only posts that are the creator's own Amazon posts with a deal or campaign", () => {
    expect(normalizeOpportunities({ posts: [post("A", true, false)], counts: { deals: 1, campaigns: 0 } })).not.toBeNull();
    expect(normalizeOpportunities({ posts: [] })).toBeNull();
    expect(normalizeOpportunities({ posts: [{ ...post("A", true, false), postUrl: "https://evil.example/x" }] })).toBeNull();
    expect(normalizeOpportunities({ posts: [post("A", false, false)] })).toBeNull();
  });

  it("shows every deal post but only the first campaign posts before claim", () => {
    const op = normalizeOpportunities({
      posts: [post("D1", true, false), post("C1", false, true), post("C2", false, true), post("C3", false, true), post("C4", false, true), post("B1", true, true)],
      counts: { deals: 2, campaigns: 5 },
    });
    const before = publicOpportunities(op, false);
    expect(before.dealPosts.map((p) => p.asin)).toEqual(["D1", "B1"]);
    expect(before.campaignPosts).toHaveLength(FREE_CAMPAIGN_POSTS);
    expect(before.lockedCampaigns).toBe(1);
    const after = publicOpportunities(op, true);
    expect(after.campaignPosts).toHaveLength(4);
    expect(after.lockedCampaigns).toBe(0);
  });
});

describe("invite captions with the creator's own tracking ID", () => {
  it("swaps the post link for a /dp/ link with a bare ?tag=", async () => {
    const { captionWithTag } = await import("@/app/p/[code]/ClaimPanel");
    const cap = "Deal alert! Mop\n17% off right now.\nShop it here: https://www.amazon.com/vdp/0a15295825694a21a52df8c58c1ab0bd\n#ad #founditonamazon";
    expect(captionWithTag(cap, "B08ZB59MZX", "lizdean-20")).toContain("Shop it here: https://www.amazon.com/dp/B08ZB59MZX?tag=lizdean-20\n#ad");
    expect(captionWithTag(cap, "B08ZB59MZX", "")).toBe(cap);
    expect(captionWithTag(cap, "bad", "lizdean-20")).toBe(cap);
  });
});

describe("Creator Connections campaign links", () => {
  it("passes only Amazon's own campaign request page", async () => {
    const { campaignConnectUrl } = await import("@/lib/foyer-invites");
    const good = "https://affiliate-program.amazon.com/p/connect/request?adId=A1&campaignId=C9&type=cc&status=opportunity";
    const c = (connectUrl: string) => ({ campaign: { ratePct: 20, connectUrl } });
    expect(campaignConnectUrl(c(good))).toContain("campaignId=C9");
    expect(campaignConnectUrl(c("https://affiliate-program.amazon.com.evil.test/p/connect/request?campaignId=C9"))).toBeNull();
    expect(campaignConnectUrl(c("http://affiliate-program.amazon.com/p/connect/request?campaignId=C9"))).toBeNull();
    expect(campaignConnectUrl(c("https://affiliate-program.amazon.com/p/connect/request?adId=A1"))).toBeNull();
    expect(campaignConnectUrl(c("javascript:alert(1)"))).toBeNull();
    expect(campaignConnectUrl({ campaign: null })).toBeNull();
    expect(campaignConnectUrl(c("https://affiliate-program.amazon.com/p/connect/requests?status=opportunity&type=affiliate-plus&keyword=B01F36JEXE"))).toContain("keyword=B01F36JEXE");
    expect(campaignConnectUrl(c("https://affiliate-program.amazon.com/p/connect/requests?status=opportunity&keyword=<script>"))).toBeNull();
    expect(campaignConnectUrl(c("https://affiliate-program.amazon.com/p/other?keyword=B01F36JEXE"))).toBeNull();
  });
});

describe("Black Friday (shopping event) posts", () => {
  const evPost = (asin: string, endsAt: string, live = false) => ({
    postUrl: `https://www.amazon.com/shop/x/photo/${asin}`,
    thumbUrl: "",
    kind: "photo",
    title: asin,
    asin,
    deal: { percentOff: 30, live, startsDay: "Nov 19", endsAt },
    campaign: null,
    perSale: { base: 1, campaign: null },
    caption: "x",
  });
  const NOW = Date.parse("2026-11-14T12:00:00Z");
  const event = (posts: unknown[]) => ({ id: "black-friday-cyber-monday", label: "Black Friday", startsAt: "2026-11-19T08:00:00.000Z", endsAt: "2026-11-30T23:59:59.000Z", count: 23, live: 1, posts });

  it("accepts a page with only Black Friday posts, never a foreign link", async () => {
    const op = normalizeOpportunities({ posts: [], event: event([evPost("E1", "2026-12-01T07:59:00Z")]) });
    expect(op?.event?.count).toBe(23);
    expect(op?.counts.event).toBe(23);
    expect(normalizeOpportunities({ posts: [], event: event([{ ...evPost("E1", "2026-12-01T07:59:00Z"), postUrl: "https://evil.example/x" }]) })).toBeNull();
  });

  it("shows event posts first, without repeating them under On sale today, and hides them once over", async () => {
    const { currentInviteEvent } = await import("@/lib/foyer-invites");
    const op = normalizeOpportunities({
      posts: [{ ...evPost("E1", "2026-12-01T07:59:00Z", true), caption: "" }, { ...evPost("D1", "2026-12-01T07:59:00Z", true) }],
      event: event([evPost("E1", "2026-12-01T07:59:00Z", true), evPost("E2", "2026-11-20T07:59:00Z")]),
    });
    const now = publicOpportunities(op, false, NOW);
    // E2 is not live yet: never shown before it starts (Amazon's terms).
    expect(now.eventPosts.map((p) => p.asin)).toEqual(["E1"]);
    expect(now.event?.count).toBe(1);
    expect(now.dealPosts.map((p) => p.asin)).toEqual(["D1"]);
    expect(currentInviteEvent(op, Date.parse("2026-11-21T12:00:00Z"))?.posts.map((p) => p.asin)).toEqual(["E1"]);
    expect(currentInviteEvent(op, Date.parse("2026-12-03T12:00:00Z"))).toBeNull();
  });

  it("a deal with a start time shows only once it has started", async () => {
    const { currentInviteEvent, dealIsLive } = await import("@/lib/foyer-invites");
    const later = { ...evPost("E3", "2026-12-01T07:59:00Z", true), deal: { percentOff: 30, live: true, startsAt: "2026-11-19T08:00:00Z", endsAt: "2026-12-01T07:59:00Z" } };
    const op = normalizeOpportunities({ posts: [], event: event([later]) });
    expect(dealIsLive(later, NOW)).toBe(false);
    expect(currentInviteEvent(op, NOW)).toBeNull();
    expect(currentInviteEvent(op, Date.parse("2026-11-20T12:00:00Z"))?.posts.map((p) => p.asin)).toEqual(["E3"]);
    const onSale = publicOpportunities(normalizeOpportunities({ posts: [later] }), false, NOW);
    expect(onSale.dealPosts).toEqual([]);
  });
});

describe("invite funnel timings and automatic conversion", () => {
  it("medians, fastest and slowest per step, skipping out-of-order rows", async () => {
    const { stageTimings } = await import("@/lib/foyer-invites");
    const h = (n: number) => new Date(Date.parse("2026-11-01T00:00:00Z") + n * 3600000).toISOString();
    const rows = [
      { sent_at: h(0), viewed_at: h(2), claimed_at: h(3), activated_at: h(4), converted_at: h(3 + 24 * 14) },
      { sent_at: h(0), viewed_at: h(10), claimed_at: h(30) },
      { sent_at: h(0), viewed_at: h(4) },
      { sent_at: null, viewed_at: h(1) },
      { sent_at: h(5), viewed_at: h(1) },
    ];
    const t = Object.fromEntries(stageTimings(rows as never).map((s) => [s.key, s]));
    expect(t.sent_viewed).toMatchObject({ count: 3, medianHours: 4, fastestHours: 2, slowestHours: 10 });
    expect(t.viewed_claimed).toMatchObject({ count: 2, medianHours: 10.5 });
    expect(t.claimed_converted).toMatchObject({ count: 1, medianHours: 336 });
    expect(t.sent_converted.count).toBe(1);
  });

  it("marks matching invites converted by claiming account or email, skipping removed ones", async () => {
    const { markInvitesConverted } = await import("@/lib/foyer-invites");
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    let orFilter = "";
    const rows = [
      { id: "a", email: "jo@example.com", status: "published" },
      { id: "b", email: "jo@example.com", status: "replied" },
      { id: "c", email: "jo@example.com", status: "removed" },
    ];
    const db = {
      from: (table: string) => ({
        select: () => ({
          or: (f: string) => {
            orFilter = f;
            return { is: () => ({ limit: async () => ({ data: rows, error: null }) }) };
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            if (table === "foyer_invites") updates.push({ id, patch });
            return { error: null };
          },
          then: undefined,
        }),
      }),
    };
    // cancelInviteEnrollment chains .eq().eq(); give it a tolerant stub.
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    const realFrom = db.from;
    (db as { from: unknown }).from = (table: string) =>
      table === "email_sequence_enrollments" ? { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) } : realFrom(table);
    const n = await markInvitesConverted(db as never, { userId: "11111111-2222-3333-4444-555555555555", email: "Jo@Example.com" });
    expect(n).toBe(2);
    expect(orFilter).toBe("claim_user_id.eq.11111111-2222-3333-4444-555555555555,email.eq.jo@example.com");
    expect(updates.map((u) => u.id)).toEqual(["a", "b"]);
    expect(updates[0].patch).toMatchObject({ status: "converted" });
    expect(updates[0].patch.converted_at).toBeTruthy();
    expect(updates[1].patch).toMatchObject({ status: "converted" });
    expect(await markInvitesConverted(db as never, {})).toBe(0);
  });
});

describe("never contact anyone twice (prior contact)", () => {
  // Minimal Supabase stand-in: each table returns the rows given, whatever the filters.
  const fakeDb = (tables: Record<string, unknown[]>) => {
    const chain = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "neq", "gte"]) q[m] = () => q;
      q.limit = async () => ({ data: rows, error: null });
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      return q;
    };
    return { from: (t: string) => chain(tables[t] ?? []) } as never;
  };

  it("refuses an account holder, another open sequence, or another campaign's recent email", async () => {
    const { priorContactReason } = await import("@/lib/foyer-invites");
    expect(await priorContactReason(fakeDb({ profiles: [{ id: "u1" }] }), "a@b.co")).toMatch(/account/);
    expect(await priorContactReason(fakeDb({ email_sequence_enrollments: [{ sequence_id: "x" }] }), "a@b.co")).toMatch(/another email sequence/);
    expect(await priorContactReason(fakeDb({ email_sends: [{ category: "seq_1a5e05b1_s1" }] }), "a@b.co")).toMatch(/another campaign/);
  });

  it("lets a true cold lead through, and ignores the invite sequence's own sends", async () => {
    const { priorContactReason } = await import("@/lib/foyer-invites");
    expect(await priorContactReason(fakeDb({}), "a@b.co")).toBeNull();
    expect(await priorContactReason(fakeDb({ email_sends: [{ category: "seq_f0e10001_s1" }] }), "a@b.co")).toBeNull();
  });
});

describe("pending (no-email) invites for public requests", () => {
  it("builds a never-deliverable placeholder per handle and recognises it", async () => {
    const { pendingInviteEmail, isPendingInviteEmail, PENDING_EMAIL_DOMAIN } = await import("@/lib/foyer-invites");
    expect(pendingInviteEmail(" Some.Creator ")).toBe(`some.creator@${PENDING_EMAIL_DOMAIN}`);
    expect(PENDING_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
    expect(isPendingInviteEmail(pendingInviteEmail("abc"))).toBe(true);
    expect(isPendingInviteEmail("ABC@PENDING.INVITE.INVALID")).toBe(true);
    expect(isPendingInviteEmail("real@gmail.com")).toBe(false);
    expect(isPendingInviteEmail(null)).toBe(false);
  });
});

describe("isCrawlerUserAgent", () => {
  it("skips Facebook's link-preview fetchers and other crawlers", () => {
    const bots = [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "facebookexternalhit/1.1;line-poker/1.0",
      "Facebot",
      "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      "meta-externalfetcher/1.1",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "TelegramBot (like TwitterBot)",
      "curl/8.4.0",
      "",
      null,
      undefined,
    ];
    for (const ua of bots) expect(isCrawlerUserAgent(ua), String(ua)).toBe(true);
  });

  it("counts real browsers, including Facebook's in-app browser", () => {
    const people = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      // Facebook app's in-app browser (a person tapping the link in a comment)
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.40.97;FBBV/655000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]",
      "Mozilla/5.0 (Linux; Android 14; SM-S918U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0.0.48.106;]",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    ];
    for (const ua of people) expect(isCrawlerUserAgent(ua), ua).toBe(false);
  });
});
