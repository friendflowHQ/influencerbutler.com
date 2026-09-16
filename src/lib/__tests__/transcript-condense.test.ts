/**
 * Summary: Unit tests for the deterministic transcript condenser.
 * Dependencies: vitest, ../transcript-condense. No network.
 */
import { describe, it, expect } from "vitest";
import { condenseTranscript } from "../transcript-condense";

// A realistic transcript: banter + filler around real bug/feature content,
// padded past the 2000-char floor so condensing actually runs.
function bigTranscript(): string {
  const banter = [
    "Customer: Hey, how are you? All good?",
    "Host: Good, good. Can you hear me okay?",
    "Customer: Yeah, totally. There we go.",
    "Host: Let me share my screen real quick.",
    "Customer: Okay. Right. Yeah.",
    "Host: How's the weather over there?",
    "Customer: Oh, you know, same as always, haha.",
  ];
  const signal = [
    "Customer: So the export button is broken, it doesn't work when I click it on the Walmart list.",
    "Host: Got it, that is a real bug, I will get that logged.",
    "Customer: And honestly I wish you would add a dark mode to the desktop app, my eyes are killing me at night.",
    "Customer: One more thing, the Instagram post keeps failing with an error every single time.",
  ];
  const closing = [
    "Host: Thanks for meeting with me today, have a good one.",
    "Customer: You too, talk soon, bye.",
  ];
  // Pad the real content so the whole thing clears the 2000-char floor.
  const filler = Array.from({ length: 16 }, (_, i) =>
    `Host: And just to walk through the campaign flow one more time for step ${i + 1}, you open the deal, then the commission shows on the product page.`,
  );
  return [...banter, ...signal, ...filler, ...closing].join("\n");
}

describe("condenseTranscript", () => {
  it("removes banter and filler but keeps every signal line", () => {
    const t = bigTranscript();
    expect(t.length).toBeGreaterThan(2000);
    const r = condenseTranscript(t);

    expect(r.removedLines).toBeGreaterThan(0);
    expect(r.keptChars).toBeLessThan(r.originalChars);

    // Signal content survives.
    expect(r.text).toContain("export button is broken");
    expect(r.text).toContain("dark mode");
    expect(r.text).toContain("Instagram post keeps failing");

    // Pure banter/filler is gone.
    expect(r.text).not.toContain("how are you");
    expect(r.text).not.toContain("share my screen");
    expect(r.text).not.toContain("weather");
    expect(r.text).not.toContain("talk soon");
  });

  it("returns short transcripts unchanged (below the floor)", () => {
    const short = "Host: hi\nCustomer: the export is broken";
    const r = condenseTranscript(short);
    expect(r.text).toBe(short);
    expect(r.removedLines).toBe(0);
  });

  it("never drops a short greeting-shaped line that carries signal", () => {
    const line = "Customer: Hey, how are you? Also my login is broken and I cannot sign in.";
    const t = line + "\n" + "x".repeat(2100); // clear the floor
    const r = condenseTranscript(t);
    expect(r.text).toContain("login is broken");
  });

  it("handles empty input", () => {
    expect(condenseTranscript("")).toEqual({ text: "", removedLines: 0, originalChars: 0, keptChars: 0 });
  });
});
