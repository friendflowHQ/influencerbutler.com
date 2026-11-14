import { createHash } from "crypto";
import { createAdminClient } from "@/lib/admin";

export type Principal = {
  userId: string;
  email: string | null;
  source: "api-key" | "session" | "license";
};

const BEARER_RE = /^Bearer\s+(.+)$/i;
const PAT_RE = /^ib_pat_[A-Za-z0-9_-]{16,}$/;

function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

type ApiKeyRow = {
  id: string;
  user_id: string;
  revoked_at: string | null;
  expires_at: string | null;
};

type ProfileRow = {
  email?: string | null;
};

/**
 * Resolve the calling principal from an MCP HTTP request.
 *
 * Priority order:
 *   1. Bearer API key (ib_pat_...) - looked up by sha256 hash in mcp_api_keys
 *   2. Anonymous (returns null) - caller decides whether the tool needs auth
 *
 * Cookie/session-based auth is intentionally NOT supported here: MCP clients
 * (Claude Desktop, etc.) talk to the server directly without browser cookies.
 */
export async function resolvePrincipal(req: Request): Promise<Principal | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;

  const match = auth.match(BEARER_RE);
  if (!match) return null;
  const token = match[1].trim();
  if (!PAT_RE.test(token)) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const keyHash = hashKey(token);
  let keyRow: ApiKeyRow | null = null;
  try {
    const { data } = await (admin as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            maybeSingle: () => Promise<{ data: ApiKeyRow | null; error: unknown }>;
          };
        };
      };
    })
      .from("mcp_api_keys")
      .select("id, user_id, revoked_at, expires_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    keyRow = data;
  } catch (error) {
    console.error("mcp/auth: api key lookup failed", error);
    return null;
  }

  if (!keyRow || keyRow.revoked_at) return null;
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) return null;

  // Best-effort "last used" stamp. Awaited (this route runs on the nodejs
  // runtime, not edge) but never allowed to fail the auth check itself.
  try {
    await (admin as unknown as {
      from: (table: string) => {
        update: (p: Record<string, unknown>) => {
          eq: (col: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("mcp_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);
  } catch (error) {
    console.error("mcp/auth: last_used_at stamp failed", error);
  }

  let email: string | null = null;
  try {
    const { data } = await (admin as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            maybeSingle: () => Promise<{ data: ProfileRow | null; error: unknown }>;
          };
        };
      };
    })
      .from("profiles")
      .select("email")
      .eq("id", keyRow.user_id)
      .maybeSingle();
    email = data?.email ?? null;
  } catch (error) {
    console.error("mcp/auth: profile lookup failed", error);
  }

  return { userId: keyRow.user_id, email, source: "api-key" };
}

export function hashApiKey(plain: string): string {
  return hashKey(plain);
}
