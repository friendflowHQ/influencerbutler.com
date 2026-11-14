import { describe, expect, it } from "vitest";
import {
  DRIP_STATUSES,
  advances,
  hasWrittenStep,
  inviteValuesFor,
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
