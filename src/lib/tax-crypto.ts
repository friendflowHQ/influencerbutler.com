/**
 * App-level AES-256-GCM encryption for affiliate tax identification numbers
 * (SSN / EIN / ITIN). We hold these because the self-hosted affiliate program
 * makes us the payer, so we must collect W-9 / W-8BEN and issue 1099-NECs.
 *
 * The key lives OUTSIDE the database in TAX_FORM_ENCRYPTION_KEY (a base64-encoded
 * 32-byte value), so a database dump or a leaked service-role key alone cannot
 * decrypt a TIN. Ciphertext, IV, and GCM auth tag are stored base64 in the
 * service-role-only table affiliate_tax_tins. Only the super-admin reveal route
 * ever calls decryptTin, and every call is audited.
 *
 * Generate a key with:  openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the standard for GCM.

function getKey(): Buffer {
  const raw = process.env.TAX_FORM_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TAX_FORM_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TAX_FORM_ENCRYPTION_KEY must decode to exactly 32 bytes (generate with `openssl rand -base64 32`)",
    );
  }
  return key;
}

/** True when a usable 32-byte key is configured, so routes can 503 cleanly. */
export function taxKeyConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export type EncryptedTin = {
  /** base64 */
  ciphertext: string;
  /** base64 */
  iv: string;
  /** base64 GCM auth tag */
  tag: string;
};

export function encryptTin(plain: string): EncryptedTin {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypts a TIN. Throws if the auth tag doesn't verify (tampered ciphertext or
 * wrong key), so a corrupted/forged row can never silently return garbage.
 */
export function decryptTin(enc: EncryptedTin): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** Last four digits of a TIN, for non-sensitive display (e.g. "***-**-1234"). */
export function tinLastFour(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  return digits.slice(-4);
}
