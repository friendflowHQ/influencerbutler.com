import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Send-to-app panel used to gate only on hud.connected, so an app that was
// running but never paired to this extension rendered every action button as if
// it were ready. Each click came back needsPairing, and the only place that
// showed was a small status line under the buttons, so the button looked live
// and appeared to do nothing. Reported for Send to Deals Butler, Send to Collab
// Butler and Generate AI photo alike (fb-b10b6ca6), where the user worked out
// the cause themselves and asked "how would a user know that's the issue?".
//
// The suite runs in the node environment with no DOM library available, so this
// pins the wiring at source level rather than rendering the panel.

const read = (...p: string[]) => readFileSync(join(__dirname, ...p), "utf8");

describe("Send-to-app panel pairing gate", () => {
  const panel = read("panel.ts");

  it("asks for pairing before rendering the action buttons", () => {
    const gate = panel.indexOf("hud.connected && hud.paired === false");
    const connected = panel.indexOf("renderConnected(body, status, product, hud");
    expect(gate).toBeGreaterThan(-1);
    expect(connected).toBeGreaterThan(-1);
    // The unpaired branch must be tested FIRST, or the buttons render anyway.
    expect(gate).toBeLessThan(connected);
    expect(panel).toContain("renderNeedsPairing(body, status)");
  });

  it("treats only an explicit false as unpaired (back-compat)", () => {
    // An older background worker omits `paired`. Reading undefined as unpaired
    // would hide the buttons from a correctly paired user.
    expect(panel).toContain("hud.paired === false");
    expect(panel).not.toContain("!hud.paired");
  });

  it("shows the existing pairing copy rather than inventing new wording", () => {
    expect(panel).toContain("t().connectAppToPair");
  });

  it("offers reconnect (not the install upsell) to a paired-but-unreachable user", () => {
    // A user who already installed and paired the app, but whose bridge is not
    // answering right now, should see a reconnect hint rather than the cold
    // "Open or install the app" download pitch a brand-new user gets.
    const reconnect = panel.indexOf("} else if (hud.paired) {");
    const upsell = panel.indexOf("renderUpsell(body, auth)");
    expect(reconnect).toBeGreaterThan(-1);
    expect(upsell).toBeGreaterThan(-1);
    // The paired branch must come BEFORE the upsell fallthrough, or a paired
    // user drops through to the install pitch anyway.
    expect(reconnect).toBeLessThan(upsell);
    expect(panel).toContain("renderReconnect(body, status)");
    expect(panel).toContain("t().upsellReconnect");
  });
});

describe("the background actually reports pairing state", () => {
  const bridge = read("..", "..", "background", "hud-bridge.ts");
  const types = read("..", "..", "transport", "hud-commands.ts");

  it("HudStatus carries paired", () => {
    expect(types).toMatch(/paired\?: boolean;/);
  });

  it("getHudStatus reads the token outside the probe cache", () => {
    // Cached inside, a token granted mid-TTL would not be seen and the prompt
    // would persist after the user had paired.
    const fn = bridge.slice(bridge.indexOf("export async function getHudStatus"));
    const body = fn.slice(0, fn.indexOf("\nasync function probe("));
    const tokenAt = body.indexOf("const paired = !!(await getToken());");
    const cacheAt = body.indexOf("if (!force && cached");
    expect(tokenAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(-1);
    expect(tokenAt).toBeLessThan(cacheAt);
    // Both exits report it.
    expect(body).toContain("{ ...cached.status, paired }");
    expect(body).toContain("{ ...status, paired }");
  });
});
