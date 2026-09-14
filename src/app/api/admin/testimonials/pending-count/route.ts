/**
 * GET /api/admin/testimonials/pending-count
 *
 * Lightweight count of testimonials awaiting review (status = 'pending'), used
 * to render the badge on the admin sidebar's Testimonials link. Gated by the
 * testimonials.moderate permission; returns { count: 0 } rather than erroring
 * when the caller lacks it, so the Sidebar can fetch unconditionally for staff.
 * Best-effort: a query failure returns 0, never a 500.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountClient = {
  from: (table: string) => {
    select: (
      cols: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (
        col: string,
        value: string,
      ) => Promise<{ count: number | null; error: { message?: string } | null }>;
    };
  };
};

export async function GET(request: Request) {
  const actor = await requirePermission("testimonials.moderate", request);
  if (!actor) return NextResponse.json({ count: 0 });

  try {
    const admin = createAdminClient() as unknown as CountClient | null;
    if (!admin) return NextResponse.json({ count: 0 });
    const { count, error } = await admin
      .from("testimonials")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) {
      console.error("testimonials pending-count: query failed", error);
      return NextResponse.json({ count: 0 });
    }
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error("testimonials pending-count: threw", err);
    return NextResponse.json({ count: 0 });
  }
}
