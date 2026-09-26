import { describe, expect, it } from "vitest";
import { pickLastWebTab } from "./active-tab";

describe("pickLastWebTab", () => {
  it("picks the most recently accessed web tab", () => {
    const tabs = [
      { id: 1, url: "https://www.amazon.com/dp/B000000001", lastAccessed: 100 },
      { id: 2, url: "https://www.walmart.com/ip/123", lastAccessed: 300 },
      { id: 3, url: "https://www.amazon.com/s?k=mug", lastAccessed: 200 },
    ];
    expect(pickLastWebTab(tabs)?.id).toBe(2);
  });

  it("skips the popup's own tab and non-web pages", () => {
    const tabs = [
      { id: 1, url: "chrome-extension://abc/popup.html", lastAccessed: 900 },
      { id: 2, url: "chrome://newtab/", lastAccessed: 800 },
      { id: 3, url: "https://www.amazon.com/dp/B000000001", lastAccessed: 100 },
      { id: 4, url: "https://www.amazon.com/gp/aw/d/B000000002", lastAccessed: 700 },
    ];
    expect(pickLastWebTab(tabs, 4)?.id).toBe(3);
  });

  it("returns undefined when there is no web tab", () => {
    expect(pickLastWebTab([{ id: 1, url: "chrome://newtab/" }])).toBeUndefined();
    expect(pickLastWebTab([])).toBeUndefined();
  });
});
