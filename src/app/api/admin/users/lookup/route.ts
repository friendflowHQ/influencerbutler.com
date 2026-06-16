import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LookupBody = { email?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Aggregates everything we know about a user by email: profile, subscriptions,
 * orders, license keys, affiliate status, and staff membership. Powers the
 * admin Users page so an operator can see the whole picture before acting.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("users.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Resolve the user via profiles, falling back to an auth.users scan.
  const { data: profile } = await svc
    .from("profiles")
    .select(
      "id,email,display_name,is_affiliate,ls_affiliate_id,affiliate_code,ls_customer_id",
    )
    .ilike("email", email)
    .maybeSingle();

  let userId = typeof profile?.id === "string" ? profile.id : null;
  if (!userId) {
    try {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      userId = match?.id ?? null;
    } catch {
      // fall through
    }
  }

  if (!userId) {
    return NextResponse.json({ found: false });
  }

  const [subsRes, ordersRes, licensesRes, staffRes] = await Promise.all([
    svc
      .from("subscriptions")
      .select("id,ls_subscription_id,status,plan_name,renews_at,ends_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    svc
      .from("orders")
      .select("ls_order_id,status,total,currency,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    svc
      .from("license_keys")
      .select("ls_license_key_id,key,status,activation_limit,subscription_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    svc.from("staff_members").select("role,permissions,is_active").eq("user_id", userId).maybeSingle(),
  ]);

  return NextResponse.json({
    found: true,
    userId,
    profile: profile ?? null,
    subscriptions: subsRes.data ?? [],
    orders: ordersRes.data ?? [],
    licenses: licensesRes.data ?? [],
    staff: (staffRes as { data?: unknown }).data ?? null,
  });
}
