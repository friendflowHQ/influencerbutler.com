import {
  BUMP_DOWNLOAD_TIMEOUT_MS,
  BUMP_REUPLOAD_WAIT_MS,
  BUMP_TAB_DWELL_MS,
} from "../shared/constants";
import { log } from "../shared/log";
import type { BumpStep, BumpStepOutcome, VideoReloadRef } from "../shared/messages";

// In-browser "Bump it": delete a video missing from a listing's carousel and
// re-upload it fresh, driven entirely from this extension (no desktop app).
// Four stages, each a real page the creator already has open or that we open
// for them:
//   1. capture  - the video's own /creatorhub/video/<id> edit page: read its
//      title, tagged asins, and the player's resolved (non-blob) src.
//   2. download - chrome.downloads, straight from that src (no CORS: the
//      downloads API fetches server-side, not through the page).
//   3. delete   - the Manage videos list: find the row, delete it.
//   4. wait, then reupload - a chrome.alarms wake after BUMP_REUPLOAD_WAIT_MS
//      (Amazon's duplicate-video detection needs time to clear) opens a fresh
//      upload page, fills the remembered title/tags, and waits for the
//      creator to attach the downloaded file themselves: Chrome does not let
//      a content script set a native file input's FileList, so that one click
//      stays manual. Once attached, it submits automatically.
// "assist" mode stops after stage 2: the creator asked to finish the Amazon
// side themselves, so stages 3-4 never run and nothing gets deleted.
//
// Mirrors background/campaign-accept.ts's tab-driver shape (open inactive,
// wait for TAB_READY, send a RUN message, resolve on the matching RESULT), job
// state persisted in chrome.storage.local so step 4 survives the service
// worker being evicted during the wait.

const JOBS_KEY = "ibVideoBumpJobs";
const ALARM_PREFIX = "video-bump:";

export type BumpJobStatus = "capturing" | "deleting" | "waiting" | "reuploading" | "done" | "failed";

export type BumpJob = {
  contentId: string;
  asin: string | null;
  title: string | null;
  asins: string[];
  marketplace: string | null;
  downloadFilename: string | null;
  status: BumpJobStatus;
  resumeAt: number | null;
  error: string | null;
  createdAt: number;
};

type BumpJobMap = Record<string, BumpJob>;

async function readJobs(): Promise<BumpJobMap> {
  try {
    const got = await chrome.storage.local.get(JOBS_KEY);
    const raw = got?.[JOBS_KEY];
    return raw && typeof raw === "object" ? (raw as BumpJobMap) : {};
  } catch {
    return {};
  }
}

async function writeJob(job: BumpJob): Promise<void> {
  const jobs = await readJobs();
  jobs[job.contentId] = job;
  try {
    await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  } catch {
    // best-effort: a failed write only costs the job its resumability
  }
}

export function hostFor(marketplace: string | null | undefined): string {
  return marketplace && /^amazon\./i.test(marketplace) ? marketplace : "amazon.com";
}

// The edit page (NOT /create/post): the one surface confirmed to render both
// the a-state title/asins and the player's resolved CDN src (docs/developer/
// amazon-creator-hub-selectors.md Page 2 in the desktop repo).
function editUrl(host: string, contentId: string): string {
  return `https://${host}/creatorhub/video/${contentId}`;
}
function manageUrl(host: string): string {
  return `https://${host}/creatorhub/manage`;
}
function newUploadUrl(host: string): string {
  return `https://${host}/create/post`;
}

// ---- Tab driver -------------------------------------------------------------

type Pending = {
  step: BumpStep;
  started: boolean;
  done: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (outcome: BumpStepOutcome) => void;
};

// Keyed by the tab we opened, exactly like campaign-accept.ts's pendingByTab.
const pendingByTab = new Map<number, Pending>();

// Open `url` and run `step` there once it reports ready. `dwellMs` null means
// "no timeout" (the reupload step waits on the creator; it reports in its own
// time, however long that takes, rather than being torn down).
function runStepInTab(url: string, step: BumpStep, dwellMs: number | null, active = false): Promise<BumpStepOutcome> {
  return chrome.tabs
    .create({ url, active })
    .then((tab) => {
      const tabId = tab.id;
      if (typeof tabId !== "number") {
        return { ok: false, kind: step.kind, reason: "tab" } as BumpStepOutcome;
      }
      return new Promise<BumpStepOutcome>((resolve) => {
        const timer =
          dwellMs === null
            ? null
            : setTimeout(() => finish(tabId, { ok: false, kind: step.kind, reason: "timeout" }), dwellMs);
        pendingByTab.set(tabId, { step, started: false, done: false, timer, resolve });
      });
    })
    .catch((error) => {
      log("video-bump", "could not open tab", error);
      return { ok: false, kind: step.kind, reason: "tab" } as BumpStepOutcome;
    });
}

// BUMP_TAB_READY from a tab: if it is one of ours and not yet started, tell it
// which step to run.
export function noteBumpTabReady(tabId: number | undefined): void {
  if (typeof tabId !== "number") return;
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done || pending.started) return;
  pending.started = true;
  void chrome.tabs.sendMessage(tabId, { kind: "RUN_BUMP_STEP", step: pending.step }).catch((error) => {
    log("video-bump", "RUN_BUMP_STEP send failed", error);
    finish(tabId, { ok: false, kind: pending.step.kind, reason: "tab" });
  });
}

// BUMP_STEP_RESULT from a tab: resolve the request that opened it. Tabs opened
// without a dwell timeout (the reupload step) only ever finish this way.
export function noteBumpStepResult(tabId: number | undefined, outcome: BumpStepOutcome): void {
  if (typeof tabId !== "number") return;
  finish(tabId, outcome);
}

function finish(tabId: number, outcome: BumpStepOutcome): void {
  const pending = pendingByTab.get(tabId);
  if (!pending || pending.done) return;
  pending.done = true;
  pendingByTab.delete(tabId);
  if (pending.timer) clearTimeout(pending.timer);
  void chrome.tabs.remove(tabId).catch(() => {
    // tab may already be gone (user closed it)
  });
  pending.resolve(outcome);
}

try {
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    const pending = pendingByTab.get(tabId);
    if (!pending) return;
    // The reupload tab has no dwell timer; the creator closing it mid-wait is
    // real signal (cancelled), not a transient tab hiccup.
    finish(tabId, { ok: false, kind: pending.step.kind, reason: "cancelled" });
  });
} catch {
  // chrome.tabs unavailable (tests)
}

// ---- Download ---------------------------------------------------------------

function downloadAndWait(url: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let downloadId: number | null = null;
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve({ ok: false, error: "timeout" });
    }, BUMP_DOWNLOAD_TIMEOUT_MS);

    function onChanged(delta: chrome.downloads.DownloadDelta): void {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === "complete") {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve({ ok: true });
      } else if (delta.state?.current === "interrupted") {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve({ ok: false, error: delta.error?.current ?? "interrupted" });
      }
    }

    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.download({ url, filename, conflictAction: "uniquify" }, (id) => {
      if (chrome.runtime.lastError || typeof id !== "number") {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve({ ok: false, error: chrome.runtime.lastError?.message ?? "could not start download" });
        return;
      }
      downloadId = id;
    });
  });
}

export function downloadFilenameFor(contentId: string, title: string | null): string {
  const safeTitle = (title ?? "video").replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "video";
  return `influencer-butler/video-bump/${contentId}-${safeTitle}.mp4`;
}

// ---- The job ------------------------------------------------------------------

// Starts a bump job and resolves once capture + download finish (success or
// failure) - the part worth waiting on - then continues delete -> wait ->
// reupload in the background on its own. `asin`/`title` seed the job in case
// the capture step cannot improve on them; the edit page's own state is
// always preferred when it answers.
export async function startBrowserBump(
  video: VideoReloadRef,
  mode: "auto" | "assist",
): Promise<{ ok: boolean; message?: string }> {
  const contentId = video.contentId;
  const host = hostFor(video.marketplace);

  const captured = await runStepInTab(editUrl(host, contentId), { kind: "capture", contentId }, BUMP_TAB_DWELL_MS);
  if (!captured.ok || captured.kind !== "capture") {
    return { ok: false, message: describeFailure(captured) };
  }
  if (!captured.videoSrc) {
    return { ok: false, message: "Could not read the video to download it. Open the video's edit page once, then try again." };
  }

  const title = captured.title ?? video.title ?? null;
  const asins = captured.asins.length > 0 ? captured.asins : video.asin ? [video.asin] : [];
  const marketplace = captured.marketplace ?? video.marketplace ?? null;
  const filename = downloadFilenameFor(contentId, title);

  const downloaded = await downloadAndWait(captured.videoSrc, filename);
  if (!downloaded.ok) {
    return { ok: false, message: `Could not download the video (${downloaded.error ?? "unknown error"}).` };
  }

  if (mode === "assist") {
    return { ok: true, message: `Downloaded. Title: "${title ?? "untitled"}". Tags: ${asins.join(", ") || "none"}.` };
  }

  const job: BumpJob = {
    contentId,
    asin: video.asin ?? asins[0] ?? null,
    title,
    asins,
    marketplace,
    downloadFilename: filename,
    status: "deleting",
    resumeAt: null,
    error: null,
    createdAt: Date.now(),
  };
  await writeJob(job);

  // Delete, then schedule the reupload wait. Fire-and-forget: the creator
  // already has their answer (downloaded), and this continues regardless of
  // whether they keep this popup/page open.
  void continueAfterDownload(job, host).catch((error) => {
    log("video-bump", "continueAfterDownload failed", error);
  });

  return { ok: true, message: "Downloaded. Deleting the old video, then waiting before reuploading." };
}

async function continueAfterDownload(job: BumpJob, host: string): Promise<void> {
  const deleted = await runStepInTab(manageUrl(host), { kind: "delete", contentId: job.contentId }, BUMP_TAB_DWELL_MS);
  if (!deleted.ok) {
    await writeJob({ ...job, status: "failed", error: describeFailure(deleted) });
    notify(job, "Could not delete the old video. Your download is saved; you can finish this one manually.");
    return;
  }

  const resumeAt = Date.now() + BUMP_REUPLOAD_WAIT_MS;
  await writeJob({ ...job, status: "waiting", resumeAt });
  try {
    await chrome.alarms.create(`${ALARM_PREFIX}${job.contentId}`, { when: resumeAt });
  } catch (error) {
    log("video-bump", "could not schedule reupload alarm", error);
  }
}

// chrome.alarms.onAlarm wiring (background/index.ts calls this for any alarm
// whose name starts with ALARM_PREFIX).
export async function resumeVideoBump(alarmName: string): Promise<void> {
  const contentId = alarmName.slice(ALARM_PREFIX.length);
  const jobs = await readJobs();
  const job = jobs[contentId];
  if (!job || job.status !== "waiting") return;

  await writeJob({ ...job, status: "reuploading" });
  const host = hostFor(job.marketplace);
  if (!job.downloadFilename) {
    await writeJob({ ...job, status: "failed", error: "missing-download" });
    return;
  }

  // Active (not background) and no dwell timeout: the creator needs to see
  // this tab to attach the file, and may take a while to get to it.
  const result = await runStepInTab(
    newUploadUrl(host),
    { kind: "reupload", title: job.title, asins: job.asins, downloadFilename: job.downloadFilename },
    null,
    true,
  );

  if (result.ok) {
    await writeJob({ ...job, status: "done" });
    notify(job, "Your video was re-uploaded.");
  } else {
    await writeJob({ ...job, status: "failed", error: describeFailure(result) });
    notify(job, "The reupload did not finish. Your download is still saved if you want to finish it by hand.");
  }
}

export function describeFailure(outcome: BumpStepOutcome): string {
  if (outcome.ok) return "";
  switch (outcome.reason) {
    case "blocked":
      return "Amazon showed a robot check. Try again in a bit.";
    case "not-found":
      return "Could not find the video on that page.";
    case "no-src":
      return "The video player never finished loading.";
    case "cancelled":
      return "The tab was closed before it finished.";
    case "tab":
      return "Could not open the page.";
    case "timeout":
      return "That step took too long.";
    default:
      return "Something went wrong.";
  }
}

function notify(job: BumpJob, message: string): void {
  try {
    void chrome.notifications?.create(`video-bump:${job.contentId}:${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Video Reload Butler",
      message,
    });
  } catch {
    // notifications unavailable; the job's stored status is the source of truth
  }
}
