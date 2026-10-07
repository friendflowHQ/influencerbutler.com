/**
 * Summary: magic-byte image detection ignores client-declared types.
 * Dependencies: vitest, ../image-sniff.
 */
import { describe, it, expect } from "vitest";
import { sniffImage } from "../image-sniff";

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("recognises png, jpeg, gif and webp", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))?.mime).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(sniffImage(ascii("GIF89a\x01\x00"))?.mime).toBe("image/gif");
    expect(sniffImage(ascii("GIF87a"))?.mime).toBe("image/gif");
    const webp = new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")]);
    expect(sniffImage(webp)?.mime).toBe("image/webp");
  });

  it("rejects HTML, SVG, scripts, RIFF-but-not-WEBP and empty input", () => {
    expect(sniffImage(ascii("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(ascii("GIF"))).toBeNull();
    expect(sniffImage(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVEfmt ")]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
