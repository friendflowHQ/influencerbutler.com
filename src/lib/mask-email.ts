/**
 * Masks an email address for display to a client that authenticated with a
 * bearer license key.
 *
 * A license key is effectively an account credential: whoever holds it
 * authenticates AS the account it is bound to. That means a key can legitimately
 * be held by someone other than the account owner (for example, a comp key the
 * owner generated and handed to a customer). We must therefore never echo the
 * full account email back to a license-bearer client, or the holder sees the
 * owner's address. We return just enough for the legitimate owner to recognize
 * their own account without disclosing the full address.
 *
 * elizabethdean30@gmail.com -> e***@gmail.com
 *
 * Returns null when there is nothing safe to show (null/blank input, or a value
 * without a usable local part and domain).
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  // Need at least one character before "@" and a non-empty domain after it.
  if (at <= 0 || at === trimmed.length - 1) return null;
  const first = trimmed[0];
  const domain = trimmed.slice(at + 1);
  return `${first}***@${domain}`;
}
