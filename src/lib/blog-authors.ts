/**
 * Summary: Author registry for blog bylines. A post's `author` frontmatter value is
 *   looked up here by name. A registered person gets a linked byline, an author box
 *   under the post and Person structured data (real, named authors are a trust
 *   signal for Google and AI answers). Anyone not registered, including the default
 *   "The Influencer Butler Team", stays an Organization byline exactly as before.
 *
 * To add an author: add an entry below, then set `author: <Name>` in a post's
 * frontmatter. Only attribute posts to a person who actually wrote or reviewed them.
 */

const SITE = "https://www.influencerbutler.com";

export type BlogAuthor = {
  name: string;
  jobTitle: string;
  /** Root-relative path of the page about this person. */
  path: string;
  /** Root-relative image path. */
  image: string;
  bio: string;
  /** Public profile URLs (add real ones; they strengthen the entity). */
  sameAs: string[];
};

export const DEFAULT_AUTHOR_NAME = "The Influencer Butler Team";

const AUTHORS: BlogAuthor[] = [
  {
    name: "Liz Dean",
    jobTitle: "Founder, Influencer Butler",
    path: "/about",
    image: "/assets/Liz_Dean.png",
    bio: "Full-time influencer since 2015, community builder, and founder of Influencer Butler.",
    sameAs: [],
  },
];

export function findBlogAuthor(name: string | undefined | null): BlogAuthor | null {
  const wanted = (name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return AUTHORS.find((a) => a.name.toLowerCase() === wanted) ?? null;
}

/** schema.org author node for a post's JSON-LD. */
export function authorJsonLd(name: string): Record<string, unknown> {
  const person = findBlogAuthor(name);
  if (!person) {
    return { "@type": "Organization", name: name || DEFAULT_AUTHOR_NAME, url: SITE };
  }
  return {
    "@type": "Person",
    name: person.name,
    jobTitle: person.jobTitle,
    url: `${SITE}${person.path}`,
    image: `${SITE}${person.image}`,
    worksFor: { "@type": "Organization", name: "Influencer Butler", url: SITE },
    ...(person.sameAs.length ? { sameAs: person.sameAs } : {}),
  };
}

/**
 * dateModified for structured data and the "Updated" label: the post's `updated`
 * value when it is a valid ISO date on or after the publish date, otherwise the
 * publish date. Never invents freshness; a post is only "updated" when someone
 * sets `updated` after a real edit.
 */
export function resolveModifiedDate(published: string, updated?: string | null): string {
  const ok = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(updated)) return published;
  if (ok(published) && updated < published) return published;
  return updated;
}
