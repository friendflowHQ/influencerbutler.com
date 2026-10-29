import { describe, expect, it, vi } from "vitest";
import { isDisabled, trackAsync } from "./guard";

describe("trackAsync", () => {
  it("runs onFail and disables the tool when the work rejects", async () => {
    const onFail = vi.fn();
    trackAsync("t-reject", Promise.reject(new Error("boom")), onFail);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFail).toHaveBeenCalledOnce();
    expect(isDisabled("t-reject")).toBe(true);
  });
  it("does nothing when the work resolves", async () => {
    const onFail = vi.fn();
    trackAsync("t-ok", Promise.resolve(1), onFail);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFail).not.toHaveBeenCalled();
    expect(isDisabled("t-ok")).toBe(false);
  });
});
