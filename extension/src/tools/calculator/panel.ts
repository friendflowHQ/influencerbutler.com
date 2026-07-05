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

  const state = {
    commissionRatePct: settings.commissionRatePct,
    viewsPerMonth: 1000,
    conversionPct: settings.conversionPct,
    minutesPerVideo: settings.minutesPerVideo,
    hourlyValue: settings.hourlyValue,
  };

  const results = el("dl", "kv");
  section.append(results);

  const fields = el("div");
  fields.append(
    numberField("Commission rate (%)", state.commissionRatePct, 0.5, (v) => {
      state.commissionRatePct = v;
      void patchSettings({ commissionRatePct: v });
      update();
    }),
    numberField("Est. views per month", state.viewsPerMonth, 100, (v) => {
      state.viewsPerMonth = v;
      update();
    }),
    numberField("Minutes to make the video", state.minutesPerVideo, 5, (v) => {
      state.minutesPerVideo = v;
      void patchSettings({ minutesPerVideo: v });
      update();
    }),
  );
  section.append(fields);

  const note = el("p", "note");
  note.textContent =
    "Estimates only. Competition share assumes the carousel splits views evenly across influencer videos.";
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
    results.replaceChildren(
      kv("Commission per sale", formatCents(r.commissionPerSaleCents, signals.currency)),
      kv("Your time investment", formatCents(r.timeInvestmentCents, signals.currency)),
      kv("Sales to break even", Number.isFinite(r.salesToBreakEven) ? String(r.salesToBreakEven) : "n/a"),
      kv("Views to break even", Number.isFinite(r.viewsToBreakEven) ? r.viewsToBreakEven.toLocaleString() : "n/a"),
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
