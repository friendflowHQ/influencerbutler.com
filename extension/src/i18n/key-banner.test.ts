import { describe, expect, it } from "vitest";
import { CATALOG, type Locale } from "./catalog";

// The popup's "License key connected" banner and change-key box read these
// strings, so every locale must define them and interpolate the account + key.
describe("license key banner strings", () => {
  for (const locale of ["en", "es", "fr"] as Locale[]) {
    it(`${locale} shows the email and key tail`, () => {
      const d = CATALOG[locale];
      expect(d.keyConnectedTitle.length).toBeGreaterThan(0);
      expect(d.changeKeyHeading.length).toBeGreaterThan(0);
      expect(d.changeKeyHint.length).toBeGreaterThan(0);
      expect(d.changeKeyBtn.length).toBeGreaterThan(0);
      expect(d.keyBannerDismiss.length).toBeGreaterThan(0);
      const body = d.keyConnectedBody("h***@gmail.com", "D541");
      expect(body).toContain("h***@gmail.com");
      expect(body).toContain("D541");
      expect(d.accountKeyTail("D541")).toContain("D541");
    });
  }
});
