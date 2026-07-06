import { addSection, chip, el } from "../../ui/components";
import { t } from "../../i18n";
import { readStorefrontHandle, readUploadState, type UploadState } from "../../amazon/creator-hub";
import { harvestStorefront } from "../storefront-check/harvest";
import { sendToBackground } from "../../shared/messages";
import type { Availability } from "../../background/market-availability";

// Creator Hub "Edit Video" helper (/creatorhub/video/<id>). Mirrors the
// competitor's upload overlay, in our branding: per-country availability of the
// tagged products, a proactive duplicate-video check against the storefront,
// and an opt-in submit / auto-submit. All the risky bits are user-triggered and
// no-op safely when Amazon's markup is missing.

const MARKETS = ["US", "CA", "UK"] as const;
const MANAGE_URL = "https://www.amazon.com/creatorhub/manage";

export function initUploadHelper(): void {
  let done = false;
  const tryRender = (): boolean => {
    const state = readUploadState(document);
    if (!state) return false;
    done = true;
    render(state);
    return true;
  };
  if (tryRender()) return;
  // The edit page is a React SPA; the a-state script can land a beat late.
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (done || tryRender() || tries > 12) window.clearInterval(timer);
  }, 600);
}

function render(state: UploadState): void {
  const section = addSection(t().uploadHelperTitle);
  renderProducts(section, state);
  renderDuplicateCheck(section, state);
  renderSubmit(section);
}

function renderProducts(section: HTMLElement, state: UploadState): void {
  section.append(el("p", "note", t().uhTaggedProducts(state.asins.length)));
  if (state.asins.length === 0) return;

  const cells = new Map<string, Record<string, HTMLElement>>();
  const list = el("div");
  for (const asin of state.asins) {
    const row = el("div", "row");
    row.append(el("span", "idrow-value", asin));
    const perMarket: Record<string, HTMLElement> = {};
    for (const m of MARKETS) {
      const c = chip("", `${m} ?`);
      perMarket[m] = c;
      row.append(c);
    }
    cells.set(asin, perMarket);
    list.append(row);
  }
  section.append(list);

  const btn = el("button", "btn secondary");
  btn.textContent = t().uhCheckAvailability;
  const progress = el("p", "progress");
  btn.addEventListener("click", () => {
    void (async () => {
      btn.disabled = true;
      let n = 0;
      for (const asin of state.asins) {
        progress.textContent = t().uhCheckingAvailability(++n, state.asins.length);
        const avail = await sendToBackground<Record<string, Availability>>({
          kind: "FETCH_MARKET_AVAILABILITY",
          asin,
          markets: [...MARKETS],
        }).catch(() => ({}) as Record<string, Availability>);
        const perMarket = cells.get(asin);
        if (!perMarket) continue;
        for (const m of MARKETS) {
          const status = avail[m] ?? "unknown";
          const c = perMarket[m]!;
          c.className = `chip ${status === "available" ? "good" : status === "unavailable" ? "bad" : "warn"}`;
          c.textContent = `${m} ${availWord(status)}`;
        }
      }
      progress.textContent = "";
      btn.disabled = false;
    })();
  });
  section.append(btn, progress);
}

function renderDuplicateCheck(section: HTMLElement, state: UploadState): void {
  if (!state.title) return;
  const handle = readStorefrontHandle(document);

  const btn = el("button", "btn secondary");
  btn.textContent = t().uhCheckDuplicate;
  const out = el("p", "note");
  btn.addEventListener("click", () => {
    void (async () => {
      if (!handle) {
        out.textContent = t().uhNoHandle;
        return;
      }
      btn.disabled = true;
      out.className = "note";
      out.textContent = t().uhCheckingDuplicate;
      try {
        const result = await harvestStorefront(
          (_pages, items) => (out.textContent = t().uhCheckingDuplicateProgress(items)),
          handle,
        );
        const target = normalizeTitle(state.title ?? "");
        const dup = result.items.some((i) => i.type === "video" && normalizeTitle(i.title) === target);
        out.className = dup ? "seal warn" : "note";
        out.textContent = dup ? t().uhDuplicateFound : t().uhNoDuplicate;
      } catch {
        out.className = "note";
        out.textContent = t().uhCheckFailed;
      } finally {
        btn.disabled = false;
      }
    })();
  });
  section.append(btn, out);
}

function renderSubmit(section: HTMLElement): void {
  const note = el("p", "note", t().uhAutoSubmitNote);
  const auto = checkbox(t().uhAutoSubmit);
  const submitBtn = el("button", "btn");
  submitBtn.textContent = t().uhSubmitClose;
  const stopBtn = el("button", "btn secondary");
  stopBtn.textContent = t().uhStop;
  stopBtn.style.display = "none";
  const status = el("p", "progress");
  const controls = el("div", "row");
  controls.append(submitBtn, stopBtn);

  let watchTimer: number | null = null;
  const stopWatching = () => {
    if (watchTimer !== null) window.clearInterval(watchTimer);
    watchTimer = null;
    stopBtn.style.display = "none";
    auto.input.checked = false;
  };

  submitBtn.addEventListener("click", () => void submitAndClose(status));

  auto.input.addEventListener("change", () => {
    if (!auto.input.checked) {
      stopWatching();
      status.textContent = "";
      return;
    }
    stopBtn.style.display = "inline-block";
    status.textContent = t().uhWatching;
    let tries = 0;
    watchTimer = window.setInterval(() => {
      void (async () => {
        tries += 1;
        if (tries > 200) {
          stopWatching();
          status.textContent = t().uhWatchTimeout;
          return;
        }
        if (submitControls().ready) {
          stopWatching();
          await submitAndClose(status);
        } else {
          status.textContent = t().uhWatching;
        }
      })();
    }, 1500);
  });

  stopBtn.addEventListener("click", () => {
    stopWatching();
    status.textContent = t().uhStopped;
  });

  section.append(note, auto.wrap, controls, status);
}

type SubmitControls = { input: HTMLElement | null; ready: boolean };

// Save/Submit button + upload-ready gate (docs/developer/amazon-creator-hub-selectors.md
// Page 2 sections E/J): only ready when the button is enabled and the video
// player has a real (non-blob) src, so we never save an incomplete draft.
function submitControls(): SubmitControls {
  const span = document.querySelector("#cp-upload-widget-submission-update");
  const input = span?.querySelector<HTMLElement>("input.a-button-input") ?? null;
  const disabled =
    !span ||
    span.classList.contains("a-button-disabled") ||
    (input as HTMLInputElement | null)?.disabled === true;
  const player = document.querySelector<HTMLMediaElement>(
    "#cp-desktop-upload-widget-video-player, video",
  );
  const src = player?.getAttribute("src") ?? "";
  const videoReady = !player || (!!src && !src.startsWith("blob:"));
  return { input, ready: Boolean(input) && !disabled && videoReady };
}

async function submitAndClose(status: HTMLElement): Promise<void> {
  const { input, ready } = submitControls();
  if (!input) {
    status.textContent = t().uhSubmitMissing;
    return;
  }
  if (!ready) {
    status.textContent = t().uhNotReady;
    return;
  }
  status.textContent = t().uhSubmitting;
  input.click();
  await sleep(3000);
  status.textContent = t().uhSubmitted;
  // "Close": return to the video list, but only if Amazon has not already
  // navigated us away as part of its own submit flow.
  if (/^\/creatorhub\/video\//.test(location.pathname)) {
    window.location.assign(MANAGE_URL);
  }
}

function checkbox(text: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = el("label", "row toggle");
  wrap.style.gap = "8px";
  const input = el("input");
  input.type = "checkbox";
  input.style.width = "auto";
  input.style.flex = "none";
  wrap.append(input, el("span", "note", text));
  return { wrap, input };
}

function availWord(status: Availability): string {
  return status === "available"
    ? t().uhInStock
    : status === "unavailable"
      ? t().uhUnavailable
      : t().uhUnknownAvail;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/#ad\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
