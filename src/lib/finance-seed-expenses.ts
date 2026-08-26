// One-time expense seed from the owner's "Influencer Butler Costs" Google
// Sheet (2026), imported by POST /api/admin/finance/expenses/seed. Idempotent:
// each row carries an external_ref unique key, so re-running the import never
// duplicates.
//
// The sheet's recorded amounts (only the filled cells; empty/0 months are
// omitted). "Supbase" in the sheet is the Supabase typo, normalized here.

import type { ScheduleCKey } from "@/lib/finance-expenses";

export type SeedExpense = {
  vendor: string;
  category: ScheduleCKey;
  amountCents: number;
  /** YYYY-MM-DD. */
  incurredOn: string;
};

export const SEED_EXPENSES: SeedExpense[] = [
  // July 2026
  { vendor: "Resend", category: "software_hosting", amountCents: 2000, incurredOn: "2026-07-01" },
  { vendor: "Vercel", category: "software_hosting", amountCents: 2149, incurredOn: "2026-07-01" },
  { vendor: "Microsoft Azure", category: "software_hosting", amountCents: 999, incurredOn: "2026-07-01" },
  // August 2026
  { vendor: "Resend", category: "software_hosting", amountCents: 2000, incurredOn: "2026-08-01" },
  { vendor: "Supabase", category: "software_hosting", amountCents: 2686, incurredOn: "2026-08-01" },
  { vendor: "Cloudflare Workers", category: "software_hosting", amountCents: 500, incurredOn: "2026-08-01" },
  { vendor: "Postal Box", category: "office_expense", amountCents: 2000, incurredOn: "2026-08-01" },

  // Tello phone plan renewals (from the Tello order history; the 2025-03-05
  // initial "Tello line + SIM card" order is omitted because its total was not
  // in the export - add it manually if wanted).
  { vendor: "Tello", category: "utilities", amountCents: 1448, incurredOn: "2025-04-04" },
  { vendor: "Tello", category: "utilities", amountCents: 1448, incurredOn: "2025-05-04" },
  { vendor: "Tello", category: "utilities", amountCents: 1448, incurredOn: "2025-06-03" },
  { vendor: "Tello", category: "utilities", amountCents: 1452, incurredOn: "2025-07-03" },
  { vendor: "Tello", category: "utilities", amountCents: 1452, incurredOn: "2025-08-02" },
  { vendor: "Tello", category: "utilities", amountCents: 1452, incurredOn: "2025-09-01" },
  { vendor: "Tello", category: "utilities", amountCents: 1453, incurredOn: "2025-10-01" },
  { vendor: "Tello", category: "utilities", amountCents: 1453, incurredOn: "2025-10-31" },
  { vendor: "Tello", category: "utilities", amountCents: 1453, incurredOn: "2025-11-30" },
  { vendor: "Tello", category: "utilities", amountCents: 1453, incurredOn: "2025-12-30" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-01-29" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-02-28" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-03-30" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-04-29" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-05-29" },
  { vendor: "Tello", category: "utilities", amountCents: 1455, incurredOn: "2026-06-28" },
  { vendor: "Tello", category: "utilities", amountCents: 1456, incurredOn: "2026-07-28" },
];

export type SeedRecurring = {
  vendor: string;
  category: ScheduleCKey;
  amountCents: number;
  /** First auto-generated month (after the last hand-recorded sheet month). */
  startsOn: string;
  /** Billing day of month (1-28); defaults to 1. */
  dayOfMonth?: number;
  note: string;
};

// Ongoing subscriptions, auto-continued monthly from September 2026 onward
// (the sheet's recorded months above stay as one-off rows so nothing double
// counts). Amounts are each vendor's latest recorded charge; cancel or edit
// any template from the Expenses tab.
export const SEED_RECURRING: SeedRecurring[] = [
  { vendor: "Resend", category: "software_hosting", amountCents: 2000, startsOn: "2026-09-01", note: "Seeded from cost sheet" },
  { vendor: "Supabase", category: "software_hosting", amountCents: 2686, startsOn: "2026-09-01", note: "Seeded from cost sheet" },
  { vendor: "Cloudflare Workers", category: "software_hosting", amountCents: 500, startsOn: "2026-09-01", note: "Seeded from cost sheet" },
  { vendor: "Vercel", category: "software_hosting", amountCents: 2149, startsOn: "2026-09-01", note: "Seeded from cost sheet (last seen July)" },
  { vendor: "Microsoft Azure", category: "software_hosting", amountCents: 999, startsOn: "2026-09-01", note: "Seeded from cost sheet (last seen July)" },
  { vendor: "Postal Box", category: "office_expense", amountCents: 2000, startsOn: "2026-09-01", note: "Seeded from cost sheet" },
  // Tello renews around the 28th; last recorded renewal 2026-07-28, so the
  // recurring template picks up from the 2026-08-28 renewal onward.
  { vendor: "Tello", category: "utilities", amountCents: 1456, startsOn: "2026-08-28", dayOfMonth: 28, note: "Phone plan (5 GB, unlimited min/text), seeded from Tello order history" },
  // Claude was not in the cost sheet (empty column) but is a real recurring
  // expense: from the Claude billing screen it settled at $214.90/mo on the
  // 24th since April 2026. Recurring from April captures the history and
  // projects forward; edit the amount if it changes.
  { vendor: "Claude", category: "software_hosting", amountCents: 21490, startsOn: "2026-04-01", dayOfMonth: 24, note: "Claude subscription (from Claude billing, ~$214.90/mo since April 2026); adjust if the amount changed" },
];

function slug(vendor: string): string {
  return vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function seedExpenseRef(e: SeedExpense): string {
  return `seed:${e.incurredOn}:${slug(e.vendor)}`;
}

export function seedRecurringRef(r: SeedRecurring): string {
  return `seed:recurring:${slug(r.vendor)}`;
}
