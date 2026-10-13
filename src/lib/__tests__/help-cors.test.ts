/**
 * The help CORS allow-list: only the phone app's own origins get the header,
 * it echoes the matched origin (never *), says GET only, and varies on Origin.
 */
import { describe, it, expect } from "vitest";
import { helpCorsHeaders } from "../help-cors";

describe("helpCorsHeaders", () => {
  it("allows the phone site, the workers.dev host and the Capacitor origins", () => {
    for (const origin of [
      "https://m.influencerbutler.com",
      "https://influencerbutler-mobile-web.thesocialmediaposse.workers.dev",
      "https://localhost",
      "capacitor://localhost",
    ]) {
      const h = helpCorsHeaders(origin);
      expect(h["Access-Control-Allow-Origin"]).toBe(origin);
      expect(h["Access-Control-Allow-Methods"]).toBe("GET");
      expect(h.Vary).toBe("Origin");
    }
  });

  it("gives nothing to anyone else", () => {
    for (const origin of [
      null,
      undefined,
      "",
      "https://evil.example.com",
      "https://m.influencerbutler.com.evil.com",
      "http://m.influencerbutler.com",
      "http://localhost:3000",
    ]) {
      expect(helpCorsHeaders(origin)).toEqual({});
    }
  });
});
