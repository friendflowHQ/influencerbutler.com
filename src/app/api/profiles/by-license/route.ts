/**
 * /api/profiles/by-license - bearer-gated batch lookup used by the
 * feedback Worker to enrich community Q&A authors with display name +
 * username + avatar. Uses the service-role Supabase client so RLS
 * doesn't hide profiles from anonymous callers.
 *
 * Auth: `Authorization: Bearer <FEEDBACK_LOOKUP_SECRET>`.
 * Body: { hashes: string[] }    // SHA-256 hex of the license key
 * Resp: { ok: true, profiles: { [hash]: { display_name, username, avatar_url } | null } }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH_RE = /^[a-f0-9]{64}$/i;
const MAX_HASHES = 100;

type LookupRow = {
  key_hash: string;
  user_id: string;
  profiles:
    | { display_name?: string | null; username?: string | null; avatar_url?: string | null }
    | { display_name?: string | null; username?: string | null; avatar_url?: string | null }[]
    | null;
};

type ProfilePayload = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export async function POST(request: Request) {
  const expected = process.env.FEEDBACK_LOOKUP_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Lookup endpoint not configured" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m || m[1] !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const rawHashes = (payload as { hashes?: unknown })?.hashes;
  if (!Array.isArray(rawHashes)) {
    return NextResponse.json({ ok: false, error: "Missing hashes array" }, { status: 400 });
  }

  const validHashes = Array.from(
    new Set(
      rawHashes
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.toLowerCase())
        .filter((h) => HASH_RE.test(h)),
    ),
  );
  if (validHashes.length === 0) {
    return NextResponse.json({ ok: true, profiles: {} });
  }
  if (validHashes.length > MAX_HASHES) {
    return NextResponse.json(
      { ok: false, error: `Max ${MAX_HASHES} hashes per request` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Service role client unavailable" },
      { status: 503 },
    );
  }

  type ServiceClient = {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, values: string[]) => Promise<{
          data: LookupRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await (admin as unknown as ServiceClient)
    .from("license_keys")
    .select("key_hash, user_id, profiles!inner(display_name, username, avatar_url)")
    .in("key_hash", validHashes);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Lookup failed" },
      { status: 500 },
    );
  }

  const out: Record<string, ProfilePayload | null> = {};
  for (const hash of validHashes) out[hash] = null;

  for (const row of data || []) {
    if (!row?.key_hash) continue;
    const profileNode = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profileNode) continue;
    const display_name = profileNode.display_name ?? null;
    const username = profileNode.username ?? null;
    const avatar_url = profileNode.avatar_url ?? null;
    if (!display_name && !username && !avatar_url) continue;
    out[row.key_hash.toLowerCase()] = { display_name, username, avatar_url };
  }

  return NextResponse.json({ ok: true, profiles: out });
}
