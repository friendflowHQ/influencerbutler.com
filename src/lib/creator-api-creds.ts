/**
 * creator-api-creds.ts - the at-rest vault for a user's Amazon Creator API
 * (PA-API) credentials, used by /api/extension/creator-api (write/status) and
 * /api/extension/enrich (read + sign).
 *
 * Security posture: the PA-API secret key is the sensitive field. It is
 * encrypted with AES-256-GCM before it touches the database, using a key
 * derived from CREATOR_API_ENC_KEY (a Vercel env secret, never in git or the
 * DB). A database-only breach therefore yields ciphertext, not usable secrets.
 * The secret is write-only over the API: it is decrypted only server-side to
 * sign PA-API calls and is never returned to any client.
 *
 * Reads/writes go through createAdminClient(): extension_creator_api_creds is
 * RLS-enabled with zero policies (see 20260708_creator_api_creds.sql).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { marketplaceInfo, type PaapiCreds } from "@/lib/paapi";

// One marketplace's credentials as stored in the marketplaces JSONB array. The
// secret is split into ciphertext + iv + authTag (all base64) for AES-256-GCM.
export type StoredMarketplaceCreds = {
  host: string;
  partnerTag: string;
  accessKeyId: string;
  secretCipher: string;
  iv: string;
  authTag: string;
};

// The shape a client (extension onboarding) posts. secretKey is plaintext over
// HTTPS and is immediately encrypted; it is never persisted in the clear.
export type IncomingMarketplaceCreds = {
  host: string;
  partnerTag: string;
  accessKeyId: string;
  secretKey: string;
};

export type CredsStatus = {
  configured: boolean;
  marketplaces: string[]; // hosts only, never secrets
  updatedAt: string | null;
};

function encKey(): Buffer | null {
  const raw = process.env.CREATOR_API_ENC_KEY;
  if (!raw || raw.length < 16) return null;
  // Hash to a fixed 32-byte AES-256 key regardless of how the env secret is
  // formatted (hex, base64, or a passphrase).
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptionAvailable(): boolean {
  return encKey() !== null;
}

export function encryptSecret(plaintext: string): { secretCipher: string; iv: string; authTag: string } {
  const key = encKey();
  if (!key) throw new Error("CREATOR_API_ENC_KEY is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    secretCipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(entry: Pick<StoredMarketplaceCreds, "secretCipher" | "iv" | "authTag">): string {
  const key = encKey();
  if (!key) throw new Error("CREATOR_API_ENC_KEY is not configured");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(entry.secretCipher, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// Validates and normalizes an incoming marketplace entry. Returns null if any
// field is missing/invalid or the marketplace is unsupported.
export function validateIncoming(raw: unknown): IncomingMarketplaceCreds | null {
  const e = raw as Record<string, unknown>;
  const host = typeof e?.host === "string" ? e.host.trim().toLowerCase() : "";
  const partnerTag = typeof e?.partnerTag === "string" ? e.partnerTag.trim() : "";
  const accessKeyId = typeof e?.accessKeyId === "string" ? e.accessKeyId.trim() : "";
  const secretKey = typeof e?.secretKey === "string" ? e.secretKey.trim() : "";
  if (!marketplaceInfo(host)) return null;
  if (partnerTag.length < 2 || partnerTag.length > 80) return null;
  if (accessKeyId.length < 8 || accessKeyId.length > 128) return null;
  if (secretKey.length < 8 || secretKey.length > 256) return null;
  return { host, partnerTag, accessKeyId, secretKey };
}

export type SaveResult = { ok: true } | { ok: false; migrationPending?: boolean; error: string };

export async function saveCreds(userId: string, incoming: IncomingMarketplaceCreds[]): Promise<SaveResult> {
  if (!encryptionAvailable()) return { ok: false, error: "Server encryption key not configured" };
  const now = new Date().toISOString();
  const stored: StoredMarketplaceCreds[] = incoming.map((c) => {
    const { secretCipher, iv, authTag } = encryptSecret(c.secretKey);
    return { host: c.host, partnerTag: c.partnerTag, accessKeyId: c.accessKeyId, secretCipher, iv, authTag };
  });
  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_creator_api_creds")
    .upsert({ user_id: userId, marketplaces: stored, updated_at: now }, { onConflict: "user_id" });
  if (error) {
    if (isMissingTableError(error)) return { ok: false, migrationPending: true, error: "Migration not applied yet" };
    console.error("creator-api-creds: save failed", error);
    return { ok: false, error: "Could not save credentials" };
  }
  return { ok: true };
}

export async function deleteCreds(userId: string): Promise<SaveResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("extension_creator_api_creds").delete().eq("user_id", userId);
  if (error) {
    if (isMissingTableError(error)) return { ok: false, migrationPending: true, error: "Migration not applied yet" };
    console.error("creator-api-creds: delete failed", error);
    return { ok: false, error: "Could not remove credentials" };
  }
  return { ok: true };
}

type CredsRow = { marketplaces: StoredMarketplaceCreds[] | null; updated_at: string | null };

async function loadRow(
  userId: string,
): Promise<{ row: CredsRow | null; migrationPending?: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_creator_api_creds")
    .select("marketplaces, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { row: null, migrationPending: true };
    console.error("creator-api-creds: load failed", error);
    return { row: null, error: "Could not load credentials" };
  }
  return { row: (data as CredsRow) ?? null };
}

export async function getStatus(
  userId: string,
): Promise<{ status: CredsStatus; migrationPending?: boolean; error?: string }> {
  const { row, migrationPending, error } = await loadRow(userId);
  if (migrationPending) return { status: { configured: false, marketplaces: [], updatedAt: null }, migrationPending };
  if (error) return { status: { configured: false, marketplaces: [], updatedAt: null }, error };
  const list = row?.marketplaces ?? [];
  return {
    status: {
      configured: list.length > 0,
      marketplaces: list.map((m) => m.host),
      updatedAt: row?.updated_at ?? null,
    },
  };
}

// Decrypts every stored marketplace into ready-to-sign PaapiCreds. Used only by
// the enrich route, server-side.
export async function loadDecryptedCreds(
  userId: string,
): Promise<{ creds: PaapiCreds[]; migrationPending?: boolean; error?: string }> {
  const { row, migrationPending, error } = await loadRow(userId);
  if (migrationPending) return { creds: [], migrationPending };
  if (error) return { creds: [], error };
  const list = row?.marketplaces ?? [];
  const creds: PaapiCreds[] = [];
  for (const entry of list) {
    try {
      creds.push({
        host: entry.host,
        partnerTag: entry.partnerTag,
        accessKeyId: entry.accessKeyId,
        secretKey: decryptSecret(entry),
      });
    } catch (err) {
      console.error("creator-api-creds: decrypt failed for", entry.host, err);
    }
  }
  return { creds };
}
