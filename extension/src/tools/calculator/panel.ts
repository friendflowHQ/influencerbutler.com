import { addSection, collapsible, el, infoTip } from "../../ui/components";
import { t } from "../../i18n";
import { calculate, formatCents, type CalculatorInputs } from "./model";
import { patchSettings } from "../../storage/store";
import { getRateCard, rateForCategory } from "../../rate-card/cache";
import type { Settings } from "../../storage/schema";
import type { ProductSignals } from "../../amazon/product-signals";
import type { VideoCounts } from "../../transport/types";

// Break-even panel. Price and competition come from the page; the user's
// assumptions live in settings and persist across products.
export function renderCalculator(
  signals: ProductSignals,
  counts: VideoCounts | null,
  settings: Settings,
  // A rate already resolved by the caller (e.g. the Walmart overlay's rate-card
  // lookup). When given, it seeds the starting rate and suppresses the Amazon
  // Associates rate-card fallback, which would otherwise apply Amazon rates to a
  // non-Amazon product.
  initialRatePct?: number,
): void {
  const section = addSection(t().breakEvenMath, t().calcIntro);

  if (signals.priceCents === null) {
    section.append(el("p", "note", t().noPriceForMath));
    return;
  }

  // If the SiteStripe bar gave us the real onsite commission for this
  // product, use it as the starting rate instead of the saved guess.
  const detectedCommission = signals.commissionRatePct;
  const state = {
    commissionRatePct: detectedCommission ?? initialRatePct ?? settings.commissionRatePct,
    viewsPerMonth: 1000,
    conversionPct: settings.conversionPct,
    minutesPerVideo: settings.minutesPerVideo,
    hourlyValue: settings.hourlyValue,
  };

  // SiteStripe / rate-card badges live in a slot right under the heading, so
  // they stay put as the cards below re-render.
  const badgeSlot = el("div");
  section.append(badgeSlot);
  if (detectedCommission !== null) {
    const badge = el("p", "note");
    badge.textContent = t().commissionFromSiteStripe(detectedCommission);
    badgeSlot.append(badge);
  }

  // Results-first, in soft cards like the desktop Orders Butler. Card 1 (top,
  // accent): break-even when you BUY the product. Card 2: break-even on filming
  // TIME only (product gifted via Creator Connections or already owned), with
  // the tweakable assumptions collapsed under it.
  const purchasedCard = el("div", "calc-card accent");
  const purchasedTitle = el("p", "calc-card-title", t().bePurchasedHeading);
  purchasedTitle.append(infoTip(t().bePurchasedNote));
  const purchasedResults = el("dl", "kv");
  purchasedCard.append(purchasedTitle, purchasedResults);

  const timeCard = el("div", "calc-card");
  const timeTitle = el("p", "calc-card-title", t().beTimeHeading);
  timeTitle.append(infoTip(t().beTimeNote));
  const results = el("dl", "kv");
  timeCard.append(timeTitle, results);

  section.append(purchasedCard, timeCard);

  // The assumptions that drive both cards, collapsed by default under the
  // orange caret, within the time card.
  const commissionField = numberField(t().fieldCommissionRate, state.commissionRatePct, 0.5, (v) => {
    state.commissionRatePct = v;
    void patchSettings({ commissionRatePct: v });
    update();
  });
  const inputs = collapsible(timeCard, t().beAdjustAssumptions, { open: false });
  inputs.append(
    commissionField.wrap,
    numberField(t().fieldHourlyRate, state.hourlyValue, 5, (v) => {
      state.hourlyValue = v;
      void patchSettings({ hourlyValue: v });
      update();
    }).wrap,
    numberField(t().fieldMinutesFilmEdit, state.minutesPerVideo, 5, (v) => {
      state.minutesPerVideo = v;
      void patchSettings({ minutesPerVideo: v });
      update();
    }).wrap,
    numberField(t().fieldViewsPerMonth, state.viewsPerMonth, 100, (v) => {
      state.viewsPerMonth = v;
      update();
    }).wrap,
  );

  function update(): void {
    const inputs: CalculatorInputs = {
      priceCents: signals.priceCents ?? 0,
      commissionRatePct: state.commissionRatePct,
      viewsPerMonth: state.viewsPerMonth,
      conversionPct: state.conversionPct,
      minutesPerVideo: state.minutesPerVideo,
      hourlyValueCents: Math.round(state.hourlyValue * 100),
      influencerCompetition: counts?.influencer ?? 0,
    };
    const r = calculate(inputs);
    const timeLabel = t().kvTimeToFilm(
      state.minutesPerVideo,
      formatCents(Math.round(state.hourlyValue * 100), signals.currency),
    );
    results.replaceChildren(
      kv(t().kvCommissionPerSale, formatCents(r.commissionPerSaleCents, signals.currency)),
      kv(timeLabel, formatCents(r.timeInvestmentCents, signals.currency)),
      kv(t().kvSalesToEarnBack, Number.isFinite(r.salesToBreakEven) ? String(r.salesToBreakEven) : t().notApplicable),
      kv(t().kvViewsForSales, Number.isFinite(r.viewsToBreakEven) ? r.viewsToBreakEven.toLocaleString() : t().notApplicable),
      kv(t().kvProfitPerMonth, formatCents(r.estMonthlyProfitCents, signals.currency), t().calcEstimatesNote),
      kv(
        t().kvRoiPerMinute,
        `${formatCents(r.estProfitPerFilmMinuteCents, signals.currency)}${t().perMinuteSuffix}`,
        t().roiPerMinuteNote,
      ),
    );
    purchasedResults.replaceChildren(
      kv(t().kvPurchasePrice, formatCents(inputs.priceCents, signals.currency)),
      kv(t().kvTotalToEarnBack, formatCents(r.totalToEarnBackPurchasedCents, signals.currency)),
      kv(
        t().kvSalesToEarnBack,
        Number.isFinite(r.salesToBreakEvenPurchased) ? String(r.salesToBreakEvenPurchased) : t().notApplicable,
      ),
      kv(
        t().kvViewsForSales,
        Number.isFinite(r.viewsToBreakEvenPurchased)
          ? r.viewsToBreakEvenPurchased.toLocaleString()
          : t().notApplicable,
      ),
    );
  }

  update();

  // No live SiteStripe rate on this page: fall back to the Associates rate
  // card, matched on the product's category. Async (reads the cached card),
  // so it fills in a moment after the panel renders. Skipped when the caller
  // already supplied a rate (a non-Amazon retailer resolves its own rate card).
  if (detectedCommission === null && initialRatePct == null) void applyRateCard();

  async function applyRateCard(): Promise<void> {
    const card = await getRateCard();
    if (!card) return;
    const match = rateForCategory(card, signals.category);
    if (!match) return;
    state.commissionRatePct = match.ratePct;
    commissionField.input.value = String(match.ratePct);
    const badge = el("p", "note");
    badge.textContent = match.isDefault
      ? t().commissionFromRateCardDefault(match.ratePct)
      : t().commissionFromRateCard(match.ratePct, match.label);
    badgeSlot.append(badge);
    update();
  }
}

function kv(label: string, value: string, info?: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const dt = el("dt", "", label);
  if (info) dt.append(infoTip(info));
  const dd = el("dd", "", value);
  fragment.append(dt, dd);
  return fragment;
}

function numberField(
  label: string,
  value: number,
  step: number,
  onChange: (value: number) => void,
): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = el("label", "field");
  wrap.append(document.createTextNode(label));
  const input = el("input");
  input.type = "number";
  input.min = "0";
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", () => {
    const parsed = parseFloat(input.value);
    if (!Number.isNaN(parsed) && parsed >= 0) onChange(parsed);
  });
  wrap.append(input);
  return { wrap, input };
}
