import type { IntegrationAdapter, TestResult } from "../types";

// Amazon Associates affiliate tags, one per marketplace country. There is no
// credential to verify against a server: a tag is just a string Amazon accepts
// on a link, so the "test" validates the format of every tag entered. The tags
// themselves live in integrations.global.perCountryTags (they are not secret),
// which the background passes in as the creds map for this adapter.

const TAG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-\d{2,4}$/i;

export function validateTags(tags: Record<string, string>): TestResult {
  const entries = Object.entries(tags).filter(([, v]) => (v ?? "").trim());
  if (entries.length === 0) {
    return { ok: false, message: "Add at least one affiliate tag, for example mytag-20." };
  }
  const bad = entries.filter(([, v]) => !TAG_RE.test(v.trim())).map(([country]) => country);
  if (bad.length > 0) {
    return { ok: false, message: `These tags look wrong: ${bad.join(", ")}. Tags look like mytag-20.` };
  }
  return {
    ok: true,
    message: `${entries.length} affiliate tag${entries.length > 1 ? "s" : ""} look valid.`,
  };
}

export const associatesAdapter: IntegrationAdapter = {
  id: "associates",
  labelKey: "provAssociates",
  category: "affiliateTag",
  hosts: [],
  // Rendered by the options page as a per-country grid, not plain fields.
  fields: [],
  test: async (creds) => validateTags(creds),
};
