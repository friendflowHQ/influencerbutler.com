import { addSection, el } from "../../ui/components";
import { calculate, formatCents, type CalculatorInputs } from "./model";
import { patchSettings } from "../../storage/store";
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
  const section = addSection("Break-even math");

  if (signals.priceCents === null) {
    section.append(el("p", "note", "No price found on this page, so no math to run."));
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

  // Explain up front what "break even" means here, since it trips people up:
  // it is about earning back the value of your filming TIME, not buying the
  // product (Creator Connections gifts it, or you already own it).
  const intro = el("p", "note");
  intro.textContent =
    "How many sales pay back the time you spend filming one video. This assumes the product is free (Creator Connections) or you already own it, not that you buy it.";
  section.append(intro);

  if (detectedCommission !== null) {
    const badge = el("p", "note");
    badge.textContent = `Commission rate ${detectedCommission}% read live from your SiteStripe bar.`;
    section.append(badge);
  }

  const results = el("dl", "kv");
  section.append(results);

  const fields = el("div");
  fields.append(
    numberField("Commission rate (%)", state.commissionRatePct, 0.5, (v) => {
      state.commissionRatePct = v;
      void patchSettings({ commissionRatePct: v });
      update();
    }),
    numberField("Your hourly rate ($)", state.hourlyValue, 5, (v) => {
      state.hourlyValue = v;
      void patchSettings({ hourlyValue: v });
      update();
    }),
    numberField("Minutes to film + edit", state.minutesPerVideo, 5, (v) => {
      state.minutesPerVideo = v;
      void patchSettings({ minutesPerVideo: v });
      update();
    }),
    numberField("Est. views per month", state.viewsPerMonth, 100, (v) => {
      state.viewsPerMonth = v;
      update();
    }),
  );
  section.append(fields);

  const note = el("p", "note");
  note.textContent =
    "Estimates only. Monthly profit assumes the carousel splits views evenly across influencer videos.";
  section.append(note);

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
    const timeLabel = `Your time to film (${state.minutesPerVideo} min @ ${formatCents(Math.round(state.hourlyValue * 100), signals.currency)}/hr)`;
    results.replaceChildren(
      kv("Commission per sale", formatCents(r.commissionPerSaleCents, signals.currency)),
      kv(timeLabel, formatCents(r.timeInvestmentCents, signals.currency)),
      kv("Sales to earn that back", Number.isFinite(r.salesToBreakEven) ? String(r.salesToBreakEven) : "n/a"),
      kv("Views for those sales", Number.isFinite(r.viewsToBreakEven) ? r.viewsToBreakEven.toLocaleString() : "n/a"),
      kv("Est. profit per month", formatCents(r.estMonthlyProfitCents, signals.currency)),
    );
  }

  update();
}

function kv(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const dt = el("dt", "", label);
  const dd = el("dd", "", value);
  fragment.append(dt, dd);
  return fragment;
}

function numberField(
  label: string,
  value: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
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
  return wrap;
}
