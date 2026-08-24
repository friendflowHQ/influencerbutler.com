// Minimal AWS Signature Version 4 signer for the Product Advertising API v5,
// built on WebCrypto (HMAC-SHA256 + SHA-256). PA-API is the only AWS-signed
// service the extension talks to, so this covers exactly its shape: a POST with
// an empty query string and the fixed signed-header set
// content-encoding;content-type;host;x-amz-date;x-amz-target. Every header we
// send must be in the signed set: PA-API rejects a request whose content-type
// is sent but unsigned with a misleading "Access Key ID ... invalid" error.
// This set matches the server signer in src/lib/paapi.ts, which is validated
// against AWS's published SigV4 vectors.

// TextEncoder yields a Uint8Array whose backing buffer is typed as
// ArrayBufferLike; wrapping in a fresh Uint8Array pins it to ArrayBuffer so it
// satisfies WebCrypto's BufferSource parameters under the current lib types.
function bytes(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(s));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", bytes(input)));
}

async function hmac(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, bytes(message));
  return new Uint8Array(sig);
}

export type SignedRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type SignParams = {
  accessKey: string;
  secretKey: string;
  host: string; // for example webservices.amazon.com
  region: string; // for example us-east-1
  service: string; // for example ProductAdvertisingAPI
  path: string; // for example /paapi5/searchitems
  target: string; // x-amz-target value
  body: string; // JSON payload
  amzDate: string; // YYYYMMDDTHHMMSSZ
};

// Produce the fully-signed request (url + headers + body) ready to fetch().
export async function signPaapi(p: SignParams): Promise<SignedRequest> {
  const dateStamp = p.amzDate.slice(0, 8);
  const contentEncoding = "amz-1.0";
  const contentType = "application/json; charset=utf-8";
  // Signed headers must be lowercased and sorted, and must cover every header we
  // actually send (see the note at the top of this file).
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";

  const canonicalHeaders =
    `content-encoding:${contentEncoding}\n` +
    `content-type:${contentType}\n` +
    `host:${p.host}\n` +
    `x-amz-date:${p.amzDate}\n` +
    `x-amz-target:${p.target}\n`;

  const payloadHash = await sha256Hex(p.body);
  const canonicalRequest = [
    "POST",
    p.path,
    "", // empty canonical query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${p.region}/${p.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    p.amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(bytes(`AWS4${p.secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, p.region);
  const kService = await hmac(kRegion, p.service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex((await hmac(kSigning, stringToSign)).buffer);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${p.host}${p.path}`,
    headers: {
      "content-encoding": contentEncoding,
      "content-type": contentType,
      host: p.host,
      "x-amz-date": p.amzDate,
      "x-amz-target": p.target,
      Authorization: authorization,
    },
    body: p.body,
  };
}

// x-amz-date for a Date: YYYYMMDDTHHMMSSZ (ISO with punctuation stripped).
export function amzDate(iso: string): string {
  return iso.replace(/[:-]/g, "").replace(/\.\d{3}/, "");
}
