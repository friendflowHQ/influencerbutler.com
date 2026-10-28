/**
 * POST /api/licenses/keys-for-email
 *
 * Server-to-server endpoint for the desktop licensing Cloudflare Worker: the
 * license keys this site has on file for an account email (the same keys the
 * admin Users > Lookup page shows). Phone email sign-in uses it when Lemon
 * Squeezy has no active plan key under that email, which happens when a plan
 * was bought under another email but is linked to this account here.
 *
 * Auth: x-ib-worker-secret == LICENSING_WORKER_SECRET (same secret as
 * /api/licenses/inhouse-validate). Without it we reveal nothing.
 *
 * Returns { keys: [{ key, status }] } (revoked keys and rows without a stored
 * key are left out). The worker confirms each key's product with Lemon Squeezy
 * before trusting it.
 */
import { NextResponse } from "next/server";
import { adminService } from "@/lib/admin-service";
import { safeEqual } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ilike treats % and _ as wildcards; escape them so the match is exact.
function exactIlike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function POST(request: Request) {
  const secret = process.env.LICENSING_WORKER_SECRET;
  if (!secret) return NextResponse.json({ keys: [], error: "not_configured" }, { status: 503 });
  if (!safeEqual(request.headers.get("x-ib-worker-secret") || "", secret)) {
    return NextResponse.json({ keys: [], error: "unauthorized" }, { status: 401 });
  }

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    body = {};
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ keys: [], error: "email_required" }, { status: 400 });

  const svc = adminService();
  if (!svc) return NextResponse.json({ keys: [], error: "server_error" }, { status: 500 });

  const profile = (await svc.from("profiles").select("id").ilike("email", exactIlike(email)).maybeSingle()).data;
  const userId = typeof profile?.id === "string" ? profile.id : null;
  if (!userId) return NextResponse.json({ keys: [] });

  const rows =
    (
      await svc
        .from("license_keys")
        .select("key,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
    ).data ?? [];

  const keys = rows
    .map((r) => ({
      key: typeof r.key === "string" ? r.key.trim() : "",
      status: typeof r.status === "string" ? r.status.toLowerCase() : "",
    }))
    .filter((r) => r.key && r.status !== "revoked")
    .slice(0, MAX_KEYS);

  return NextResponse.json({ keys });
}
