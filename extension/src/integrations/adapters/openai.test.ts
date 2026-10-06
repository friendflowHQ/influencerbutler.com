import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeOpenAiFailure,
  openaiAdapter,
  OPENAI_KEY_INVALID_MESSAGE,
  OPENAI_OUT_OF_CREDIT_MESSAGE,
  OPENAI_RATE_LIMIT_MESSAGE,
} from "./openai";

afterEach(() => vi.unstubAllGlobals());

const creds = { apiKey: "sk-test" };

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })),
  );
}

describe("describeOpenAiFailure", () => {
  it("maps 401 to a key-invalid message", () => {
    expect(describeOpenAiFailure(401, "")).toBe(OPENAI_KEY_INVALID_MESSAGE);
    expect(describeOpenAiFailure(401, "invalid_api_key invalid_request_error")).toBe(OPENAI_KEY_INVALID_MESSAGE);
  });

  it("maps insufficient_quota to the out-of-credit message", () => {
    expect(describeOpenAiFailure(429, "insufficient_quota insufficient_quota")).toBe(OPENAI_OUT_OF_CREDIT_MESSAGE);
    expect(describeOpenAiFailure(403, "insufficient_quota")).toBe(OPENAI_OUT_OF_CREDIT_MESSAGE);
  });

  it("treats a bare 429 as out of credit but a named rate limit as a rate limit", () => {
    expect(describeOpenAiFailure(429, "")).toBe(OPENAI_OUT_OF_CREDIT_MESSAGE);
    expect(describeOpenAiFailure(429, "rate_limit_exceeded requests")).toBe(OPENAI_RATE_LIMIT_MESSAGE);
  });

  it("keeps a generic message for other statuses", () => {
    expect(describeOpenAiFailure(500, "")).toBe("OpenAI returned 500. Try again shortly.");
  });

  it("explains that a ChatGPT subscription does not count", () => {
    expect(OPENAI_OUT_OF_CREDIT_MESSAGE).toContain("ChatGPT Plus");
    expect(OPENAI_OUT_OF_CREDIT_MESSAGE).toContain("platform.openai.com/settings/organization/billing");
  });
});

describe("openai adapter complete", () => {
  it("returns the completion text", async () => {
    stubFetch(200, { choices: [{ message: { content: " hello " } }] });
    await expect(openaiAdapter.complete!("hi", creds)).resolves.toBe("hello");
  });

  it("throws the out-of-credit message when OpenAI reports insufficient_quota", async () => {
    stubFetch(429, { error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } });
    await expect(openaiAdapter.complete!("hi", creds)).rejects.toThrow(OPENAI_OUT_OF_CREDIT_MESSAGE);
  });

  it("throws the key-invalid message on 401", async () => {
    stubFetch(401, { error: { message: "Incorrect API key", code: "invalid_api_key" } });
    await expect(openaiAdapter.complete!("hi", creds)).rejects.toThrow(OPENAI_KEY_INVALID_MESSAGE);
  });

  it("still gives an actionable message when the error body is not JSON", async () => {
    stubFetch(429, "<html>nope</html>");
    await expect(openaiAdapter.complete!("hi", creds)).rejects.toThrow(OPENAI_OUT_OF_CREDIT_MESSAGE);
  });
});

describe("openai adapter test", () => {
  it("reports the same actionable messages", async () => {
    stubFetch(401, { error: { code: "invalid_api_key" } });
    await expect(openaiAdapter.test(creds)).resolves.toEqual({ ok: false, message: OPENAI_KEY_INVALID_MESSAGE });
    stubFetch(429, { error: { code: "insufficient_quota" } });
    await expect(openaiAdapter.test(creds)).resolves.toEqual({ ok: false, message: OPENAI_OUT_OF_CREDIT_MESSAGE });
  });
});
