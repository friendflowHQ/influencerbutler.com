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
  /** Social Security portion of SE tax (12.4% of the 15.3%). */
  socialSecurityCents: number;
  /** Medicare portion of SE tax (2.9% of the 15.3%). */
  medicareCents: number;
  federalCents: number;
  utahCents: number;
  totalCents: number;
};

// SE tax split. The 15.3% is 12.4% Social Security + 2.9% Medicare. The Social
// Security 12.4% only applies up to the annual wage base (2025: $176,100;
// indexed yearly); Medicare 2.9% has no cap. Below the wage base both apply in
// full, which is the case for the modest profits this tool plans for.
export const SS_SHARE = 12.4 / 15.3;
export const SS_WAGE_BASE_NOTE = "$176,100 for 2025 (indexed yearly)";

export const SE_TAX_EDUCATION =
  "Self-employment tax is Social Security (12.4%) + Medicare (2.9%) = 15.3%, charged on 92.35% of net profit. As a sole-proprietor LLC you pay it yourself (an employee would split it with an employer), and it applies from the first dollar of profit, which is why the effective rate looks high. You do NOT pay it separately: it is added to your federal quarterly estimated payment (IRS Direct Pay) on the same dates as income tax, and reconciled on Schedule SE with your Form 1040. Half of it is deductible, which this estimate already applies. It funds your future Social Security and Medicare benefits.";

/**
 * Recommended set-aside on a period's net profit (cents). Passthrough: SE tax
 * on seTaxBasePercent of profit, federal on (profit - half the SE tax), Utah
 * flat on profit. S-corp: treats profit as distributions taxed at the
 * configured effective rates; payroll and its withholding are handled in the
 * payroll system, not here. Losses set aside nothing.
 */
export function computeTaxSetAside(netProfitCents: number, settings: FinanceSettings): TaxSetAside {
  const zero: TaxSetAside = {
    seTaxCents: 0,
    socialSecurityCents: 0,
    medicareCents: 0,
    federalCents: 0,
    utahCents: 0,
    totalCents: 0,
  };
  if (netProfitCents <= 0) return zero;

  if (settings.taxMode === "scorp") {
    const federal = Math.round((netProfitCents * settings.scorpDistributionRatePercent) / 100);
    const utah = Math.round((netProfitCents * settings.utahRatePercent) / 100);
    return { ...zero, federalCents: federal, utahCents: utah, totalCents: federal + utah };
  }

  const seBase = Math.round((netProfitCents * settings.seTaxBasePercent) / 100);
  const seTax = Math.round((seBase * settings.seTaxRatePercent) / 100);
  const socialSecurity = Math.round(seTax * SS_SHARE);
  const medicare = seTax - socialSecurity; // remainder, so the split sums exactly
  const federalBase = Math.max(0, netProfitCents - Math.round(seTax / 2));
  const federal = Math.round((federalBase * settings.federalRatePercent) / 100);
  const utah = Math.round((netProfitCents * settings.utahRatePercent) / 100);
  return {
    seTaxCents: seTax,
    socialSecurityCents: socialSecurity,
    medicareCents: medicare,
    federalCents: federal,
    utahCents: utah,
    totalCents: seTax + federal + utah,
  };
}
