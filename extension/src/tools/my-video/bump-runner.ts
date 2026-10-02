import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { readUploadState } from "../../amazon/creator-hub";
import type { BumpStep, BumpStepOutcome } from "../../shared/messages";

// In-browser "Bump it" step runner. Each function below drives exactly one
// Creator Hub page, on the background's RUN_BUMP_STEP message
// (background/video-bump.ts is the orchestrator; it owns the delete -> wait ->
// reupload sequencing, tab lifecycle, and the actual video download).
//
// Selectors are taken from the desktop repo's docs/developer/amazon-creator-
// hub-selectors.md (live-verified 2026-04-24 against a real account) wherever
// that document covers the page; anything it does not cover (the OCP
// /create/post tag-products flow for a FRESH upload) is best-effort and
// verified live QA, same convention as tools/campaign-radar/accept-runner.ts.

export async function runBumpStep(step: BumpStep): Promise<BumpStepOutcome> {
  switch (step.kind) {
    case "capture":
      return runCapture(step.contentId);
    case "delete":
      return runDelete(step.contentId);
    case "reupload":
      return runReupload(step.title, step.asins, step.downloadFilename);
    default:
      return { ok: false, kind: (step as BumpStep).kind, reason: "error" };
  }
}

// ---- Capture (/creatorhub/video/<contentId>) --------------------------------
// The one page confirmed to carry both the a-state (title/asins/marketplace)
// and the player's resolved CDN src (Page 2 of the selectors doc).

async function runCapture(contentId: string): Promise<BumpStepOutcome> {
  const state = await waitFor(() => readUploadState(document), 15_000, 500);
  if (!state) return { ok: false, kind: "capture", reason: "not-found" };

  // Transcoding can take a while on a fresh/edited video; generous timeout.
  const videoSrc = await waitFor(() => {
    const player = document.querySelector<HTMLMediaElement>(
      "#cp-desktop-upload-widget-video-player, video",
    );
    const src = player?.getAttribute("src") ?? "";
    return src && !src.startsWith("blob:") ? src : null;
  }, 60_000, 1_000);
  if (!videoSrc) return { ok: false, kind: "capture", reason: "no-src" };

  return {
    ok: true,
    kind: "capture",
    title: state.title,
    asins: state.asins,
    marketplace: state.marketplaceCode,
    videoSrc,
  };
}

// ---- Delete (/creatorhub/manage) --------------------------------------------
// Scoped strictly by the row's own name="<contentId>" attribute: the
// Manage/Delete span ids repeat on every row and always resolve to row 1
// (selectors doc Page 1 §H) - clicking them unscoped would delete the WRONG
// video.

async function runDelete(contentId: string): Promise<BumpStepOutcome> {
  const row = await waitFor(
    () => document.querySelector<HTMLElement>(`[name="${cssEscape(contentId)}"]`),
    15_000,
    500,
  );
  if (!row) return { ok: false, kind: "delete", reason: "not-found" };

  const del = row.querySelector<HTMLInputElement>('input[name^="Delete:"]');
  if (!del) return { ok: false, kind: "delete", reason: "not-found" };

  // Hidden under .aok-hidden until row-hover (doc Page 1 §H); CSS :hover
  // cannot be faked with a synthetic event, so remove the class directly, the
  // doc's own suggested alternative.
  revealHidden(del);
  del.click();

  const modal = await waitFor(() => findDeleteModal(), 8_000, 200);
  if (!modal) return { ok: false, kind: "delete", reason: "not-found" };
  const confirm = modal.querySelector<HTMLElement>(
    ".a-button-primary input.a-button-input",
  );
  if (!confirm) return { ok: false, kind: "delete", reason: "not-found" };
  confirm.click();

  const gone = await waitFor(
    () => (document.querySelector(`[name="${cssEscape(contentId)}"]`) ? null : true),
    15_000,
    300,
  );
  return gone
    ? { ok: true, kind: "delete" }
    : { ok: false, kind: "delete", reason: "timeout" };
}

function revealHidden(el: HTMLElement): void {
  let node: HTMLElement | null = el;
  for (let i = 0; i < 6 && node; i += 1) {
    node.classList.remove("aok-hidden");
    node = node.parentElement;
  }
}

function findDeleteModal(): HTMLElement | null {
  for (const modal of Array.from(document.querySelectorAll<HTMLElement>(".a-popover-modal"))) {
    const heading = modal.querySelector("h4")?.textContent ?? "";
    if (/delete video/i.test(heading)) return modal;
  }
  return null;
}

// ---- Reupload (/create/post, no id - a fresh upload) ------------------------
// UNVERIFIED past the file-input cascade and the title field (both documented
// in the selectors doc's Page 4 / Page 2 §J); the tag-products flow there is
// the Page 2 edit-page picker, not confirmed to exist on this OCP flow, so it
// is attempted best-effort and the banner always shows the asins to tag by
// hand as a fallback.

const FILE_INPUT_SELECTORS = [
  "#ocp-image-loader input[type='file']",
  "#ocp-unified-upload-container label input[type='file']",
  "#ocp-unified-upload-container input[type='file']",
  "input[name='bulkFileUploader']",
  "input[type='file'][accept*='video']",
  "input[type='file']",
];
const TITLE_FIELD_SELECTOR = '[data-testid="ocpTitleTextArea"]';
const SUBMIT_SELECTORS = [
  "#cp-upload-widget-submission-update input.a-button-input",
  '[data-testid="ocpSubmit"]',
  '[data-testid="text-ocpSave"]',
];

async function runReupload(
  title: string | null,
  asins: string[],
  downloadFilename: string,
): Promise<BumpStepOutcome> {
  const banner = mountBanner(downloadFilename, asins);

  const fileInput = findFirst(FILE_INPUT_SELECTORS) as HTMLInputElement | null;
  if (fileInput) {
    banner.attachBtn.addEventListener("click", () => fileInput.click());
  } else {
    banner.setStatus(t().bumpReuploadNoFileInput);
  }

  const titleField = await waitFor(
    () => document.querySelector<HTMLInputElement>(TITLE_FIELD_SELECTOR),
    180_000,
    1_000,
  );
  if (!titleField) {
    banner.teardown();
    return { ok: false, kind: "reupload", reason: "timeout" };
  }
  banner.setStatus(t().bumpReuploadAttached);
  if (title) setFieldValue(titleField, title);

  const tagged = await tryTagAsins(asins);
  if (!tagged && asins.length > 0) banner.setStatus(t().bumpReuploadTagManually(asins.join(", ")));

  const submit = await waitFor(() => (submitReady() ? findSubmitButton() : null), 300_000, 1_500);
  if (!submit) {
    banner.teardown();
    return { ok: false, kind: "reupload", reason: "timeout" };
  }
  banner.setStatus(t().bumpReuploadSubmitting);
  submit.click();
  await sleep(3_000);
  banner.teardown();
  return { ok: true, kind: "reupload" };
}

function submitReady(): boolean {
  const btn = findSubmitButton();
  if (!btn) return false;
  const span = btn.closest<HTMLElement>("span, button") ?? btn;
  const disabled =
    span.classList.contains("a-button-disabled") ||
    (btn as HTMLInputElement).disabled === true ||
    span.getAttribute("aria-disabled") === "true";
  return !disabled;
}

function findSubmitButton(): HTMLElement | null {
  return findFirst(SUBMIT_SELECTORS);
}

function findFirst(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const found = document.querySelector<HTMLElement>(sel);
    if (found) return found;
  }
  return null;
}

// Best-effort: open the tag-products picker, search + add each asin, confirm
// the tagged-items container actually grew by that many. Never throws; a
// picker that does not exist on this flow, or ignores the synthetic search
// (the Idea List form's React-Native-web inputs are documented to do this),
// simply reports false so the banner's manual fallback takes over.
async function tryTagAsins(asins: string[]): Promise<boolean> {
  if (asins.length === 0) return true;
  const trigger = document.querySelector<HTMLElement>("#cp-asin-picker-trigger-button input.a-button-input");
  if (!trigger) return false;
  trigger.click();
  let added = 0;
  for (const asin of asins) {
    const search = await waitFor(
      () => document.querySelector<HTMLInputElement>('input[name="cp-asin-picker-search-input"]'),
      5_000,
      250,
    );
    if (!search) break;
    setFieldValue(search, asin);
    const searchBtn = document.querySelector<HTMLElement>(
      "#cp-asin-picker-search-button input.a-button-input",
    );
    searchBtn?.click();
    const addBtn = await waitFor(
      () => document.querySelector<HTMLElement>(`[data-asin="${cssEscape(asin)}"] .cp-asin-picker-circle`),
      6_000,
      300,
    );
    if (!addBtn) continue;
    addBtn.click();
    added += 1;
  }
  const done = document.querySelector<HTMLElement>(".cp-asin-picker-done-button input.a-button-input");
  done?.click();
  return added === asins.length;
}

// ---- Banner (reupload only) --------------------------------------------------

function mountBanner(
  downloadFilename: string,
  asins: string[],
): { attachBtn: HTMLButtonElement; setStatus: (s: string) => void; teardown: () => void } {
  const { host, root } = createInlineShadow("bump-reupload-banner");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.right = "0";
  host.style.zIndex = "2147483647";

  const bar = el("div", "bump-banner");
  bar.append(el("strong", "", t().bumpReuploadTitle));
  bar.append(el("span", "note", t().bumpReuploadFile(downloadFilename)));
  const attachBtn = el("button", "btn") as HTMLButtonElement;
  attachBtn.type = "button";
  attachBtn.textContent = t().bumpReuploadAttachBtn;
  const status = el("span", "note");
  bar.append(attachBtn, status);
  root.append(bar);
  document.documentElement.append(host);

  return {
    attachBtn,
    setStatus: (s: string) => (status.textContent = s),
    teardown: () => host.remove(),
  };
}

// ---- Shared helpers -----------------------------------------------------------

// Plain DOM input: a dispatched "input"/"change" event is enough for a normal
// controlled React input to pick up the value (unlike the Idea List form's
// React-Native-web search box, which the selectors doc flags as ignoring
// synthetic events entirely).
function setFieldValue(field: HTMLInputElement, value: string): void {
  field.focus();
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function cssEscape(value: string): string {
  const esc = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  return esc ? esc(value) : value.replace(/["\\]/g, "\\$&");
}

async function waitFor<T>(probe: () => T | null, timeoutMs: number, tickMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = probe();
    if (hit) return hit;
    if (Date.now() >= deadline) return null;
    await sleep(tickMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
