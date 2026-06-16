import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { userId?: string; confirmEmail?: string };

/**
 * DESTRUCTIVE + IRREVERSIBLE. Deletes a user's auth account (profiles and other
 * FK-linked rows cascade). Requires the caller to echo the user's exact email as
 * a typed confirmation. Gated by users.delete and fully audited.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("users.delete", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const confirmEmail = (body.confirmEmail ?? "").trim().toLowerCase();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Confirm the typed email matches the account being deleted.
  const { data: userRes } = await svc.auth.admin.getUserById(userId);
  const actualEmail = (userRes?.user?.email ?? "").toLowerCase();
  if (!actualEmail) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (confirmEmail !== actualEmail) {
    return NextResponse.json(
      { error: "Confirmation email does not match the account." },
      { status: 409 },
    );
  }

  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) {
    console.error("users/delete failed", error);
    return NextResponse.json({ error: "Could not delete user." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "users.delete",
    targetType: "user",
    targetId: userId,
    details: { email: actualEmail },
  });

  return NextResponse.json({ ok: true });
}
