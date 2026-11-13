// Email-address guards shared across the send/enroll paths.
//
// Reserved test domains (RFC 2606) and reserved TLDs (RFC 6761) can never
// receive mail, so Resend rejects every send to them. Left in a send pool, such
// an address fails on every cron run and is re-picked forever: in prod a single
// drip-test@example.com onboarding lead logged thousands of junk failed sends
// before it was parked. Keep these out of the pools at intake and enrollment,
// and park any that slipped in.

// Second-level reserved domains that are guaranteed undeliverable.
const RESERVED_TEST_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

// Reserved / non-routable TLDs. A domain whose last label is one of these can
// never be delivered to ("foo.test", "bar.invalid", "localhost").
const RESERVED_TEST_TLDS = new Set(["test", "invalid", "example", "localhost"]);

// Placeholder identities for comps nobody has claimed yet
// (comp-<uuid>@unassigned.comp.influencerbutler.com, COMP_PLACEHOLDER_DOMAIN in
// comp-codes.ts). No mailbox exists, so every send hard-bounces on our own
// domain: 9 of 53 price lock comp emails on 2026-11-12.
const PLACEHOLDER_DOMAIN_SUFFIX = "comp.influencerbutler.com";

/**
 * True when `email`'s domain is a reserved test/non-routable address that can
 * never receive mail. Case-insensitive; false for a malformed or empty address
 * (those are caught by ordinary validation, not here).
 */
export function isUndeliverableTestEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  if (RESERVED_TEST_DOMAINS.has(domain)) return true;
  if (domain === PLACEHOLDER_DOMAIN_SUFFIX || domain.endsWith(`.${PLACEHOLDER_DOMAIN_SUFFIX}`)) return true;
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return RESERVED_TEST_TLDS.has(tld);
}
