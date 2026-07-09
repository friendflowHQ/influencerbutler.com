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
  // If you BUY the product yourself, break-even also has to recoup the price.
  totalToEarnBackPurchasedCents: number;
  salesToBreakEvenPurchased: number;
  viewsToBreakEvenPurchased: number;
  estMonthlySalesShare: number;
  estMonthlyProfitCents: number;
  // Estimated monthly profit divided by the minutes spent filming and editing:
  // an efficiency signal, since a creator's real constraint is time, not ideas.
  // Ranks products by "profit each minute of my effort buys", not gross payout.
  estProfitPerFilmMinuteCents: number;
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

  // Break-even when you paid for the product: recoup filming time AND price.
  const totalToEarnBackPurchasedCents = timeInvestmentCents + Math.max(0, inputs.priceCents);
  const salesToBreakEvenPurchased =
    commissionPerSaleCents > 0
      ? Math.ceil(totalToEarnBackPurchasedCents / commissionPerSaleCents)
      : Infinity;
  const viewsToBreakEvenPurchased =
    conversion > 0 && Number.isFinite(salesToBreakEvenPurchased)
      ? Math.ceil(salesToBreakEvenPurchased / conversion)
      : Infinity;

  const share = competitionShare(inputs.influencerCompetition);
  const estMonthlySalesShare = Math.max(0, inputs.viewsPerMonth) * share * conversion;
  const estMonthlyProfitCents = Math.round(estMonthlySalesShare * commissionPerSaleCents);

  const minutes = Math.max(0, inputs.minutesPerVideo);
  const estProfitPerFilmMinuteCents =
    minutes > 0 ? Math.round(estMonthlyProfitCents / minutes) : 0;

  return {
    commissionPerSaleCents,
    timeInvestmentCents,
    salesToBreakEven,
    viewsToBreakEven,
    totalToEarnBackPurchasedCents,
    salesToBreakEvenPurchased,
    viewsToBreakEvenPurchased,
    estMonthlySalesShare,
    estMonthlyProfitCents,
    estProfitPerFilmMinuteCents,
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
