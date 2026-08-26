import { describe, expect, it } from "vitest";
import {
  reportableThresholdCentsForYear,
  isUsCountry,
  classifyPayee,
  w8ValidThrough,
  build1099ProviderCsv,
  build1099IrisCsv,
  buildForeignRecordsCsv,
  IRIS_1099NEC_HEADERS,
  type Payee1099,
} from "@/lib/finance-1099";
import type { PayerIdentity } from "@/lib/finance-1099";

const PAYER: PayerIdentity = {
  payerName: "The Social Media Posse LLC",
  payerAddress1: "3556 S 5600 W",
  payerCity: "West Valley City",
  payerRegion: "UT",
  payerPostal: "84120-2815",
  payerEin: "123456789",
  payerPhone: "",
};

function payee(overrides: Partial<Payee1099>): Payee1099 {
  return {
    userId: "u1",
    name: "Kay Green",
    email: "kay@example.com",
    legalName: "Kay Green",
    businessName: null,
    totalCents: 250000,
    payoutCount: 3,
    country: "US",
    formType: "W-9",
    formStatus: "verified",
    tinLast4: "6729",
    tinKind: "ssn",
    reportable: true,
    exportEligible: true,
    exemptHint: false,
    needsCorrection: false,
    filing: null,
    treatyCountry: null,
    treatyRate: null,
    w8: null,
    address1: "1 Main St",
    address2: null,
    city: "Provo",
    region: "UT",
    postalCode: "84601",
    ...overrides,
  };
}

describe("reportableThresholdCentsForYear", () => {
  it("is $600 through 2025 and $2,000 from 2026", () => {
    expect(reportableThresholdCentsForYear(2024)).toBe(60000);
    expect(reportableThresholdCentsForYear(2025)).toBe(60000);
    expect(reportableThresholdCentsForYear(2026)).toBe(200000);
    expect(reportableThresholdCentsForYear(2027)).toBe(200000);
  });
});

describe("isUsCountry", () => {
  it("matches common US spellings, rejects others", () => {
    for (const s of ["US", " usa ", "U.S.A.", "United States", "united states of america", "America", "United States (US)"]) {
      expect(isUsCountry(s)).toBe(true);
    }
    for (const s of ["United Kingdom", "", null, "AU", "Canada"]) {
      expect(isUsCountry(s as string)).toBe(false);
    }
  });
});

describe("classifyPayee", () => {
  it("lets the form type win over the country string", () => {
    expect(classifyPayee("W-9", "Canada")).toBe("us");
    expect(classifyPayee("W-8BEN", "US")).toBe("foreign");
    expect(classifyPayee("W-8BEN-E", null)).toBe("foreign");
    expect(classifyPayee(null, "usa")).toBe("us");
    expect(classifyPayee(null, null)).toBe("unknown");
    expect(classifyPayee(null, "France")).toBe("unknown");
  });
});

describe("w8ValidThrough", () => {
  it("is Dec 31 of the third calendar year after signing", () => {
    expect(w8ValidThrough("2026-09-30", null, "2026-08-26").validThrough).toBe("2029-12-31");
    expect(w8ValidThrough("2026-01-01", null, "2026-08-26").validThrough).toBe("2029-12-31");
  });
  it("falls back to submitted_at, and reports unknown when neither is set", () => {
    expect(w8ValidThrough(null, "2023-05-01", "2026-08-26").validThrough).toBe("2026-12-31");
    const none = w8ValidThrough(null, null, "2026-08-26");
    expect(none.validThrough).toBeNull();
    expect(none.expired).toBeNull();
  });
  it("flags expired and expiring-soon", () => {
    expect(w8ValidThrough("2020-01-01", null, "2026-08-26").expired).toBe(true);
    // valid through 2026-12-31, today within 90 days
    expect(w8ValidThrough("2023-06-01", null, "2026-10-15").expiringSoon).toBe(true);
  });
});

describe("CSV builders", () => {
  const tins = new Map([["u1", "123-45-6729"]]);

  it("provider CSV carries payer EIN and the full TIN only in the TIN column", () => {
    const csv = build1099ProviderCsv([payee({})], PAYER, tins);
    const [header, row] = csv.split("\n");
    expect(header.startsWith("Payer Name,Payer EIN,")).toBe(true);
    const cells = row.split(",");
    // Full digits-only TIN appears once, in the Recipient TIN column (index 8).
    expect(cells[8]).toBe("123456729");
    expect(cells[1]).toBe("123456789"); // payer EIN
    expect(cells[18]).toBe("2500.00"); // Box 1 amount
    expect(csv.match(/123456729/g)?.length).toBe(1);
  });

  it("escapes a legal name containing a comma", () => {
    const csv = build1099ProviderCsv([payee({ legalName: "Green, Kay" })], PAYER, tins);
    expect(csv).toContain('"Green, Kay"');
  });

  it("IRIS CSV uses the pinned header and digits-only TIN", () => {
    const csv = build1099IrisCsv([payee({})], tins);
    const [header, row] = csv.split("\n");
    expect(header).toBe(IRIS_1099NEC_HEADERS.join(","));
    expect(row.split(",")[1]).toBe("123456729");
  });

  it("foreign records CSV never contains a full TIN", () => {
    const csv = buildForeignRecordsCsv([
      payee({ formType: "W-8BEN", country: "Canada", tinLast4: "6729", totalCents: 90000 }),
    ]);
    expect(csv).not.toContain("123456729");
    expect(csv).toContain("6729"); // last 4 only
    expect(csv).toContain("900.00");
  });
});
