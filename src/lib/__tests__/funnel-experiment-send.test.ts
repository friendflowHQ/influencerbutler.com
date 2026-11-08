import { beforeEach, describe, expect, it, vi } from "vitest";

const choose = vi.fn();
let throwNext = false;
vi.mock("@/lib/email-experiments", () => ({
  chooseExperimentCopy: async (...a: unknown[]) => {
    if (throwNext) throw new Error("boom");
    return choose(...a);
  },
}));

import { withFunnelExperiment } from "@/lib/funnel-experiment-send";

const control = { subject: "Control subject", body: "Control body" };

describe("withFunnelExperiment", () => {
  beforeEach(() => {
    choose.mockReset();
    throwNext = false;
  });

  it("returns the control with only the step key when no test runs", async () => {
    choose.mockResolvedValue({ ...control });
    const r = await withFunnelExperiment({ funnel: "trial", contentKey: "day3.power", email: "a@b.co", control });
    expect(r).toEqual({ ...control, tracking: { stepKey: "day3.power" } });
    expect(choose).toHaveBeenCalledWith(null, expect.objectContaining({ funnel: "trial", contentKey: "day3.power", email: "a@b.co", defaultCopy: control }));
  });

  it("passes the arm copy and experiment tracking through", async () => {
    choose.mockResolvedValue({ subject: "B subject", body: "B body", experimentId: "exp1", variant: "b" });
    const r = await withFunnelExperiment({ funnel: "pro", contentKey: "day0", email: "a@b.co", control, vars: { firstName: "A" } });
    expect(r).toEqual({ subject: "B subject", body: "B body", tracking: { stepKey: "day0", experimentId: "exp1", variant: "b" } });
  });

  it("falls back to the control when the engine throws", async () => {
    throwNext = true;
    const r = await withFunnelExperiment({ funnel: "pro", contentKey: "day0", email: "a@b.co", control });
    expect(r).toEqual({ ...control, tracking: { stepKey: "day0" } });
  });
});
