import { describe, expect, it } from "vitest";
import {
  mergeSession,
  normalizeSession,
  parseActorIdFromText,
  parseActorIdFromUrl,
  parseStoreIdFromText,
} from "./session";

describe("parseActorIdFromUrl", () => {
  it("reads creatorId from a CC campaign URL", () => {
    const url =
      "https://affiliate-program.amazon.com/p/connect/requests?creatorId=amzn1.creator.d0c73657-e5ef-404a-afe0-c1bdf3c417b0&status=opportunity&type=affiliate-plus";
    expect(parseActorIdFromUrl(url)).toBe("amzn1.creator.d0c73657-e5ef-404a-afe0-c1bdf3c417b0");
  });

  it("reads a URL-encoded actorId", () => {
    expect(parseActorIdFromUrl("/connect/api/chat/messages/list?actorId=amzn1.creator.abc-123&actorName=X")).toBe(
      "amzn1.creator.abc-123",
    );
    expect(parseActorIdFromUrl("/x?actorId=amzn1%2Ecreator%2Eabc")).toBe("amzn1.creator.abc");
  });

  it("returns empty when there is no creator id", () => {
    expect(parseActorIdFromUrl("https://affiliate-program.amazon.com/p/connect/requests")).toBe("");
    expect(parseActorIdFromUrl("/x?creatorId=somebody")).toBe("");
  });
});

describe("parseActorIdFromText", () => {
  it("finds an embedded creator id", () => {
    expect(parseActorIdFromText('<meta content="amzn1.creator.0a1b-2c3d">')).toBe("amzn1.creator.0a1b-2c3d");
    expect(parseActorIdFromText("nothing here")).toBe("");
  });
});

describe("parseStoreIdFromText", () => {
  it("reads the store switcher label", () => {
    expect(parseStoreIdFromText("StoreID:  littleprettyl-20")).toBe("littleprettyl-20");
    expect(parseStoreIdFromText("Hello, @LizDean Gold StoreID: littleprettyl-20 EN")).toBe("littleprettyl-20");
    expect(parseStoreIdFromText("StoreID: my.store_name-21")).toBe("my.store_name-21");
  });

  it("returns empty when the label is absent", () => {
    expect(parseStoreIdFromText("Hello @LizDean")).toBe("");
    expect(parseStoreIdFromText("StoreID: ")).toBe("");
  });
});

describe("mergeSession / normalizeSession", () => {
  it("takes each field from the first source that has it", () => {
    expect(
      mergeSession({ storeId: "", actorId: "amzn1.creator.a" }, { storeId: "s-20", actorId: "amzn1.creator.b" }, null),
    ).toEqual({ storeId: "s-20", actorId: "amzn1.creator.a" });
    expect(mergeSession(undefined, null)).toEqual({ storeId: "", actorId: "" });
  });

  it("drops a stored actor id that is not a creator id", () => {
    expect(normalizeSession({ storeId: " s-20 ", actorId: "garbage" })).toEqual({ storeId: "s-20", actorId: "" });
    expect(normalizeSession({ storeId: "s-20", actorId: "amzn1.creator.ab12" }).actorId).toBe("amzn1.creator.ab12");
    expect(normalizeSession(null)).toEqual({ storeId: "", actorId: "" });
  });
});
