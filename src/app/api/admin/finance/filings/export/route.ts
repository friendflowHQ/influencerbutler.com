// GET /api/admin/finance/filings/export?year=&format=provider|iris|foreign
//
// provider/iris decrypt every needed TIN into the downloaded CSV, so they carry
// the strongest gate in the app: finance.manage step-up AND super-admin
// (getAdminSession), the encryption key configured, and the payer EIN set. Any
// TIN decrypt failure fails the whole export closed (no partial CSV). The
// foreign format needs no decryption. Every export is audited (userIds only,
// never TIN values).

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { taxKeyConfigured, decryptTin } from "@/lib/tax-crypto";
import {
  load1099Data,
  build1099ProviderCsv,
  build1099IrisCsv,
  buildForeignRecordsCsv,
  type Payee1099,
} from "@/lib/finance-1099";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveYear(url: URL): number {
  const current = new Date().getUTCFullYear();
  const y = Number(url.searchParams.get("year"));
  if (Number.isInteger(y) && y >= 2020 && y <= current + 1) return y;
  return current - 1;
}

function csv(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "provider";
  const year = resolveYear(url);
  const today = new Date().toISOString().slice(0, 10);

  // Foreign records: no TIN decryption, view permission is enough.
  if (format === "foreign") {
    const gate = await requireFinance("finance.view", request);
    if (!gate.ok) return gate.response;
    const db = createAdminClient();
    const data = await load1099Data(db, year, today);
    if ("queryFailed" in data) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    await logAdminAction({
      actor: gate.actor,
      action: "finance.1099.export",
      targetType: "year",
      targetId: String(year),
      details: { format: "foreign", count: data.foreign.length },
    });
    return csv(buildForeignRecordsCsv(data.foreign), `1099-foreign-records-${year}.csv`);
  }

  if (format !== "provider" && format !== "iris") {
    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }

  // Bulk TIN export: manage step-up + super-admin, both required.
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;
  const superAdmin = await getAdminSession();
  if (!superAdmin) {
    return NextResponse.json({ error: "Super-admin only" }, { status: 403 });
  }
  if (!taxKeyConfigured()) {
    return NextResponse.json(
      { error: "TAX_FORM_ENCRYPTION_KEY is not configured" },
      { status: 503 },
    );
  }

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  if (settings.payerEin.length !== 9) {
    return NextResponse.json(
      { error: "Set the payer EIN in Settings before exporting." },
      { status: 400 },
    );
  }

  const data = await load1099Data(db, year, today);
  if ("queryFailed" in data) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const exportRows: Payee1099[] = data.us.filter((r) => r.exportEligible);
  if (exportRows.length === 0) {
    return NextResponse.json(
      { error: "No reportable, verified US affiliates to export for this year." },
      { status: 400 },
    );
  }

  // Decrypt every needed TIN. Fail closed on any missing row or bad auth tag.
  const exportUserIds = exportRows.map((r) => r.userId);
  const { data: tinRows, error: tinErr } = await db
    .from("affiliate_tax_tins")
    .select("user_id,tin_ciphertext,tin_iv,tin_tag")
    .in("user_id", exportUserIds);
  if (tinErr) {
    console.error("finance 1099 export: tins query failed", tinErr);
    return NextResponse.json({ error: "TIN lookup failed" }, { status: 500 });
  }
  const tinByUser = new Map<string, string>();
  const failedUserIds: string[] = [];
  const encByUser = new Map<string, { ciphertext: string; iv: string; tag: string }>();
  for (const t of (tinRows ?? []) as Record<string, unknown>[]) {
    const uid = typeof t.user_id === "string" ? t.user_id : "";
    if (!uid) continue;
    encByUser.set(uid, {
      ciphertext: String(t.tin_ciphertext ?? ""),
      iv: String(t.tin_iv ?? ""),
      tag: String(t.tin_tag ?? ""),
    });
  }
  for (const uid of exportUserIds) {
    const enc = encByUser.get(uid);
    if (!enc || !enc.ciphertext || !enc.iv || !enc.tag) {
      failedUserIds.push(uid);
      continue;
    }
    try {
      tinByUser.set(uid, decryptTin(enc));
    } catch {
      failedUserIds.push(uid);
    }
  }
  if (failedUserIds.length > 0) {
    return NextResponse.json(
      {
        error:
          "Could not decrypt a TIN for every recipient. A verified W-9 should always have a TIN on file. No file was produced.",
        failedUserIds,
      },
      { status: 500 },
    );
  }

  const body =
    format === "iris"
      ? build1099IrisCsv(exportRows, tinByUser)
      : build1099ProviderCsv(exportRows, settings, tinByUser);

  await logAdminAction({
    actor: gate.actor,
    action: "finance.1099.export",
    targetType: "year",
    targetId: String(year),
    details: {
      format,
      count: exportRows.length,
      totalCents: exportRows.reduce((s, r) => s + r.totalCents, 0),
      userIds: exportUserIds,
    },
  });

  // Best-effort: mark exported, without downgrading a filed/corrected/exempt row.
  try {
    const { data: existing } = await db
      .from("affiliate_tax_filings")
      .select("user_id,status")
      .eq("tax_year", year)
      .in("user_id", exportUserIds);
    const statusByUser = new Map<string, string>();
    for (const e of (existing ?? []) as Record<string, unknown>[]) {
      if (typeof e.user_id === "string") statusByUser.set(e.user_id, String(e.status));
    }
    const now = new Date().toISOString();
    const toMark = exportRows
      .filter((r) => {
        const s = statusByUser.get(r.userId);
        return s === undefined || s === "draft";
      })
      .map((r) => ({
        user_id: r.userId,
        tax_year: year,
        status: "exported",
        amount_cents: r.totalCents,
        created_by: gate.actor.userId,
        updated_at: now,
      }));
    if (toMark.length > 0) {
      await db.from("affiliate_tax_filings").upsert(toMark, { onConflict: "user_id,tax_year" });
    }
  } catch (error) {
    if (!isMigrationPendingError(error)) {
      console.error("finance 1099 export: mark-exported failed", error);
    }
  }

  return csv(body, `1099-nec-${format}-${year}.csv`);
}
