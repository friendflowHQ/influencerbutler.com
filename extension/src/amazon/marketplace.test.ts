import { describe, expect, it } from "vitest";
import {
  amazonMarketplaceOf,
  associatesHostForMarketplace,
  ccHostForMarketplace,
  countryForMarketplace,
  currencyForMarketplace,
  currencySymbol,
  formatWholeMoney,
  marketplaceForCcHost,
  marketplaceForCountry,
  marketplaceOrDefault,
  parseMoney,
} from "./marketplace";

describe("amazonMarketplaceOf", () => {
  it("reads the bare marketplace from hosts, URLs, and associates hosts", () => {
    expect(amazonMarketplaceOf("amazon.com")).toBe("amazon.com");
    expect(amazonMarketplaceOf("www.amazon.co.uk")).toBe("amazon.co.uk");
    expect(amazonMarketplaceOf("https://www.amazon.com.au/dp/B01JGG5CH4?x=1")).toBe("amazon.com.au");
    expect(amazonMarketplaceOf("https://affiliate-program.amazon.co.uk/p/connect/requests")).toBe(
      "amazon.co.uk",
    );
    expect(amazonMarketplaceOf("walmart.com")).toBeNull();
    expect(amazonMarketplaceOf("notamazon.com")).toBeNull();
    expect(amazonMarketplaceOf("creatorsapi.amazon")).toBeNull();
    expect(amazonMarketplaceOf("")).toBeNull();
    expect(marketplaceOrDefault(null)).toBe("amazon.com");
  });
});

describe("marketplace facts", () => {
  it("keeps US as the default", () => {
    expect(currencyForMarketplace("amazon.com")).toBe("USD");
    expect(currencyForMarketplace(undefined)).toBe("USD");
    expect(currencyForMarketplace("example.com")).toBe("USD");
    expect(countryForMarketplace("amazon.com")).toBe("US");
    expect(ccHostForMarketplace("amazon.com")).toBe("affiliate-program.amazon.com");
    expect(ccHostForMarketplace(null)).toBe("affiliate-program.amazon.com");
  });

  it("maps the UK and other marketplaces", () => {
    expect(currencyForMarketplace("amazon.co.uk")).toBe("GBP");
    expect(currencyForMarketplace("amazon.de")).toBe("EUR");
    expect(currencyForMarketplace("amazon.co.jp")).toBe("JPY");
    expect(countryForMarketplace("amazon.co.uk")).toBe("UK");
    expect(ccHostForMarketplace("amazon.co.uk")).toBe("affiliate-program.amazon.co.uk");
    expect(ccHostForMarketplace("amazon.ca")).toBe("affiliate-program.amazon.ca");
    // Hosts the manifest does not grant fall back to the US Creator Connections host.
    expect(ccHostForMarketplace("amazon.de")).toBe("affiliate-program.amazon.com");
    expect(marketplaceForCcHost("affiliate-program.amazon.co.uk")).toBe("amazon.co.uk");
    expect(marketplaceForCcHost("affiliate-program.amazon.com")).toBe("amazon.com");
    expect(marketplaceForCountry("UK")).toBe("amazon.co.uk");
    expect(marketplaceForCountry("gb")).toBe("amazon.co.uk");
    expect(marketplaceForCountry("ZZ")).toBe("amazon.com");
    expect(associatesHostForMarketplace("amazon.com")).toBe("affiliate-program.amazon.com");
    expect(associatesHostForMarketplace("amazon.de")).toBe("partnernet.amazon.de");
  });

  it("gives a display symbol per currency", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol(undefined)).toBe("$");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currencySymbol("CAD")).toBe("CA$");
    expect(currencySymbol("SEK")).toBe("SEK ");
  });
});

describe("parseMoney", () => {
  it("parses US prices exactly as before", () => {
    expect(parseMoney("$12.99", "amazon.com")).toEqual({ priceCents: 1299, currency: "USD" });
    expect(parseMoney("$1,234.56")).toEqual({ priceCents: 123456, currency: "USD" });
    expect(parseMoney("$1,234")).toEqual({ priceCents: 123400, currency: "USD" });
    expect(parseMoney("$25")).toEqual({ priceCents: 2500, currency: "USD" });
    expect(parseMoney("$12.99$12.99")).toEqual({ priceCents: 1299, currency: "USD" });
    expect(parseMoney("Price: $ 7.50 with coupon")).toEqual({ priceCents: 750, currency: "USD" });
    expect(parseMoney("no price here")).toBeNull();
  });

  it("parses UK prefix pounds", () => {
    expect(parseMoney("£19.99", "amazon.co.uk")).toEqual({ priceCents: 1999, currency: "GBP" });
    expect(parseMoney("£1,299.00", "amazon.co.uk")).toEqual({ priceCents: 129900, currency: "GBP" });
  });

  it("parses suffix euros with comma decimals", () => {
    expect(parseMoney("12,99 €", "amazon.de")).toEqual({ priceCents: 1299, currency: "EUR" });
    expect(parseMoney("1.234,56 €", "amazon.de")).toEqual({ priceCents: 123456, currency: "EUR" });
    expect(parseMoney("1 234,56 €", "amazon.fr")).toEqual({ priceCents: 123456, currency: "EUR" });
    expect(parseMoney("€12,99", "amazon.es")).toEqual({ priceCents: 1299, currency: "EUR" });
    expect(parseMoney("49,00 zł", "amazon.pl")).toEqual({ priceCents: 4900, currency: "PLN" });
  });

  it("parses yen, rupees, and reais", () => {
    expect(parseMoney("¥1,280", "amazon.co.jp")).toEqual({ priceCents: 128000, currency: "JPY" });
    expect(parseMoney("￥980")).toEqual({ priceCents: 98000, currency: "JPY" });
    expect(parseMoney("₹499.00", "amazon.in")).toEqual({ priceCents: 49900, currency: "INR" });
    expect(parseMoney("₹1,23,456.00", "amazon.in")).toEqual({ priceCents: 12345600, currency: "INR" });
    expect(parseMoney("R$ 49,90", "amazon.com.br")).toEqual({ priceCents: 4990, currency: "BRL" });
  });

  it("labels dollar prices by marketplace", () => {
    expect(parseMoney("$19.99", "amazon.ca")).toEqual({ priceCents: 1999, currency: "CAD" });
    expect(parseMoney("CA$19.99", "amazon.com")).toEqual({ priceCents: 1999, currency: "CAD" });
    expect(parseMoney("$29.00", "amazon.com.au")).toEqual({ priceCents: 2900, currency: "AUD" });
    expect(parseMoney("A$29.00")).toEqual({ priceCents: 2900, currency: "AUD" });
    expect(parseMoney("$199.00", "amazon.com.mx")).toEqual({ priceCents: 19900, currency: "MXN" });
    expect(parseMoney("MX$199.00")).toEqual({ priceCents: 19900, currency: "MXN" });
    // A dollar price on a non-dollar marketplace stays USD.
    expect(parseMoney("$10.00", "amazon.co.uk")).toEqual({ priceCents: 1000, currency: "USD" });
  });
});

describe("formatWholeMoney", () => {
  it("formats per currency", () => {
    expect(formatWholeMoney(123400, "USD", "en")).toBe("$1,234");
    expect(formatWholeMoney(123400, "GBP", "en")).toBe("£1,234");
    expect(formatWholeMoney(99, "USD", "en")).toBe("$1");
  });
});
