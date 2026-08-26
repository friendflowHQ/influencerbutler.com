// Quarterly estimated income tax planning for the Finance dashboard.
//
// IMPORTANT context baked into the UI copy: Lemon Squeezy is our merchant of
// record, so sales tax / VAT on every sale is collected and remitted by LS.
// The LLC owes INCOME tax only: federal income tax (+ self-employment tax in
// passthrough mode) and Utah's flat individual income tax, paid via quarterly
// estimated payments. All of this is simplified planning math with
// configurable rates: no QBI deduction, no standard deduction, no brackets.
// It is a set-aside planner, not tax advice.
//
// Pure functions only, so the math is unit-testable.

import type { FinanceSettings } from "@/lib/finance-settings";

export const MOR_EDUCATION =
  "Lemon Squeezy is the merchant of record: sales tax and VAT are collected and remitted by Lemon Squeezy on every sale, so the LLC does not file sales tax returns for them. What the LLC owes is income tax on its profit, paid through quarterly estimated payments. The numbers below are planning estimates with adjustable rates, not tax advice: confirm the rates and your entity election with a CPA.";

/** IRS estimated-tax periods. Note Q2 is 2 months and Q4 spans 4. */
export type TaxQuarter = {
  quarter: 1 | 2 | 3 | 4;
  /** Income period start, YYYY-MM-DD. */
  periodStart: string;
  /** Income period end (inclusive), YYYY-MM-DD. */
  periodEnd: string;
  /** Payment due date, YYYY-MM-DD (Q4 is due in January of the next year). */
  dueDate: string;
};

export function taxQuartersForYear(year: number): TaxQuarter[] {
  return [
    { quarter: 1, periodStart: `${year}-01-01`, periodEnd: `${year}-03-31`, dueDate: `${year}-04-15` },
    { quarter: 2, periodStart: `${year}-04-01`, periodEnd: `${year}-05-31`, dueDate: `${year}-06-15` },
    { quarter: 3, periodStart: `${year}-06-01`, periodEnd: `${year}-08-31`, dueDate: `${year}-09-15` },
    { quarter: 4, periodStart: `${year}-09-01`, periodEnd: `${year}-12-31`, dueDate: `${year + 1}-01-15` },
  ];
}

/** The next quarterly deadline on/after `today` (YYYY-MM-DD). */
export function nextDeadline(today: string): { quarter: TaxQuarter; year: number } {
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year]) {
    for (const q of taxQuartersForYear(y)) {
      if (q.dueDate >= today) return { quarter: q, year: y };
    }
  }
  // Unreachable in practice (Q4 of `year` is always due next January).
  return { quarter: taxQuartersForYear(year)[3], year };
}

/** Days from `today` to `dueDate` (both YYYY-MM-DD, UTC midnights). */
export function daysUntil(today: string, dueDate: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export type TaxSetAside = {
  /** Self-employment tax (passthrough mode only, else 0). */
  seTaxCents: number;
  federalCents: number;
  utahCents: number;
  totalCents: number;
};

/**
 * Recommended set-aside on a period's net profit (cents). Passthrough: SE tax
 * on seTaxBasePercent of profit, federal on (profit - half the SE tax), Utah
 * flat on profit. S-corp: treats profit as distributions taxed at the
 * configured effective rates; payroll and its withholding are handled in the
 * payroll system, not here. Losses set aside nothing.
 */
export function computeTaxSetAside(netProfitCents: number, settings: FinanceSettings): TaxSetAside {
  if (netProfitCents <= 0) return { seTaxCents: 0, federalCents: 0, utahCents: 0, totalCents: 0 };

  if (settings.taxMode === "scorp") {
    const federal = Math.round((netProfitCents * settings.scorpDistributionRatePercent) / 100);
    const utah = Math.round((netProfitCents * settings.utahRatePercent) / 100);
    return { seTaxCents: 0, federalCents: federal, utahCents: utah, totalCents: federal + utah };
  }

  const seBase = Math.round((netProfitCents * settings.seTaxBasePercent) / 100);
  const seTax = Math.round((seBase * settings.seTaxRatePercent) / 100);
  const federalBase = Math.max(0, netProfitCents - Math.round(seTax / 2));
  const federal = Math.round((federalBase * settings.federalRatePercent) / 100);
  const utah = Math.round((netProfitCents * settings.utahRatePercent) / 100);
  return { seTaxCents: seTax, federalCents: federal, utahCents: utah, totalCents: seTax + federal + utah };
}
