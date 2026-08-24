import type { OutreachRecord } from "../../transport/hud-commands";

export type { OutreachRecord };

// The in-memory lookup built once per fetch from the desktop outreach ledger.
// `exact` is keyed by normalizeBrand(brand); `loose` by the same with all
// whitespace removed, so drift like "K KAMERIO" vs "KKAMERIO" still resolves.
// Both point at the same collapsed-per-brand records (latest keyword first).
export type OutreachMap = {
  exact: Map<string, OutreachRecord>;
  loose: Map<string, OutreachRecord>;
};
