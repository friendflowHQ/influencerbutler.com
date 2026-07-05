// Break-even / profit math. Pure functions, no Chrome APIs, unit-tested.
// All money in cents to avoid float drift; percentages as 0-100 numbers.

export type CalculatorInputs = {
  priceCents: number;
  commissionRatePct: number;
  viewsPerMonth: number;
  conversionPct: number;
  minutesPerVideo: number;
  hourlyValueCents: number;
  influencerCompetition: number;
};

export type CalculatorResult = {
  commissionPerSaleCents: number;
  timeInvestmentCents: number;
  salesToBreakEven: number;
  viewsToBreakEven: number;
  estMonthlySalesShare: number;
  estMonthlyProfitCents: number;
};

// A new video splits carousel attention with existing influencer videos;
// model the share as 1 / (competition + 1). Clearly an estimate, and labeled
// as such in the UI.
export function competitionShare(influencerCompetition: number): number {
  const competitors = Math.max(0, Math.floor(influencerCompetition));
  return 1 / (competitors + 1);
}

export function calculate(inputs: CalculatorInputs): CalculatorResult {
  const commissionPerSaleCents = Math.round(
    (inputs.priceCents * clampPct(inputs.commissionRatePct)) / 100,
  );
  const timeInvestmentCents = Math.round(
    (Math.max(0, inputs.minutesPerVideo) / 60) * Math.max(0, inputs.hourlyValueCents),
  );

  const salesToBreakEven =
    commissionPerSaleCents > 0 ? Math.ceil(timeInvestmentCents / commissionPerSaleCents) : Infinity;

  const conversion = clampPct(inputs.conversionPct) / 100;
  const viewsToBreakEven =
    conversion > 0 && Number.isFinite(salesToBreakEven)
      ? Math.ceil(salesToBreakEven / conversion)
      : Infinity;

  const share = competitionShare(inputs.influencerCompetition);
  const estMonthlySalesShare = Math.max(0, inputs.viewsPerMonth) * share * conversion;
  const estMonthlyProfitCents = Math.round(estMonthlySalesShare * commissionPerSaleCents);

  return {
    commissionPerSaleCents,
    timeInvestmentCents,
    salesToBreakEven,
    viewsToBreakEven,
    estMonthlySalesShare,
    estMonthlyProfitCents,
  };
}

export function formatCents(cents: number, currency = "USD"): string {
  if (!Number.isFinite(cents)) return "n/a";
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}
