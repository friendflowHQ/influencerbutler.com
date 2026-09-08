import { describe, expect, it } from "vitest";
import { chooseAcceptRoute } from "./accept";

// The route matrix: the desktop bridge is preferred whenever the app is paired;
// without it a Creator Connections accept can run standalone once a campaign
// id is known (or after a lookup), while SPCC always needs the app.

const ID = "amzn1.campaign.116OEQZBQCQ9V";

describe("chooseAcceptRoute", () => {
  it("prefers the bridge when the app is connected and paired", () => {
    expect(chooseAcceptRoute({ connected: true, paired: true }, "cc", ID)).toBe("bridge");
    expect(chooseAcceptRoute({ connected: true, paired: true }, "cc", null)).toBe("bridge");
    expect(chooseAcceptRoute({ connected: true, paired: true }, "spcc", null)).toBe("bridge");
  });

  it("treats a connected app that never reported `paired` as paired (older builds)", () => {
    expect(chooseAcceptRoute({ connected: true }, "cc", null)).toBe("bridge");
  });

  it("does not use the bridge when the app is connected but this extension is unpaired", () => {
    expect(chooseAcceptRoute({ connected: true, paired: false }, "cc", ID)).toBe("standalone");
    expect(chooseAcceptRoute({ connected: true, paired: false }, "cc", null)).toBe("needs-lookup");
  });

  it("goes standalone for CC with a known campaign id when the app is absent", () => {
    expect(chooseAcceptRoute({ connected: false }, "cc", ID)).toBe("standalone");
    expect(chooseAcceptRoute(null, "cc", ID)).toBe("standalone");
    expect(chooseAcceptRoute(undefined, "cc", ID)).toBe("standalone");
  });

  it("asks for a lookup when CC has no campaign id yet", () => {
    expect(chooseAcceptRoute({ connected: false }, "cc", null)).toBe("needs-lookup");
    expect(chooseAcceptRoute({ connected: false }, "cc", undefined)).toBe("needs-lookup");
    expect(chooseAcceptRoute({ connected: false }, "cc", "")).toBe("needs-lookup");
  });

  it("needs the app for SPCC without a paired bridge, id or not", () => {
    expect(chooseAcceptRoute({ connected: false }, "spcc", ID)).toBe("needs-app");
    expect(chooseAcceptRoute({ connected: false }, "spcc", null)).toBe("needs-app");
    expect(chooseAcceptRoute({ connected: true, paired: false }, "spcc", ID)).toBe("needs-app");
  });
});
