import { addSection, el, infoTip } from "../../ui/components";
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
    commissionRatePct: detectedCommission ?? settings.commissionRatePct,
    viewsPerMonth: 1000,
    conversionPct: settings.conversionPct,
    minutesPerVideo: settings.minutesPerVideo,
    hourlyValue: settings.hourlyValue,
  };

  // The "what break even means" explainer now lives in the heading's info
  // tooltip (it trips people up: it is about earning back your filming TIME,
  // not buying the product, which Creator Connections gifts or you own).
  if (detectedCommission !== null) {
    const badge = el("p", "note");
    badge.textContent = t().commissionFromSiteStripe(detectedCommission);
    section.append(badge);
  }

  const results = el("dl", "kv");
  section.append(results);

  const commissionField = numberField(t().fieldCommissionRate, state.commissionRatePct, 0.5, (v) => {
    state.commissionRatePct = v;
    void patchSettings({ commissionRatePct: v });
    update();
  });
  const fields = el("div");
  fields.append(
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
  section.append(fields);

  // A second break-even for the case the user actually bought the product: it
  // has to earn back the purchase price on top of the filming time.
  const purchasedHeading = el("p", "note");
  purchasedHeading.style.fontWeight = "700";
  purchasedHeading.style.marginTop = "4px";
  purchasedHeading.textContent = t().bePurchasedHeading;
  purchasedHeading.append(infoTip(t().bePurchasedNote));
  const purchasedResults = el("dl", "kv");
  section.append(purchasedHeading, purchasedResults);

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
  // so it fills in a moment after the panel renders.
  if (detectedCommission === null) void applyRateCard();

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
    section.insertBefore(badge, results);
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
