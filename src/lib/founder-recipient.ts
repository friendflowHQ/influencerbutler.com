// Where founder-only system mail goes (A/B decisions, the monthly funnel
// review reminder). FOUNDER_SNAPSHOT_TO may hold several comma-separated
// addresses; unset or blank falls back to the founder's inbox.

export const FOUNDER_DEFAULT_TO = "elizabethdean30@gmail.com";

/** Founder recipient list, trimmed and deduped (never empty). */
export function founderRecipients(raw: string | undefined = process.env.FOUNDER_SNAPSHOT_TO): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim();
    const key = email.toLowerCase();
    if (!email || !email.includes("@") || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out.length > 0 ? out : [FOUNDER_DEFAULT_TO];
}

/** First founder recipient (for single-recipient callers). */
export function founderRecipient(): string {
  return founderRecipients()[0];
}
