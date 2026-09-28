import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A TEMP-DIAGNOSTIC once shipped with `setDebug(true)`, forcing every [ib:*]
// console.log on for every user regardless of the stored debug setting. The
// suite runs in the node environment with no DOM, so this pins the wiring at
// source level: the content entry must honour the setting and never hard-code
// debug on.

const source = readFileSync(join(__dirname, "index.ts"), "utf8");

describe("content entry debug flag", () => {
  it("wires the logger to the stored setting", () => {
    expect(source).toContain("setDebug(settings.debug)");
  });

  it("never forces debug logging on", () => {
    expect(source).not.toContain("setDebug(true)");
    expect(source).not.toContain("TEMP-DIAGNOSTIC");
  });
});
