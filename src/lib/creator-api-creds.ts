/**
 * creator-api-creds.ts - the at-rest vault for a user's Amazon Creator API
 * credentials, used by /api/extension/creator-api (write/status) and
 * /api/extension/enrich (read + authorize).
 *
 * These are OAuth2 Creator API credentials (the same the desktop app uses): a
 * Credential ID (an amzn1.application-oa2-client... value) plus a Credential
 * Secret, a Credential Version, and an Associates partner tag, per marketplace.
 *
 * Security posture: the Credential Secret is the sensitive field. It is
 * encrypted with AES-256-GCM before it touches the database, using a key derived
 * from CREATOR_API_ENC_KEY (a Vercel env secret, never in git or the DB). A
 * database-only breach therefore yields ciphertext, not usable secrets. The
 * secret is write-only over the API: it is decrypted only server-side to mint a
 * Creators API token and is never returned to any client.
 *
 * Reads/writes go through createAdminClient(): extension_creator_api_creds is
 * RLS-enabled with zero policies (see the creator_api migrations).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { marketplaceInfo, type CreatorsCreds } from "@/lib/creators-api";

// One marketplace's credentials as stored in the marketplaces JSONB array. The
// secret is split into ciphertext + iv + authTag (all base64) for AES-256-GCM.
export type StoredMarketplaceCreds = {
  host: string;
  partnerTag: string;
  credentialId: string;
  credentialVersion: string;
  secretCipher: string;
  iv: string;
  authTag: string;
};

// The shape a client (extension) posts. credentialSecret is plaintext over
// HTTPS and is immediately encrypted; it is never persisted in the clear.
export type IncomingMarketplaceCreds = {
  host: string;
  partnerTag: string;
  credentialId: string;
  credentialSecret: string;
  credentialVersion: string;
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

// Accepts a plain "3.2" style version; falls back to the marketplace's default
// region version when blank or malformed.
function normalizeVersion(raw: unknown, host: string): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (/^\d+(\.\d+)?$/.test(v)) return v;
  return marketplaceInfo(host)?.credentialVersion ?? "3.2";
}

// Validates and normalizes an incoming marketplace entry. Returns null if any
// field is missing/invalid or the marketplace is unsupported.
export function validateIncoming(raw: unknown): IncomingMarketplaceCreds | null {
  const e = raw as Record<string, unknown>;
  const host = typeof e?.host === "string" ? e.host.trim().toLowerCase() : "";
  const partnerTag = typeof e?.partnerTag === "string" ? e.partnerTag.trim() : "";
  const credentialId = typeof e?.credentialId === "string" ? e.credentialId.trim() : "";
  const credentialSecret = typeof e?.credentialSecret === "string" ? e.credentialSecret.trim() : "";
  if (!marketplaceInfo(host)) return null;
  if (partnerTag.length < 2 || partnerTag.length > 80) return null;
  // A Creator API Credential ID is an amzn1.application-oa2-client... value.
  if (credentialId.length < 8 || credentialId.length > 256) return null;
  if (credentialSecret.length < 8 || credentialSecret.length > 512) return null;
  return { host, partnerTag, credentialId, credentialSecret, credentialVersion: normalizeVersion(e?.credentialVersion, host) };
}

export type SaveResult = { ok: true } | { ok: false; migrationPending?: boolean; error: string };

export async function saveCreds(userId: string, incoming: IncomingMarketplaceCreds[]): Promise<SaveResult> {
  if (!encryptionAvailable()) return { ok: false, error: "Server encryption key not configured" };
  const now = new Date().toISOString();
  const stored: StoredMarketplaceCreds[] = incoming.map((c) => {
    const { secretCipher, iv, authTag } = encryptSecret(c.credentialSecret);
    return {
      host: c.host,
      partnerTag: c.partnerTag,
      credentialId: c.credentialId,
      credentialVersion: c.credentialVersion,
      secretCipher,
      iv,
      authTag,
    };
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

/* ----------------------------- backup credentials ---------------------------- */

// The leased house credentials as stored in the `backup` JSONB column. The
// secret is encrypted the same way as a user's own.
export type StoredBackup = {
  enabled: boolean;
  credentialId: string;
  credentialVersion: string;
  partnerTag: string;
  marketplace: string;
  secretCipher: string;
  iv: string;
  authTag: string;
  expiresAt: number;
};

export type BackupStatus = { enabled: boolean; active: boolean; expiresAt: number | null };

export type LeasedBackupInput = {
  clientId: string;
  clientSecret: string;
  credentialVersion: string;
  partnerTag: string;
  marketplace: string;
  expiresAt: number;
};

async function loadBackupRow(
  userId: string,
): Promise<{ backup: StoredBackup | null; migrationPending?: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_creator_api_creds")
    .select("backup")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { backup: null, migrationPending: true };
    console.error("creator-api-creds: load backup failed", error);
    return { backup: null, error: "Could not load backup state" };
  }
  return { backup: ((data as { backup?: StoredBackup | null })?.backup ?? null) as StoredBackup | null };
}

export async function saveBackup(userId: string, leased: LeasedBackupInput): Promise<SaveResult> {
  if (!encryptionAvailable()) return { ok: false, error: "Server encryption key not configured" };
  const { secretCipher, iv, authTag } = encryptSecret(leased.clientSecret);
  const backup: StoredBackup = {
    enabled: true,
    credentialId: leased.clientId,
    credentialVersion: leased.credentialVersion,
    partnerTag: leased.partnerTag,
    marketplace: leased.marketplace,
    secretCipher,
    iv,
    authTag,
    expiresAt: leased.expiresAt,
  };
  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_creator_api_creds")
    .upsert({ user_id: userId, backup, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    if (isMissingTableError(error)) return { ok: false, migrationPending: true, error: "Migration not applied yet" };
    console.error("creator-api-creds: save backup failed", error);
    return { ok: false, error: "Could not save backup state" };
  }
  return { ok: true };
}

export async function clearBackup(userId: string): Promise<SaveResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_creator_api_creds")
    .update({ backup: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    if (isMissingTableError(error)) return { ok: false, migrationPending: true, error: "Migration not applied yet" };
    console.error("creator-api-creds: clear backup failed", error);
    return { ok: false, error: "Could not clear backup state" };
  }
  return { ok: true };
}

export async function getBackupStatus(
  userId: string,
): Promise<{ status: BackupStatus; migrationPending?: boolean; error?: string }> {
  const { backup, migrationPending, error } = await loadBackupRow(userId);
  if (migrationPending) return { status: { enabled: false, active: false, expiresAt: null }, migrationPending };
  if (error) return { status: { enabled: false, active: false, expiresAt: null }, error };
  const enabled = backup?.enabled === true;
  const active = enabled && typeof backup?.expiresAt === "number" && backup.expiresAt > Date.now();
  return { status: { enabled, active, expiresAt: backup?.expiresAt ?? null } };
}

// The active backup as ready-to-use CreatorsCreds for a given marketplace host,
// or null when there is no live lease. The host must fall in the same region
// group as the leased marketplace (house NA credentials cannot mint an EU
// token), otherwise null.
export async function loadBackupCredsFor(userId: string, host: string): Promise<CreatorsCreds | null> {
  const { backup } = await loadBackupRow(userId);
  if (!backup?.enabled || !(backup.expiresAt > Date.now())) return null;
  const backupHost = backup.marketplace.replace(/^www\./, "");
  const target = marketplaceInfo(host);
  const source = marketplaceInfo(backupHost);
  if (!target || !source || target.group !== source.group) return null;
  try {
    return {
      host,
      partnerTag: backup.partnerTag,
      credentialId: backup.credentialId,
      credentialSecret: decryptSecret(backup),
      credentialVersion: backup.credentialVersion || target.credentialVersion,
    };
  } catch (err) {
    console.error("creator-api-creds: backup decrypt failed", err);
    return null;
  }
}

// Decrypts every stored marketplace into ready-to-use CreatorsCreds. Used only
// by the enrich route, server-side.
export async function loadDecryptedCreds(
  userId: string,
): Promise<{ creds: CreatorsCreds[]; migrationPending?: boolean; error?: string }> {
  const { row, migrationPending, error } = await loadRow(userId);
  if (migrationPending) return { creds: [], migrationPending };
  if (error) return { creds: [], error };
  const list = row?.marketplaces ?? [];
  const creds: CreatorsCreds[] = [];
  for (const entry of list) {
    try {
      creds.push({
        host: entry.host,
        partnerTag: entry.partnerTag,
        credentialId: entry.credentialId,
        credentialSecret: decryptSecret(entry),
        credentialVersion: entry.credentialVersion || marketplaceInfo(entry.host)?.credentialVersion || "3.2",
      });
    } catch (err) {
      console.error("creator-api-creds: decrypt failed for", entry.host, err);
    }
  }
  return { creds };
}
