// Resolve {placeholder} tokens in a template body just before it is inserted
// into the Creator Connections composer. Two sources feed the value map: the
// open thread's brand (so {brandName} fills itself) and the creator's own
// profile values the desktop app sends alongside its templates ({storefrontUrl},
// {address}, {mediakit}, apparel sizes, ...). The user asked for both behaviors:
// fill every token we have a value for, then STRIP any token still unresolved so
// no raw {braces} ever land in the message.

// Match a single {token}: letters, digits, spaces, dashes and underscores
// inside the braces (Amazon brand names never appear as literal braces in a
// template body, so this is safe). Nested braces are not supported.
const TOKEN_RE = /\{\s*([\w-]+)\s*\}/g;

// Build the case-insensitive lookup once so {brandName}, {brandname} and
// {BRANDNAME} all resolve to the same value.
function lowerKeys(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") out[key.trim().toLowerCase()] = value;
  }
  return out;
}

// Substitute every token we have a non-empty value for, drop the rest, then tidy
// the seams stripping leaves behind: a token that sat between two spaces would
// otherwise leave a double space, and one before a comma/period would leave a
// gap before the punctuation.
export function resolvePlaceholders(body: string, values: Record<string, string>): string {
  const map = lowerKeys(values);
  const substituted = body.replace(TOKEN_RE, (_match, rawToken: string) => {
    const value = map[String(rawToken).trim().toLowerCase()];
    return value && value.trim().length > 0 ? value : "";
  });
  return tidy(substituted);
}

// Collapse the whitespace/punctuation artifacts a removed token leaves behind,
// without touching intentional formatting like paragraph breaks.
function tidy(text: string): string {
  return text
    .replace(/[ \t]+([,.;:!?])/g, "$1") // space(s) left before punctuation
    .replace(/[ \t]{2,}/g, " ") // runs of spaces collapsed to one
    .replace(/ +\n/g, "\n") // trailing spaces on a line
    .replace(/\n{3,}/g, "\n\n") // never more than one blank line
    .trim();
}
