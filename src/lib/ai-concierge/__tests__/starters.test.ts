import { describe, it, expect } from "vitest";
import { pickStarters } from "../starters";

describe("pickStarters", () => {
  it("gives a brand-new free account the setup path", () => {
    const s = pickStarters({ tier: "free", ageDays: 1 });
    expect(s).toContain("How do I get started?");
    expect(s).toContain("How do I connect my Amazon Creator API?");
    expect(s).toHaveLength(4);
  });

  it("treats an unknown account age as new", () => {
    expect(pickStarters({ tier: "free", ageDays: null })[0]).toBe("How do I get started?");
  });

  it("gives trialers first-deal and trial-end questions", () => {
    const s = pickStarters({ tier: "trial", ageDays: 3 });
    expect(s).toContain("What happens when my trial ends?");
  });

  it("gives Pro users operations questions and a Mac-specific move question", () => {
    const s = pickStarters({ tier: "pro", ageDays: 90, platform: "darwin" });
    expect(s).toContain("Why did one of my butlers pause?");
    expect(s).toContain("How do I move to a new Mac?");
  });

  it("offers the upgrade story to older free accounts", () => {
    expect(pickStarters({ tier: "free", ageDays: 60 })).toContain("What does Pro add?");
  });

  it("localizes and falls back to English", () => {
    expect(pickStarters({ tier: "free", ageDays: 1, locale: "es-ES" })[0]).toBe("¿Cómo empiezo?");
    expect(pickStarters({ tier: "free", ageDays: 1, locale: "de-DE" })[0]).toBe("How do I get started?");
  });
});
