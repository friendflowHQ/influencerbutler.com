import { describe, it, expect } from "vitest";
import { buildSetupChecklist } from "../agent";

describe("buildSetupChecklist", () => {
  it("starts after sign-in at the first unverified required step", () => {
    const c = buildSetupChecklist({ creatorApiConfigured: false });
    expect(c.steps[0]!.status).toBe("done");
    expect(c.current).toBe(2);
    expect(c.steps).toHaveLength(7);
  });

  it("marks Creator API done only when credentials exist", () => {
    expect(buildSetupChecklist({ creatorApiConfigured: true }).steps.find((s) => s.id === "creator-api")!.status).toBe("done");
    expect(buildSetupChecklist({ creatorApiConfigured: false }).steps.find((s) => s.id === "creator-api")!.status).toBe("todo");
    expect(buildSetupChecklist({ creatorApiConfigured: null }).steps.find((s) => s.id === "creator-api")!.status).toBe("unknown");
  });

  it("points desktop users at the in-app checklist", () => {
    expect(buildSetupChecklist({ creatorApiConfigured: null, surface: "desktop" }).guidance).toContain("start_walkthrough");
    expect(buildSetupChecklist({ creatorApiConfigured: null, surface: "website" }).guidance).toContain("not in the desktop app");
  });
});
