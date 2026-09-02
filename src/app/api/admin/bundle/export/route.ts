/**
 * GET /api/admin/bundle/export?list=readers|contributors|submissions
 *
 * Downloads bundle data. Gated on marketing.send.
 *
 *   list=readers      -> CSV: everyone who downloaded the finished PDF
 *                        (email_subscribers where source = the reader source).
 *                        This is the shared list handed to contributors after
 *                        launch, which the reader download form discloses.
 *   list=contributors -> CSV: the contributor roster (name, email, topic, status).
 *   list=submissions  -> JSON: every submitted chapter, structured, so Cowork can
 *                        assemble the PDF from docs/grow-together-bundle-template.html.
 *
 * Reader emails are only ever exposed through this admin-gated route, never on a
 * public endpoint. Suppressed (unsubscribed) addresses are excluded from the
 * reader export so the shared list respects opt-outs.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLE_SLUG, READER_SOURCE } from "@/app/grow-together/_data/bundleMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

/** RFC 4180 CSV cell: quote and escape when needed. */
function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const r of rows) lines.push(r.map(cell).join(","));
  return lines.join("\r\n");
}

function attachment(name: string, body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const actor = await requirePermission("marketing.send", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const listParam = new URL(request.url).searchParams.get("list");
  const list =
    listParam === "contributors" ? "contributors" : listParam === "submissions" ? "submissions" : "readers";

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (list === "submissions") {
    // Structured JSON of every submitted chapter, for assembling the PDF.
    try {
      const { data, error } = await db
        .from("bundle_contributors")
        .select(
          "name, email, instagram_handle, website, other_socials, topic, chapter_title, headshot_url, handles_to_include, intro_earn, intro_inspired, intro_love, chapter_body, conclude_question, conclude_answer, cta_text, status, submitted_at",
        )
        .eq("bundle_slug", BUNDLE_SLUG)
        .in("status", ["submitted", "scheduled", "done"])
        .order("submitted_at", { ascending: true });
      if (error) {
        if (isMissingTable(error)) return attachment("grow-together-submissions.json", "[]");
        console.error("admin bundle export: submissions read failed", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const body = JSON.stringify(data ?? [], null, 2);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="grow-together-submissions.json"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      console.error("admin bundle export: submissions threw", err);
      return NextResponse.json({ error: "Export failed." }, { status: 500 });
    }
  }

  if (list === "contributors") {
    try {
      const { data, error } = await db
        .from("bundle_contributors")
        .select("name, email, instagram_handle, website, topic, chapter_title, status, promo_committed, created_at")
        .eq("bundle_slug", BUNDLE_SLUG)
        .order("created_at", { ascending: true });
      if (error) {
        if (isMissingTable(error)) return attachment("grow-together-contributors.csv", csv(["name"], []));
        console.error("admin bundle export: contributors read failed", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const rows = (data ?? []).map((r) => [
        r.name, r.email, r.instagram_handle, r.website, r.topic, r.chapter_title, r.status,
        r.promo_committed ? "yes" : "no", r.created_at,
      ]);
      return attachment(
        "grow-together-contributors.csv",
        csv(["name", "email", "instagram", "website", "topic", "chapter_title", "status", "promo_committed", "applied_at"], rows),
      );
    } catch (err) {
      console.error("admin bundle export: contributors threw", err);
      return NextResponse.json({ error: "Export failed." }, { status: 500 });
    }
  }

  // Readers: everyone who downloaded, minus unsubscribes.
  try {
    const { data, error } = await db
      .from("email_subscribers")
      .select("email, created_at, unsubscribed_at")
      .eq("source", READER_SOURCE)
      .order("created_at", { ascending: true });
    if (error) {
      if (isMissingTable(error)) return attachment("grow-together-readers.csv", csv(["email"], []));
      console.error("admin bundle export: readers read failed", error);
      return NextResponse.json({ error: "Export failed." }, { status: 500 });
    }
    const rows = (data ?? [])
      .filter((r) => !r.unsubscribed_at)
      .map((r) => [r.email, r.created_at]);
    return attachment("grow-together-readers.csv", csv(["email", "downloaded_at"], rows));
  } catch (err) {
    console.error("admin bundle export: readers threw", err);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
