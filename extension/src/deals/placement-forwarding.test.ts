import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The "When a deal arrives" placement (Settings > Deals) must ride on EVERY
// deal push the extension sends, or the desktop falls back to its own default
// and the creator's choice is silently ignored. The deal-site button
// (deal-badge) has its own behavioural test (deal-badge/send.test.ts); this
// pins the other three surfaces at source level, since they are DOM-driven UI
// that is impractical to render in the node test env. A push command here
// without `placement` is the exact regression that made harvested / search /
// product-page deals ignore the setting.

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

// Grab the object literal that follows a `type: "deal.push..."` marker, so the
// assertion is about the command actually sent, not a stray mention elsewhere.
function pushCommands(src: string): string[] {
  const out: string[] = [];
  const re = /type:\s*"deal\.push(?:\.batch)?"[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out;
}

describe("every deal push forwards the creator's placement", () => {
  const files = {
    "Deal Sites Harvester": "deals/index.ts",
    "search results overlay": "tools/search-overlay/overlay.ts",
    "product-page Send to Deals Butler": "tools/hud-actions/panel.ts",
  };

  for (const [label, path] of Object.entries(files)) {
    it(`${label} includes placement on every deal push command`, () => {
      const commands = pushCommands(read(path));
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) {
        expect(command, `${path}: ${command}`).toMatch(/placement/);
      }
    });

    it(`${label} reads the placement from saved settings`, () => {
      expect(read(path)).toMatch(/getSettings\(\)\)\.deals\.placement/);
    });
  }
});
