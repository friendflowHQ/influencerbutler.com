import { describe, expect, it } from "vitest";
import { isOwnUiHost, isTypingTarget, shortcutFor } from "./shortcuts";

const div = { tagName: "DIV" };

describe("shortcutFor", () => {
  it("maps the four keys", () => {
    expect(shortcutFor({ key: "j" }, div)).toBe("next");
    expect(shortcutFor({ key: "k" }, div)).toBe("prev");
    expect(shortcutFor({ key: "s" }, div)).toBe("shortlist");
    expect(shortcutFor({ key: "?" }, div)).toBe("help");
    expect(shortcutFor({ key: "x" }, div)).toBeNull();
  });

  it("ignores keys with modifiers, composition, or already handled", () => {
    expect(shortcutFor({ key: "s", ctrlKey: true }, div)).toBeNull();
    expect(shortcutFor({ key: "s", metaKey: true }, div)).toBeNull();
    expect(shortcutFor({ key: "j", altKey: true }, div)).toBeNull();
    expect(shortcutFor({ key: "j", isComposing: true }, div)).toBeNull();
    expect(shortcutFor({ key: "j", defaultPrevented: true }, div)).toBeNull();
  });

  it("never fires while typing", () => {
    expect(shortcutFor({ key: "s" }, { tagName: "INPUT" })).toBeNull();
    expect(shortcutFor({ key: "s" }, { tagName: "textarea" })).toBeNull();
    expect(shortcutFor({ key: "s" }, { tagName: "SELECT" })).toBeNull();
    expect(shortcutFor({ key: "s" }, { tagName: "DIV", isContentEditable: true })).toBeNull();
    expect(shortcutFor({ key: "s" }, { tagName: "DIV", getAttribute: (n) => (n === "role" ? "combobox" : null) })).toBeNull();
  });

  it("treats a missing target as not typing", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(shortcutFor({ key: "k" }, null)).toBe("prev");
  });
});

describe("isOwnUiHost", () => {
  it("recognizes our shadow hosts but not the badge host or page elements", () => {
    expect(isOwnUiHost({ className: "ib-ext-chat-bubble-host" })).toBe(true);
    expect(isOwnUiHost({ className: "ib-ext-inline search-toolbar-host" })).toBe(true);
    expect(isOwnUiHost({ id: "ib-ext-host" })).toBe(true);
    expect(isOwnUiHost({ className: "ib-ext-inline tile-badge-host" })).toBe(false);
    expect(isOwnUiHost({ className: "a-section" })).toBe(false);
    expect(isOwnUiHost({})).toBe(false);
    expect(isOwnUiHost(null)).toBe(false);
  });
});
