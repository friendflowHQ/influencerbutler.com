import { el, collapsible } from "../../ui/components";
import { t } from "../../i18n";
import { sendToBackground, type HudCommandResult, type VideoReloadRef } from "../../shared/messages";
import { getSettings, patchSettings } from "../../storage/store";
import type { VideoBumpMode, VideoBumpRunOn } from "../../storage/schema";

export type BumpVideoInfo = {
  contentId: string;
  title: string | null;
  asin: string | null;
  marketplace: string | null;
};

// "Bump it": follows a verified-missing own video (tools/my-video/resolve.ts).
// Offers to delete + re-upload it fresh so Amazon's algorithm treats it like a
// new post, either in this browser or on the paired desktop app's Video Reload
// Butler. The run-on/automation-level choice is a small picker pre-filled from
// the last answer (settings.videoBump), so a repeat visit is a single click.
export function renderBumpAdvice(section: HTMLElement, info: BumpVideoInfo): void {
  const content = collapsible(section, t().videoBumpChip, { open: false });
  content.append(el("p", "note", t().videoBumpExplain));
  void mountPickerAndAction(content, info);
}

async function mountPickerAndAction(content: HTMLElement, info: BumpVideoInfo): Promise<void> {
  const settings = await getSettings();
  let runOn: VideoBumpRunOn | null = settings.videoBump.runOn;
  let mode: VideoBumpMode | null = settings.videoBump.mode;

  const runOnRow = toggleRow(
    t().videoBumpRunOnLabel,
    [
      { value: "browser", label: t().videoBumpRunOnBrowser },
      { value: "desktop", label: t().videoBumpRunOnDesktop },
    ],
    runOn,
    (v) => {
      runOn = v;
      updateConfirmState();
    },
  );
  const modeRow = toggleRow(
    t().videoBumpModeLabel,
    [
      { value: "auto", label: t().videoBumpModeAuto },
      { value: "assist", label: t().videoBumpModeAssist },
    ],
    mode,
    (v) => {
      mode = v;
      updateConfirmState();
    },
  );

  const status = el("p", "note");
  status.hidden = true;
  const btn = el("button", "btn") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = t().videoBumpConfirm;

  const updateConfirmState = () => {
    btn.disabled = !runOn || !mode;
  };
  updateConfirmState();

  btn.addEventListener("click", () => {
    if (!runOn || !mode) return;
    void runBump(runOn, mode, info, btn, status);
  });

  content.append(runOnRow.row, modeRow.row, btn, status);
}

// One labeled group of mutually-exclusive toggle buttons. Plain buttons (not
// radio inputs) so no label/for wiring is needed inside the shadow panel;
// "active" marks the current pick, including the pre-filled remembered one.
function toggleRow<V extends string>(
  label: string,
  options: Array<{ value: V; label: string }>,
  initial: V | null,
  onPick: (value: V) => void,
): { row: HTMLElement } {
  const row = el("div", "bump-toggle-row");
  row.append(el("span", "t", label));
  const buttons = el("div", "row");
  for (const opt of options) {
    const b = el("button", "btn secondary") as HTMLButtonElement;
    b.type = "button";
    b.textContent = opt.label;
    if (opt.value === initial) b.classList.add("active");
    b.addEventListener("click", () => {
      for (const sibling of Array.from(buttons.children)) sibling.classList.remove("active");
      b.classList.add("active");
      onPick(opt.value);
    });
    buttons.append(b);
  }
  row.append(buttons);
  return { row };
}

async function runBump(
  runOn: VideoBumpRunOn,
  mode: VideoBumpMode,
  info: BumpVideoInfo,
  btn: HTMLButtonElement,
  status: HTMLElement,
): Promise<void> {
  await patchSettings({ videoBump: { runOn, mode } });

  btn.disabled = true;
  status.hidden = false;
  status.textContent = t().videoBumpRunning;

  if (runOn === "browser") {
    const { runBrowserBump } = await import("./bump-browser-runner");
    try {
      const res = await runBrowserBump(
        { contentId: info.contentId, asin: info.asin ?? undefined, title: info.title ?? undefined },
        mode,
      );
      status.textContent = res.message ?? (res.ok ? t().videoBumpDone : t().videoBumpError);
    } catch {
      status.textContent = t().videoBumpError;
    } finally {
      btn.disabled = false;
    }
    return;
  }

  const video: VideoReloadRef = {
    contentId: info.contentId,
    asin: info.asin ?? undefined,
    title: info.title ?? undefined,
    marketplace: info.marketplace ?? undefined,
  };
  let res: HudCommandResult;
  try {
    res = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "video.reload", video, mode },
    });
  } catch {
    status.textContent = t().videoBumpError;
    btn.disabled = false;
    return;
  }
  if (!res.ok) {
    status.textContent = res.needsPairing ? t().videoBumpConnectApp : res.message ?? t().videoBumpError;
    btn.disabled = false;
    return;
  }
  status.textContent = res.message ?? t().videoBumpDone;
  btn.disabled = false;
}
