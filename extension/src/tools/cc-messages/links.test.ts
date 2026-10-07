import { describe, expect, it } from "vitest";
import { extractMessageLinks } from "./links";

// The real CLOCKY blast from the Messages drawer.
const CLOCKY =
  "Good morning! I wanted to let you know that you can keep sharing Clocky content because the campaign is still live! 🎥 We have a lot of content you may share, grab from 👉 shortiftyme.co/suPG5 and If you still need a sample fill in this form 👉 shorturl.at/oUgCE 💗 Ana";

describe("extractMessageLinks", () => {
  it("finds both bare short links in the CLOCKY message and labels them by context", () => {
    const links = extractMessageLinks([CLOCKY]);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      url: "https://shortiftyme.co/suPG5",
      kind: "content",
      label: "Content assets",
    });
    expect(links[1]).toMatchObject({
      url: "https://shorturl.at/oUgCE",
      kind: "sample",
      label: "Sample form",
    });
  });

  it("does not swallow an emoji pasted right after a link", () => {
    const [link] = extractMessageLinks(["form 👉 shorturl.at/abc💗 thanks"]);
    expect(link!.url).toBe("https://shorturl.at/abc");
  });

  it("dedupes the same link across messages (the brand sent the blast twice)", () => {
    const links = extractMessageLinks([CLOCKY, CLOCKY]);
    expect(links).toHaveLength(2);
  });

  it("ignores prose that merely looks like a domain", () => {
    expect(extractMessageLinks(["Thanks,etc.Then we ship. e.g. soon"])).toEqual([]);
  });

  it("strips trailing punctuation and keeps the scheme as pasted", () => {
    const [link] = extractMessageLinks(["Brief is here: http://example.com/brief.pdf)."]);
    expect(link!.url).toBe("http://example.com/brief.pdf");
    expect(link!.kind).toBe("brief");
  });

  it("classifies by known host before context", () => {
    const links = extractMessageLinks([
      "see https://drive.google.com/drive/folders/abc and https://forms.gle/xyz",
    ]);
    expect(links.map((l) => l.kind)).toEqual(["content", "sample"]);
  });

  it("falls back to a generic Link when there is no cue", () => {
    const [link] = extractMessageLinks(["hello https://example.com/x"]);
    expect(link).toMatchObject({ kind: "link", label: "Link" });
  });

  it("returns nothing for empty input", () => {
    expect(extractMessageLinks([])).toEqual([]);
    expect(extractMessageLinks([""])).toEqual([]);
  });
});
