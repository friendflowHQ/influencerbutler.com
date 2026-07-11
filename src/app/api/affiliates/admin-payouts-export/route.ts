import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Xero-ready CSV of successful affiliate payouts, for bookkeeping. Columns match
 * Xero's Bills (Purchases) import template. Gated on affiliates.tax.view because
 * it exposes affiliates' legal names; every export is audited.
 *
 * Query: ?period=YYYY-MM (one month) or ?year=YYYY (calendar year). Omit for all.
 */

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rangeFromQuery(url: URL): { start?: string; end?: string; label: string } {
  const period = url.searchParams.get("period");
  const year = url.searchParams.get("year");
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();
    return { start, end, label: period };
  }
  if (year && /^\d{4}$/.test(year)) {
    const y = Number(year);
    return {
      start: new Date(Date.UTC(y, 0, 1)).toISOString(),
      end: new Date(Date.UTC(y + 1, 0, 1)).toISOString(),
      label: year,
    };
  }
  return { label: "all" };
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const { start, end, label } = rangeFromQuery(url);
  const admin = createAdminClient();

  let query = admin
    .from("affiliate_payouts")
    .select("id,user_id,period,gross_cents,currency,paypal_email,paid_at")
    .eq("status", "success");
  if (start) query = query.gte("paid_at", start);
  if (end) query = query.lt("paid_at", end);

  const { data: payouts, error } = await query;
  if (error) {
    console.error("admin-payouts-export: query failed", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Legal names from tax forms (fall back to PayPal email for the contact name).
  const userIds = Array.from(new Set((payouts ?? []).map((p) => p.user_id as string)));
  const nameByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: forms } = await admin
      .from("affiliate_tax_forms")
      .select("user_id,legal_name")
      .in("user_id", userIds);
    for (const f of forms ?? []) {
      if (f.legal_name) nameByUser.set(f.user_id as string, f.legal_name as string);
    }
  }

  const accountCode = process.env.AFFILIATE_XERO_ACCOUNT_CODE ?? "";
  const header = [
    "*ContactName",
    "EmailAddress",
    "*InvoiceNumber",
    "*InvoiceDate",
    "*DueDate",
    "Description",
    "*Quantity",
    "*UnitAmount",
    "*AccountCode",
    "*TaxType",
    "Currency",
  ];
  const rows: string[] = [header.join(",")];

  for (const p of payouts ?? []) {
    const paidDate = (p.paid_at as string | null)?.slice(0, 10) ?? "";
    const contact = nameByUser.get(p.user_id as string) ?? (p.paypal_email as string | null) ?? p.user_id;
    const amount = ((p.gross_cents as number) / 100).toFixed(2);
    const desc = `Affiliate commission${p.period ? ` ${p.period}` : ""}`;
    rows.push(
      [
        csvField(contact),
        csvField(p.paypal_email as string | null),
        csvField(p.id as string),
        csvField(paidDate),
        csvField(paidDate),
        csvField(desc),
        csvField(1),
        csvField(amount),
        csvField(accountCode),
        csvField("Tax Exempt"),
        csvField((p.currency as string | null) ?? "USD"),
      ].join(","),
    );
  }

  await logAdminAction({
    actor,
    action: "affiliate.payouts.export",
    targetType: "range",
    targetId: label,
    details: { count: payouts?.length ?? 0 },
  });

  return new Response(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="affiliate-payouts-${label}.csv"`,
    },
  });
}
