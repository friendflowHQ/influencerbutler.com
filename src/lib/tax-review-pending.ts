// Pending affiliate tax forms (status 'submitted' = waiting on admin review).
//
// Shared by the admin-tax-pending API route (the dashboard Tasks card and the
// per-affiliate review bar) and the month-end tax-review-reminder cron, so both
// surfaces list exactly the same rows.

import { createAdminClient } from "@/lib/admin";

export type PendingTaxForm = {
  userId: string;
  name: string | null;
  email: string | null;
  formType: string | null;
  legalName: string | null;
  country: string | null;
  /** Mailing address as one display line (needed on the 1099-NEC), or null if the affiliate skipped it. */
  address: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  submittedAt: string | null;
};

type PendingClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      in: (col: string, values: string[]) => Promise<{ data: Record<string, unknown>[] | null }>;
    };
  };
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** All tax forms awaiting review, joined with the affiliate's name and email, oldest first. */
export async function loadPendingTaxForms(): Promise<PendingTaxForm[]> {
  const db = createAdminClient() as unknown as PendingClient | null;
  if (!db) return [];
  try {
    const { data: forms, error } = await db
      .from("affiliate_tax_forms")
      .select(
        "user_id,form_type,legal_name,country,address_line1,address_line2,city,region,postal_code,tin_last4,tin_kind,submitted_at",
      )
      .eq("status", "submitted");
    if (error) {
      console.error("loadPendingTaxForms: forms query failed", error);
      return [];
    }

    const rows: PendingTaxForm[] = [];
    for (const row of forms ?? []) {
      const userId = str(row.user_id);
      if (!userId) continue;
      const address = [
        [str(row.address_line1), str(row.address_line2)].filter(Boolean).join(" "),
        str(row.city),
        [str(row.region), str(row.postal_code)].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ");
      rows.push({
        userId,
        name: null,
        email: null,
        formType: str(row.form_type),
        legalName: str(row.legal_name),
        country: str(row.country),
        address: address.length > 0 ? address : null,
        tinLast4: str(row.tin_last4),
        tinKind: str(row.tin_kind),
        submittedAt: str(row.submitted_at),
      });
    }
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.userId);
    const { data: apps } = await db
      .from("affiliate_applications")
      .select("user_id,full_name,email")
      .in("user_id", ids);
    const appByUser = new Map<string, { name: string | null; email: string | null }>();
    for (const row of apps ?? []) {
      const uid = str(row.user_id);
      if (uid) appByUser.set(uid, { name: str(row.full_name), email: str(row.email) });
    }

    const { data: profs } = await db.from("profiles").select("id,email").in("id", ids);
    const profileEmail = new Map<string, string | null>();
    for (const row of profs ?? []) {
      const uid = str(row.id);
      if (uid) profileEmail.set(uid, str(row.email));
    }

    for (const r of rows) {
      const app = appByUser.get(r.userId);
      r.name = app?.name ?? null;
      r.email = app?.email ?? profileEmail.get(r.userId) ?? null;
    }

    // Oldest submission first: the longest-waiting affiliate is the top task.
    rows.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    return rows;
  } catch (error) {
    console.error("loadPendingTaxForms failed", error);
    return [];
  }
}
