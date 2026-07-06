/**
 * Reads the CC / SPCC catalogue from the influencerbutler R2 bucket via the
 * Cloudflare API (Bearer token, no S3 signing needed) and builds an ASIN
 * membership Bloom filter by streaming the gzipped NDJSON line by line, so a
 * 700 MB uncompressed index never lands in memory.
 *
 * Env:
 *   CLOUDFLARE_ACCOUNT_ID  the R2 account id
 *   R2_READ_TOKEN          a Cloudflare API token with R2 object read
 */
import { buildBloomStreaming, type SerializedBloom } from "./bloom";

const BUCKET = "influencerbutler";
const PREFIX = "dcb/catalogues";
const ASIN_RE = /"asin"\s*:\s*"([A-Z0-9]{10})"/;

export type CatalogueKind = "cc" | "spcc";

export type LatestPointer = {
  version: string;
  files: Record<string, { url: string }>;
  totals: { asins?: number; campaigns?: number };
};

export type BuiltFilter = {
  kind: CatalogueKind;
  version: string;
  asinCount: number;
  bloom: SerializedBloom;
};

export function r2Configured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.R2_READ_TOKEN);
}

function objectUrl(key: string): string {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  return `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${BUCKET}/objects/${key}`;
}

async function r2Fetch(key: string): Promise<Response> {
  const res = await fetch(objectUrl(key), {
    headers: { Authorization: `Bearer ${process.env.R2_READ_TOKEN}` },
  });
  if (!res.ok || !res.body) {
    throw new Error(`R2 read ${key} failed: ${res.status}`);
  }
  return res;
}

export async function readLatest(kind: CatalogueKind): Promise<LatestPointer> {
  const res = await r2Fetch(`${PREFIX}/${kind}/latest.json`);
  return (await res.json()) as LatestPointer;
}

// Reads a small JSON object from R2, returning null when R2 is not configured
// or the object does not exist yet (404). Used for the rate card (a few KB),
// which needs neither the streaming nor the Bloom path.
export async function r2ReadJson<T>(key: string): Promise<T | null> {
  if (!r2Configured()) return null;
  const res = await fetch(objectUrl(key), {
    headers: { Authorization: `Bearer ${process.env.R2_READ_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 read ${key} failed: ${res.status}`);
  return (await res.json()) as T;
}

// Picks the source object: CC uses the compact asin-index, SPCC the catalog
// (which is already small and carries the asin on every row).
function sourceFile(kind: CatalogueKind, latest: LatestPointer): string {
  const rel =
    kind === "cc"
      ? latest.files.asinIndex?.url
      : latest.files.catalog?.url ?? latest.files.spcc?.url;
  if (!rel) throw new Error(`no source file url for ${kind}`);
  return `${PREFIX}/${kind}/${rel}`;
}

export async function buildFilter(kind: CatalogueKind): Promise<BuiltFilter> {
  const latest = await readLatest(kind);
  const key = sourceFile(kind, latest);
  const res = await r2Fetch(key);

  const expected = latest.totals.asins ?? latest.totals.campaigns ?? 200_000;
  const builder = buildBloomStreaming(expected, 0.01);

  const stream = res.body!.pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let count = 0;

  const consumeLine = (line: string) => {
    const match = line.match(ASIN_RE);
    if (match && match[1]) {
      builder.add(match[1]);
      count++;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      consumeLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) consumeLine(buffer);

  return { kind, version: latest.version, asinCount: count, bloom: builder.serialize() };
}
