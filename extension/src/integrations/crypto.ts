import type { EncryptedBlob } from "../storage/schema";

// At-rest encryption for third-party API credentials.
//
// Secrets are encrypted with AES-256-GCM. The wrapping key is a NON-extractable
// CryptoKey held in IndexedDB: its raw bytes never exist in JS, so a stray log,
// a storage dump, or another process reading chrome.storage.local cannot lift a
// usable secret out of it. This is defence in depth, not a guarantee: the
// extension must be able to decrypt to use the keys, so malware running as the
// user could still drive the same code path. The real protection is that the
// keys live only on this device and are sent only to the provider that issued
// them, never to influencerbutler.com.
//
// All of this runs in the background service worker, whose IndexedDB belongs to
// the extension origin. Content scripts run in the page's origin and cannot
// reach this store, so page scripts can never read the wrapping key.

const DB_NAME = "ib-integrations";
const STORE_NAME = "keys";
const KEY_ID = "credential-key";

let cachedKey: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error ?? new Error("indexedDB get failed"));
  });
}

function idbPut(db: IDBDatabase, id: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

// Get the wrapping key, generating and persisting a fresh non-extractable one
// the first time. Cached per worker lifetime so repeated saves are cheap.
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = (async () => {
    const db = await openDb();
    try {
      const existing = await idbGet(db, KEY_ID);
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // non-extractable: raw bytes are never exposed to JS
        ["encrypt", "decrypt"],
      );
      await idbPut(db, KEY_ID, key);
      return key;
    } finally {
      db.close();
    }
  })();
  return cachedKey;
}

// Pin the backing buffer to ArrayBuffer so WebCrypto's BufferSource params
// accept it under the current lib types (see the same helper in sigv4.ts).
function toBytes(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(s));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptSecret(plain: string): Promise<EncryptedBlob> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, toBytes(plain));
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function decryptSecret(blob: EncryptedBlob): Promise<string> {
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ct),
  );
  return new TextDecoder().decode(plain);
}

// Convenience wrappers: a provider's credential fields are stored as one
// encrypted JSON object so every field is covered by a single blob.
export async function encryptFields(fields: Record<string, string>): Promise<EncryptedBlob> {
  return encryptSecret(JSON.stringify(fields));
}

export async function decryptFields(blob: EncryptedBlob | null): Promise<Record<string, string>> {
  if (!blob) return {};
  try {
    const parsed = JSON.parse(await decryptSecret(blob)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    // A blob we cannot decrypt (key reset, corruption) is treated as empty so
    // the UI shows the provider as unconfigured rather than throwing.
    return {};
  }
}
