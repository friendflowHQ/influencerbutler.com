import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMP_PLACEHOLDER_DOMAIN } from "@/lib/comp-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audience-export  (super-admin only)
 *
 * Returns a CSV seed for a Meta Custom Audience (upload it in Ads Manager, then
 * build a Lookalike). Combines the harvested Instagram Goldmine creators (the
 * exact Amazon-creator ICP) with real customer/trialer emails. Plain emails,
 * one per line under an `email` header - Meta hashes them on upload.
 *
 * This is the legitimate, high-leverage use of the harvested list: a lookalike
 * seed, not an inbox blast. No email is ever sent from here.
 */

const PAGE = 1000;
const MAX_PAGES = 60; // up to ~60k rows per source
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Admin = ReturnType<typeof createAdminClient>;

async function collectEmails(
  admin: Admin,
  table: string,
  into: Set<string>,
): Promise<void> {
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await admin
      .from(table)
      .select("email")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`audience-export: ${table} read failed`, error);
      return;
    }
    const rows = (data ?? []) as { email?: string | null }[];
    for (const row of rows) {
      const email = (row.email ?? "").trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) continue;
      if (email.endsWith(`@${COMP_PLACEHOLDER_DOMAIN}`)) continue; // comp placeholders
      into.add(email);
    }
    if (rows.length < PAGE) return;
  }
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const emails = new Set<string>();

  // Harvested Amazon/IG creators (the ICP) + real customers/trialers.
  await collectEmails(admin, "extension_instagram_creators", emails);
  await collectEmails(admin, "profiles", emails);

  const body = ["email", ...emails].join("\n") + "\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audience-seed.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
