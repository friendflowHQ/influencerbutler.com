// Server-side loader that extracts the Features section from public/index.html
// at request time, so any edits to the homepage features (adding/removing a
// butler, retitling, swapping icons) automatically surface on /pricing without
// a second source of truth.

import { promises as fs } from "node:fs";
import path from "node:path";

const HTML_PATH = path.join(process.cwd(), "public", "index.html");

export type FeatureCard = {
  href: string;
  category: string;
  iconSvg: string;
  title: string;
  description: string;
  badge: { text: string; flagship: boolean } | null;
};

export type FeaturesSection = {
  sectionLabel: string;
  heading: string;
  subtitle: string;
  cards: FeatureCard[];
};

const EMPTY: FeaturesSection = {
  sectionLabel: "Features",
  heading: "",
  subtitle: "",
  cards: [],
};

function htmlDecode(s: string): string {
  return s
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&hellip;/g, "…")
    .replace(/&amp;/g, "&");
}

function extractAttr(open: string, attr: string): string {
  const m = open.match(new RegExp(`${attr}="([^"]*)"`));
  return m?.[1] ?? "";
}

export async function loadLandingFeatures(): Promise<FeaturesSection> {
  let html: string;
  try {
    html = await fs.readFile(HTML_PATH, "utf8");
  } catch {
    return EMPTY;
  }

  const sectionStart = html.indexOf('<section class="features" id="features">');
  if (sectionStart === -1) return EMPTY;

  // The features section is followed by the "INTEGRATIONS STRIP" comment; the
  // intermediate capability-highlight nested <section> makes naive </section>
  // matching unsafe.
  const sectionEnd = html.indexOf("INTEGRATIONS STRIP", sectionStart);
  const block = html.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const sectionLabel = htmlDecode(
    block.match(/<span class="section-label">([^<]+)<\/span>/)?.[1]?.trim() ?? "Features",
  );

  const heading = htmlDecode(
    block
      .match(/<span class="section-label">[^<]+<\/span>\s*<h2>([\s\S]*?)<\/h2>/)?.[1]
      ?.trim() ?? "",
  );

  const subtitle = htmlDecode(
    block.match(/<p class="section-sub">([\s\S]*?)<\/p>/)?.[1]?.trim() ?? "",
  );

  const cards: FeatureCard[] = [];
  const cardOpen = /<a\s+class="feature-card[^"]*"[\s\S]*?>/g;
  let openMatch: RegExpExecArray | null;
  while ((openMatch = cardOpen.exec(block)) !== null) {
    const openTag = openMatch[0];
    const innerStart = openMatch.index + openTag.length;
    const closeIdx = block.indexOf("</a>", innerStart);
    if (closeIdx === -1) continue;
    const inner = block.slice(innerStart, closeIdx);

    const iconSvg = (inner.match(/<div class="feature-icon">([\s\S]*?)<\/div>/)?.[1] ?? "").trim();
    const title = htmlDecode((inner.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "").trim());
    const description = htmlDecode((inner.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? "").trim());

    const badgeMatch = inner.match(/<span class="feature-badge([^"]*)">([^<]+)<\/span>/);
    const badge = badgeMatch
      ? {
          text: htmlDecode(badgeMatch[2].trim()),
          flagship: /feature-badge--flagship/.test(badgeMatch[1]),
        }
      : null;

    cards.push({
      href: extractAttr(openTag, "href"),
      category: extractAttr(openTag, "data-category"),
      iconSvg,
      title,
      description,
      badge,
    });
  }

  return { sectionLabel, heading, subtitle, cards };
}
