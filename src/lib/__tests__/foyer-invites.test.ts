import { describe, expect, it } from "vitest";
import {
  advances,
  creatorCountPhrase,
  inviteValuesFor,
  isExpired,
  isValidInviteCode,
  newInviteCode,
  personalizeInviteText,
} from "@/lib/foyer-invites";

const row = {
  first_name: "Jamie",
  ig_handle: "examplecozyhome",
  opener: "Your budget fall mantel reel is the kind of post people save.",
  code: "abcDEF123456_-xy",
  expires_at: "2026-11-25T15:00:00.000Z",
};

describe("creatorCountPhrase", () => {
  it("rounds down so the claim is never an overstatement", () => {
    expect(creatorCountPhrase(347)).toBe("300+");
    expect(creatorCountPhrase(1290)).toBe("1200+");
    expect(creatorCountPhrase(64)).toBe("60+");
  });
  it("drops the number when it is small", () => {
    expect(creatorCountPhrase(12)).toBe("Creators");
    expect(creatorCountPhrase(Number.NaN)).toBe("Creators");
  });
});

describe("personalizeInviteText", () => {
  it("fills every placeholder", () => {
    const v = inviteValuesFor(row, "300+");
    const out = personalizeInviteText(
      "Hi {{INVITE_FIRST_NAME}}, @{{INVITE_HANDLE}}. {{INVITE_OPENER}} {{INVITE_PREVIEW_URL}} until {{INVITE_EXPIRES}}. {{CREATOR_COUNT}} creators",
      v,
    );
    expect(out).toContain("Hi Jamie, @examplecozyhome.");
    expect(out).toContain("/p/abcDEF123456_-xy");
    expect(out).toContain("November 25");
    expect(out).toContain("300+ creators");
    expect(out).not.toMatch(/\{\{/);
  });
  it("refuses to send when a needed value is empty", () => {
    const v = inviteValuesFor(row, "");
    expect(personalizeInviteText("{{CREATOR_COUNT}} creators", v)).toBeNull();
    expect(personalizeInviteText("no placeholders here", v)).toBe("no placeholders here");
  });
  it("refuses an unknown leftover placeholder", () => {
    expect(personalizeInviteText("Hi {{SOMETHING_ELSE}}", inviteValuesFor(row, "300+"))).toBeNull();
  });
  it("falls back to 'there' with no first name", () => {
    const v = inviteValuesFor({ ...row, first_name: "" }, "300+");
    expect(personalizeInviteText("Hi {{INVITE_FIRST_NAME}},", v)).toBe("Hi there,");
  });
});

describe("funnel helpers", () => {
  it("only moves forward and never out of declined", () => {
    expect(advances("sent", "viewed")).toBe(true);
    expect(advances("claimed", "viewed")).toBe(false);
    expect(advances("declined", "claimed")).toBe(false);
  });
  it("expires an unclaimed preview but never a claimed one", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(isExpired({ expires_at: past, status: "sent" })).toBe(true);
    expect(isExpired({ expires_at: past, status: "claimed" })).toBe(false);
    expect(isExpired({ expires_at: null, status: "drafted" })).toBe(false);
  });
  it("mints codes that pass validation", () => {
    for (let i = 0; i < 20; i += 1) expect(isValidInviteCode(newInviteCode())).toBe(true);
    expect(isValidInviteCode("../etc")).toBe(false);
  });
});
