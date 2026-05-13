/**
 * Web Bot Auth (HTTP Message Signatures, RFC 9421) — DELEGATED.
 *
 * Verification is handled at the edge: when this site is fronted by Cloudflare,
 * the "Verified Bots" feature checks Signature/Signature-Input headers against
 * Cloudflare's Web Bot Auth directory of public keys and forwards a
 * `cf-verified-bot: true` header to origin requests it has authenticated.
 *
 * This stub is intentionally not a full RFC 9421 implementation. The protected
 * surface (`/api/*`) is already gated by Supabase JWT, so verifying bot identity
 * adds no security gain today. If we ever need in-app verification we can:
 *   1. Resolve `Signature-Input` and `Signature` headers per RFC 9421 §3
 *   2. Fetch the Cloudflare HTTP Message Signatures directory
 *      (https://http-message-signatures-example.research.cloudflare.com/.well-known/http-message-signatures-directory),
 *      cache for 1h
 *   3. Build the canonical signature base from `@signature-params` and listed
 *      covered components, verify with crypto.subtle (Ed25519/EdDSA)
 *   4. On success, set a response header `x-bot-verified: <keyId>`.
 */

export type BotAuthVerdict = {
  verified: boolean;
  keyId?: string;
  reason: string;
};

export function verifySignature(req: Request): BotAuthVerdict {
  const cf = req.headers.get("cf-verified-bot");
  if (cf && cf.toLowerCase() === "true") {
    const ua = req.headers.get("user-agent") ?? "";
    return {
      verified: true,
      keyId: ua || "cloudflare-verified",
      reason: "verified-by-edge",
    };
  }
  if (req.headers.get("signature") || req.headers.get("signature-input")) {
    return { verified: false, reason: "rfc-9421-not-implemented-in-app" };
  }
  return { verified: false, reason: "no-signature" };
}
