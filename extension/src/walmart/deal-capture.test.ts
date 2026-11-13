import { describe, expect, it } from "vitest";
import {
  collectWalmartDeals,
  findTileCard,
  isWalmartDealsUrl,
  parseWalmartTilePricing,
  readTileProduct,
  tileText,
  walmartItemIdFromHref,
  type TileElement,
  type TileNode,
} from "./deal-capture";

// vitest runs in the node environment with no jsdom in this repo, so the
// fixture below is parsed by a tiny HTML reader into nodes that carry exactly
// the DOM subset deal-capture walks (TileElement). Good enough for a well-formed
// fixture; the live page is only verified by hand.

const VOID = new Set(["img", "br", "input", "meta", "source", "hr"]);

type FakeEl = TileElement & { childNodes: TileNode[]; attrs: Record<string, string> };

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function makeEl(tag: string, attrs: Record<string, string>, parent: FakeEl | null): FakeEl {
  const el: FakeEl = {
    nodeType: 1,
    nodeValue: null,
    tagName: tag.toUpperCase(),
    parentElement: parent,
    childNodes: [],
    attrs,
    getAttribute: (name) => (name in attrs ? (attrs[name] as string) : null),
  };
  return el;
}

function parseHtml(html: string): FakeEl {
  const root = makeEl("body", {}, null);
  const stack: FakeEl[] = [root];
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
  for (const m of html.matchAll(token)) {
    const top = stack[stack.length - 1] as FakeEl;
    if (m[1]) {
      stack.pop();
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? "").matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)) {
        if (a[1]) attrs[a[1]] = decode(a[2] ?? "");
      }
      const el = makeEl(m[2], attrs, top);
      top.childNodes.push(el);
      if (!VOID.has(m[2].toLowerCase())) stack.push(el);
    } else if (m[4]) {
      top.childNodes.push({ nodeType: 3, nodeValue: decode(m[4]), childNodes: [] });
    }
  }
  return root;
}

function anchorsIn(el: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (node: TileNode) => {
    if (node.nodeType !== 1) return;
    const e = node as FakeEl;
    if (e.tagName === "A" && (e.getAttribute("href") ?? "").includes("/ip/")) out.push(e);
    e.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}

// One Black Friday deal-grid tile in the shape Walmart renders: an image link
// and a title link to the same item, a screen-reader price line, the visible
// split price, and a fulfillment line.
const TILE_A = `
<div data-item-id="ABC123" class="tile">
  <div class="media">
    <a href="/ip/Some-Name-55-inch-TV/17701403764?classType=REGULAR&amp;athbdg=L1600" link-identifier="17701403764">
      <img src="https://i5.walmartimages.com/seo/tv.jpeg?odnHeight=180" alt="Some Name 55 inch TV">
    </a>
  </div>
  <div class="flag"><span>Black Friday Deal</span></div>
  <div data-automation-id="product-price">
    <span class="w_iUH7">current price Now $199.00</span>
    <span aria-hidden="true">Now $199</span><span aria-hidden="true">00</span>
    <span class="strike">Was $299.00</span>
  </div>
  <a href="https://www.walmart.com/ip/Some-Name-55-inch-TV/17701403764"><span data-automation-id="product-title">Some Name 55" Class 4K Smart TV</span></a>
  <div data-automation-id="fulfillment-badge"><span>Free shipping, arrives in 2 days</span></div>
</div>`;

const TILE_B = `
<div data-item-id="DEF456" class="tile">
  <a href="/ip/Cozy-Throw-Blanket/123456789"><img src="data:image/gif;base64,R0lGOD" alt="Cozy Throw Blanket"></a>
  <div><span>Rollback</span></div>
  <div><span>Now $9.97</span> <span>Was $14.97</span></div>
  <div><div>Pickup today</div></div>
</div>`;

const GRID = `<section class="grid">${TILE_A}${TILE_B}
  <a href="/cp/black-friday-deals/123">Shop all deals</a>
  <a href="/ip/seort">Not an item</a>
</section>`;

describe("walmartItemIdFromHref", () => {
  it("reads the trailing digit run of an /ip/ path", () => {
    expect(walmartItemIdFromHref("https://www.walmart.com/ip/Some-Name/17701403764")).toBe("17701403764");
    expect(walmartItemIdFromHref("/ip/Some-Name/17701403764?classType=REGULAR&from=/search")).toBe("17701403764");
    expect(walmartItemIdFromHref("/ip/17701403764")).toBe("17701403764");
    expect(walmartItemIdFromHref("/ip/Some-Name/17701403764/")).toBe("17701403764");
  });

  it("ignores links that are not walmart.com /ip/ items", () => {
    expect(walmartItemIdFromHref("/cp/black-friday/1234567")).toBeNull();
    expect(walmartItemIdFromHref("/ip/seort")).toBeNull();
    expect(walmartItemIdFromHref("https://www.amazon.com/ip/Foo/17701403764")).toBeNull();
    expect(walmartItemIdFromHref("")).toBeNull();
    expect(walmartItemIdFromHref(null)).toBeNull();
  });
});

describe("isWalmartDealsUrl", () => {
  it("matches the deal pages", () => {
    for (const path of ["black-friday", "cyber-monday", "earlyaccess", "top100", "electronics"]) {
      expect(isWalmartDealsUrl(`https://www.walmart.com/shop/deals/${path}`)).toBe(true);
    }
    expect(isWalmartDealsUrl("https://www.walmart.com/shop/deals")).toBe(true);
  });

  it("leaves other Walmart pages alone", () => {
    expect(isWalmartDealsUrl("https://www.walmart.com/shop/savings")).toBe(false);
    expect(isWalmartDealsUrl("https://www.walmart.com/shop/dealsxyz")).toBe(false);
    expect(isWalmartDealsUrl("https://www.walmart.com/ip/Foo/123456")).toBe(false);
    expect(isWalmartDealsUrl("https://www.amazon.com/shop/deals/black-friday")).toBe(false);
    expect(isWalmartDealsUrl("not a url")).toBe(false);
  });
});

describe("parseWalmartTilePricing (port of the desktop parser)", () => {
  it("reads now, was and the Black Friday badge", () => {
    expect(parseWalmartTilePricing("Black Friday Deal current price Now $199.00 Was $299.00")).toEqual({
      nowPrice: 199,
      wasPrice: 299,
      badge: "Black Friday Deal",
    });
  });

  it("reads a current-price line without Now, and thousands separators", () => {
    expect(parseWalmartTilePricing("current price $1,299.99")).toEqual({ nowPrice: 1299.99 });
  });

  it("ranks the badges like the desktop", () => {
    expect(parseWalmartTilePricing("Walmart+ Early Access Black Friday Deal").badge).toBe("Walmart+ Early Access");
    expect(parseWalmartTilePricing("Cyber Monday Deal").badge).toBe("Cyber Monday Deal");
    expect(parseWalmartTilePricing("Flash Deal Rollback").badge).toBe("Flash Deal");
    expect(parseWalmartTilePricing("Rollback Now $5").badge).toBe("Rollback");
  });

  it("returns nothing for empty or price-less text", () => {
    expect(parseWalmartTilePricing("")).toEqual({});
    expect(parseWalmartTilePricing(null)).toEqual({});
    expect(parseWalmartTilePricing("Now $0.00")).toEqual({});
  });
});

describe("tile reading", () => {
  it("joins text nodes with spaces so sibling prices do not fuse", () => {
    const el = parseHtml(`<div><span>Now $199.00</span><span>Was $299.00</span></div>`);
    expect(tileText(el)).toBe("Now $199.00 Was $299.00");
  });

  it("climbs from a tile link to its card, not to the grid", () => {
    const grid = parseHtml(GRID);
    const anchor = anchorsIn(grid)[0] as FakeEl;
    const card = findTileCard(anchor, "17701403764") as FakeEl;
    expect(card.getAttribute("data-item-id")).toBe("ABC123");
  });

  it("maps a Black Friday tile to the walmartEvent.capture product shape", () => {
    const grid = parseHtml(GRID);
    const product = readTileProduct(anchorsIn(grid)[0] as FakeEl);
    expect(product).toEqual({
      itemId: "17701403764",
      title: 'Some Name 55" Class 4K Smart TV',
      url: "https://www.walmart.com/ip/17701403764",
      imageUrl: "https://i5.walmartimages.com/seo/tv.jpeg?odnHeight=180",
      nowPrice: 199,
      wasPrice: 299,
      badge: "Black Friday Deal",
      shippingText: "Free shipping, arrives in 2 days",
    });
  });

  it("collects one product per item, skips non-items, and drops non-https images", () => {
    const grid = parseHtml(GRID);
    const { products, capped } = collectWalmartDeals(anchorsIn(grid));
    expect(capped).toBe(false);
    expect(products.map((p) => p.itemId)).toEqual(["17701403764", "123456789"]);
    const blanket = products[1];
    expect(blanket).toEqual({
      itemId: "123456789",
      title: "Cozy Throw Blanket",
      url: "https://www.walmart.com/ip/123456789",
      nowPrice: 9.97,
      wasPrice: 14.97,
      badge: "Rollback",
      shippingText: "Pickup today",
    });
  });

  it("caps the number of products per click", () => {
    const grid = parseHtml(GRID);
    const { products, capped } = collectWalmartDeals(anchorsIn(grid), { max: 1 });
    expect(products).toHaveLength(1);
    expect(capped).toBe(true);
  });
});
