import { NextResponse } from "next/server";
import { resolveActor } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin/assistant identity for the client. The allowlist + staff permissions
 * are server-only, so the dashboard header and admin pages ask this route which
 * role the current session holds and which permission scopes it has, to decide
 * what to show.
 */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({
      isAdmin: false,
      isStaff: false,
      role: null,
      email: null,
      permissions: [],
    });
  }
  return NextResponse.json({
    isAdmin: actor.role === "admin",
    isStaff: true,
    role: actor.role,
    email: actor.email,
    permissions: Array.from(actor.permissions),
  });
}
