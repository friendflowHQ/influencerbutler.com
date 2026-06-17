// Pure helpers for building Pinterest pin metadata. Kept framework-free (no
// "use client", no server-only imports) so both the server blog page and the
// client share component can import it.

// Turn the post keywords ("amazon creator connections, brand deals") into a few
// PascalCase Pinterest hashtags (#AmazonCreatorConnections #BrandDeals).
export function hashtagsFromKeywords(keywords: string, max = 3): string {
  return keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, max)
    .map(
      (k) =>
        "#" +
        k
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(""),
    )
    .join(" ");
}

// Build a keyword-rich Pinterest description, kept under Pinterest's 500-char
// limit (we aim for ~480 to leave room for the hashtags).
export function buildPinDescription(
  title: string,
  summary: string,
  keywords = "",
): string {
  const tags = hashtagsFromKeywords(keywords);
  const base = summary ? `${title}. ${summary}` : title;
  const budget = 480 - (tags ? tags.length + 1 : 0);
  const trimmed =
    base.length > budget ? `${base.slice(0, budget - 1).trimEnd()}...` : base;
  return tags ? `${trimmed} ${tags}` : trimmed;
}
