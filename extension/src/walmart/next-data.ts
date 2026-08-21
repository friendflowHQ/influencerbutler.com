// Walmart is a Next.js app: the product/search data the page renders lives in a
// <script id="__NEXT_DATA__"> JSON blob, readable from the isolated content-
// script world (no MAIN-world hook needed). Verified live 2026-08-21:
//   product page -> props.pageProps.initialData.data.product
//   search/browse -> props.pageProps.initialData.searchResult.itemStacks[].items[]
// These readers pull that JSON out of a Document and hand the pure parsers a
// plain object, so the parsers can be unit-tested without a live DOM.

export type NextData = Record<string, unknown>;

// Parse the __NEXT_DATA__ script out of a document. Returns null when absent or
// unparseable (a bot wall, or a page shape we do not handle).
export function readNextData(doc: Document): NextData | null {
  const el = doc.getElementById("__NEXT_DATA__");
  const text = el?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as NextData;
  } catch {
    return null;
  }
}

// Safe nested getter: pathInto(obj, "props.pageProps.initialData") without
// throwing on a missing link.
export function pathInto(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
