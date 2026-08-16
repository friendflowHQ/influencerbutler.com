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

export type CatalogueKind = "cc" | "spcc" | "deals";

export type LatestPointer = {
  version: string;
  files: Record<string, { url: string }>;
  totals: { asins?: number; campaigns?: number; deals?: number };
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

// Picks the source object: CC and deals use the compact asin-index (a JSON
// object per line carrying "asin"), SPCC the catalog (already small and carries
// the asin on every row).
function sourceFile(kind: CatalogueKind, latest: LatestPointer): string {
  const rel =
    kind === "cc" || kind === "deals"
      ? latest.files.asinIndex?.url
      : latest.files.catalog?.url ?? latest.files.spcc?.url;
  if (!rel) throw new Error(`no source file url for ${kind}`);
  return `${PREFIX}/${kind}/${rel}`;
}

// Streams a gzipped NDJSON object from R2 line by line without holding the
// decompressed file in memory. `onLine` gets each non-empty line; when it
// returns a promise the stream waits for it (backpressure for chunked
// flushes), so returning promises only on chunk boundaries keeps per-line
// overhead near zero.
async function streamNdjson(
  key: string,
  onLine: (line: string) => void | Promise<void>,
): Promise<void> {
  const res = await r2Fetch(key);
  const stream = res.body!.pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl);
      if (line.trim()) {
        const wait = onLine(line);
        if (wait) await wait;
      }
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) {
    const wait = onLine(buffer);
    if (wait) await wait;
  }
}

export type CcRateRow = {
  asin: string;
  ratePct: number;
  brand: string | null;
  endsAt: string | null; // ISO, null when the campaign end date is unparseable
};

// Builds the per-ASIN best-active-campaign-rate rows from the CC catalogue:
// campaign rows (catalog.ndjson: id, brand, endDate, commissionRate as a
// percent) joined to the asin-index ({asin, ids}). Streaming with chunked,
// awaited flushes so the multi-million-row asin-index never accumulates in
// memory and upserts never pile up concurrently.
export async function buildCcRates(opts: {
  onChunk: (rows: CcRateRow[]) => Promise<void>;
  chunkSize?: number;
  // Resume support: skip this many already-flushed rate rows before calling
  // onChunk again. The NDJSON stream order is deterministic for a given
  // catalogue version, so a timed-out run can pick up where it stopped.
  skipRows?: number;
}): Promise<{ version: string; rowCount: number; campaignCount: number }> {
  const latest = await readLatest("cc");
  const catalogRel = latest.files.catalog?.url;
  const indexRel = latest.files.asinIndex?.url;
  if (!catalogRel || !indexRel) throw new Error("cc latest.json missing catalog/asinIndex files");

  // Pass 1: campaign id -> {rate, brand, endsAt}, active campaigns only. The
  // campaign list is small (thousands), so an in-memory map is fine.
  const campaigns = new Map<string, { ratePct: number; brand: string | null; endsAt: string | null }>();
  const now = Date.now();
  await streamNdjson(`${PREFIX}/cc/${catalogRel}`, (line) => {
    let row: {
      _meta?: unknown;
      id?: string;
      brand?: string;
      endDate?: string | null;
      commissionRate?: number | null;
    };
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    if (row._meta || !row.id || typeof row.commissionRate !== "number") return;
    let endsAt: string | null = null;
    if (row.endDate) {
      const parsed = Date.parse(row.endDate);
      if (Number.isFinite(parsed)) {
        // Skip campaigns that ended more than a day ago; a stale rate chip is
        // worse than no chip.
        if (parsed < now - 24 * 60 * 60 * 1000) return;
        endsAt = new Date(parsed).toISOString();
      }
    }
    campaigns.set(row.id, {
      ratePct: row.commissionRate,
      brand: row.brand?.trim() || null,
      endsAt,
    });
  });

  // Pass 2: asin-index rows ({asin, ids}) -> best active rate per ASIN. Chunk
  // flushes return their promise into the stream loop, which awaits them, so
  // exactly one upsert batch is in flight at a time.
  const chunkSize = opts.chunkSize ?? 10_000;
  const skipRows = opts.skipRows ?? 0;
  let chunk: CcRateRow[] = [];
  let rowCount = 0;
  await streamNdjson(`${PREFIX}/cc/${indexRel}`, (line) => {
    let row: { _meta?: unknown; asin?: string; ids?: string[] };
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    if (row._meta || !row.asin || !Array.isArray(row.ids)) return;
    const asin = row.asin.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) return;
    let best: { ratePct: number; brand: string | null; endsAt: string | null } | null = null;
    for (const id of row.ids) {
      const c = campaigns.get(id);
      if (c && (!best || c.ratePct > best.ratePct)) best = c;
    }
    if (!best) return;
    rowCount += 1;
    // Rows a previous (timed-out) run already flushed: count them but do not
    // re-upsert.
    if (rowCount <= skipRows) return;
    chunk.push({ asin, ratePct: best.ratePct, brand: best.brand, endsAt: best.endsAt });
    if (chunk.length >= chunkSize) {
      const out = chunk;
      chunk = [];
      return opts.onChunk(out);
    }
    return;
  });
  if (chunk.length > 0) await opts.onChunk(chunk);

  return { version: latest.version, rowCount, campaignCount: campaigns.size };
}

export async function buildFilter(kind: CatalogueKind): Promise<BuiltFilter> {
  const latest = await readLatest(kind);
  const key = sourceFile(kind, latest);
  const res = await r2Fetch(key);

  const expected = latest.totals.asins ?? latest.totals.campaigns ?? latest.totals.deals ?? 200_000;
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
