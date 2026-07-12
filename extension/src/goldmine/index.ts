// Instagram Goldmine tab (self-hosted build only). The config + results UI,
// opened in its own tab from the popup so it has room and outlives the popup.
// It does not scrape anything itself: the actual crawl runs same-origin in an
// instagram.com content script (src/instagram/content.ts) that this page drives
// over a direct tab port. Rows arrive here for display / CSV, and the content
// script also emits each as a finding to the background (which syncs to the
// website API and pushes to the desktop app).

import { buildCsv, buildProfileUrl, normalizeHashtag } from "../instagram/helpers";
import { CREATOR_PUSH_CHUNK } from "../shared/constants";
import {
  sendToBackground,
  type HudCommandResult,
  type HudStatus,
} from "../shared/messages";
import type { CreatorRef } from "../transport/hud-commands";
import type {
  GoldmineProgress,
  GoldmineRow,
  GoldmineSettings,
  GoldmineSummary,
} from "../instagram/goldmine";

const SETTINGS_KEY = "ib-ig-settings";
const PORT_NAME = "ib-goldmine";

type FromContent =
  | { type: "progress"; progress: GoldmineProgress }
  | { type: "row"; row: GoldmineRow }
  | { type: "done"; summary: GoldmineSummary }
  | { type: "error"; message: string };

const DEFAULT_SETTINGS: GoldmineSettings = {
  hashtags: [],
  targetUniqueEmails: 200,
  recentDays: 0,
  maxPostsPerHashtag: 200,
  maxFollowers: 0,
  reelsFirst: false,
  safeMode: true,
  followBioLinks: false,
  harvestEngagement: false,
  ignoreRecheckCooldown: false,
};

let rows: GoldmineRow[] = [];
let port: chrome.runtime.Port | null = null;
let running = false;

// Form input handles, populated by render().
const fields = {
  hashtags: null as HTMLTextAreaElement | null,
  targetUniqueEmails: null as HTMLInputElement | null,
  recentDays: null as HTMLInputElement | null,
  maxPostsPerHashtag: null as HTMLInputElement | null,
  maxFollowers: null as HTMLInputElement | null,
  reelsFirst: null as HTMLInputElement | null,
  safeMode: null as HTMLInputElement | null,
  followBioLinks: null as HTMLInputElement | null,
  harvestEngagement: null as HTMLInputElement | null,
  ignoreRecheckCooldown: null as HTMLInputElement | null,
};

const root = () => document.getElementById("root") as HTMLElement;

void init();

async function init(): Promise<void> {
  const saved = await loadSettings();
  render(saved);
}

function render(settings: GoldmineSettings): void {
  const main = root();
  main.replaceChildren();

  const intro = el("p", "muted small");
  intro.textContent =
    "Crawl Instagram hashtags for creator emails, using your own logged-in Instagram session in this browser. Keep an Instagram tab open and signed in.";
  main.append(intro);

  const grid = el("div", "gm-grid");
  grid.append(renderSeeds(settings), renderLimits(settings), renderBehavior(settings));
  main.append(grid);

  main.append(renderActions());
  main.append(renderResultsCard());
  renderResults();
}

function renderSeeds(settings: GoldmineSettings): HTMLElement {
  const card = section("Seeds & filters");

  const tags = field("Hashtags", "One per line. The # is optional.");
  const textarea = el("textarea") as HTMLTextAreaElement;
  textarea.placeholder = "#amazonfinds\n#ugccreator\n#founditonamazon";
  textarea.value = settings.hashtags.join("\n");
  tags.append(textarea);
  fields.hashtags = textarea;
  card.append(tags);

  const mode = field("Run mode");
  const select = el("select") as HTMLSelectElement;
  const opt = el("option") as HTMLOptionElement;
  opt.value = "hashtag";
  opt.textContent = "Hashtags: collect creator emails";
  select.append(opt);
  select.disabled = true;
  mode.append(select);
  card.append(mode);

  return card;
}

function renderLimits(settings: GoldmineSettings): HTMLElement {
  const card = section("Limits");
  fields.targetUniqueEmails = numberField(
    card,
    "Stop after this many emails",
    settings.targetUniqueEmails,
    "Keep crawling until this many unique creator emails are collected. Set 0 for no email target.",
  );
  fields.recentDays = numberField(
    card,
    "Only posts from the last N days",
    settings.recentDays,
    "Skip posts older than this. Set 0 to keep posts of any age.",
  );
  fields.maxPostsPerHashtag = numberField(
    card,
    "Max posts scanned per hashtag",
    settings.maxPostsPerHashtag,
  );
  fields.maxFollowers = numberField(
    card,
    "Skip creators over this many followers",
    settings.maxFollowers,
    "Creators with more followers than this are skipped. Set 0 for no follower cap.",
  );
  return card;
}

function renderBehavior(settings: GoldmineSettings): HTMLElement {
  const card = section("Behavior");
  fields.reelsFirst = toggle(card, "Prioritize Reels over photo posts", settings.reelsFirst);
  fields.safeMode = toggle(card, "Safe mode (2x human delays)", settings.safeMode);
  fields.followBioLinks = toggle(
    card,
    "Also check the bio-link website for an email (slower)",
    settings.followBioLinks,
  );
  fields.harvestEngagement = toggle(card, "Harvest engagement rate", settings.harvestEngagement);
  fields.ignoreRecheckCooldown = toggle(
    card,
    "Recheck creators seen before",
    settings.ignoreRecheckCooldown,
  );
  return card;
}

function renderActions(): HTMLElement {
  const wrap = el("div");

  const actions = el("div", "gm-actions");
  const runBtn = el("button", "primary") as HTMLButtonElement;
  runBtn.id = "gm-run";
  runBtn.textContent = "Run";
  runBtn.onclick = () => void start();

  const stopBtn = el("button", "ghost") as HTMLButtonElement;
  stopBtn.id = "gm-stop";
  stopBtn.textContent = "Stop";
  stopBtn.disabled = true;
  stopBtn.onclick = () => stop();

  const exportBtn = el("button", "ghost") as HTMLButtonElement;
  exportBtn.id = "gm-export";
  exportBtn.textContent = "Export CSV";
  exportBtn.onclick = () => exportCsv();

  const target = el("select") as HTMLSelectElement;
  target.id = "gm-target";
  for (const [value, label] of [
    ["group-invite", "Group Invite Butler"],
    ["pitch", "Pitch Butler"],
  ] as const) {
    const opt = el("option") as HTMLOptionElement;
    opt.value = value;
    opt.textContent = label;
    target.append(opt);
  }

  const sendBtn = el("button", "ghost") as HTMLButtonElement;
  sendBtn.id = "gm-send";
  sendBtn.textContent = "Send to desktop";
  sendBtn.onclick = () => void sendToDesktop(target.value as "pitch" | "group-invite");

  actions.append(runBtn, stopBtn, exportBtn, target, sendBtn);
  wrap.append(actions);

  const status = el("div", "gm-progress");
  status.id = "gm-status";
  wrap.append(status);

  return wrap;
}

function renderResultsCard(): HTMLElement {
  const card = section("Harvested creators");
  const holder = el("div");
  holder.id = "gm-results";
  card.append(holder);
  return card;
}

function renderResults(): void {
  const holder = document.getElementById("gm-results");
  if (!holder) return;
  holder.replaceChildren();

  if (rows.length === 0) {
    const empty = el("div", "gm-empty");
    empty.textContent = "No creators harvested yet.";
    holder.append(empty);
    return;
  }

  const scroll = el("div", "gm-scroll");
  const table = el("table", "gm-table");
  const thead = el("thead");
  const htr = el("tr");
  for (const label of ["Username", "Email", "Hashtag", "Followers", "Engagement", "Post"]) {
    const th = el("th");
    th.textContent = label;
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = el("tbody");
  for (const row of rows) tbody.append(renderRow(row));
  table.append(tbody);
  scroll.append(table);
  holder.append(scroll);
}

function renderRow(row: GoldmineRow): HTMLElement {
  const tr = el("tr");

  const user = el("td");
  const userLink = el("a") as HTMLAnchorElement;
  userLink.href = buildProfileUrl(row.username);
  userLink.target = "_blank";
  userLink.rel = "noopener";
  userLink.textContent = `@${row.username}`;
  user.append(userLink);
  tr.append(user);

  tr.append(textCell(row.email));
  tr.append(textCell(row.sourceHashtag ? `#${row.sourceHashtag}` : ""));
  tr.append(numCell(row.followerCount == null ? "-" : row.followerCount.toLocaleString()));
  tr.append(numCell(row.engagementRatePct == null ? "-" : `${row.engagementRatePct}%`));

  const post = el("td");
  if (row.postUrl) {
    const link = el("a") as HTMLAnchorElement;
    link.href = row.postUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "view";
    post.append(link);
  } else {
    post.textContent = "-";
  }
  tr.append(post);
  return tr;
}

// ── Run control ──────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  if (running) return;
  const settings = readSettings();
  if (settings.hashtags.length === 0) {
    setStatus("Add at least one hashtag.");
    return;
  }
  await saveSettings(settings);

  if (settings.followBioLinks) {
    const granted = await requestBioLinkPermission();
    if (!granted) {
      setStatus("Bio-link checking needs permission to read other sites. Allow it, or turn that toggle off.");
      return;
    }
  }

  setStatus("Opening Instagram...");
  let tabId: number;
  try {
    tabId = await ensureInstagramTab();
  } catch {
    setStatus("Could not open Instagram. Open a logged-in Instagram tab and try again.");
    return;
  }

  const connected = await connectWithRetry(tabId);
  if (!connected) {
    setStatus("Open or reload a logged-in Instagram tab, then Run again.");
    return;
  }
  port = connected;

  rows = [];
  renderResults();
  running = true;
  setRunningUi(true);
  setStatus("Starting crawl...");

  port.onMessage.addListener((msg: FromContent) => handleContentMessage(msg));
  port.onDisconnect.addListener(() => {
    if (running) {
      setStatus("Instagram tab closed. Crawl stopped.");
      finishRun();
    }
  });

  port.postMessage({ type: "run", settings });
}

function handleContentMessage(msg: FromContent): void {
  switch (msg.type) {
    case "progress":
      setStatus(progressLine(msg.progress));
      break;
    case "row":
      rows.push(msg.row);
      renderResults();
      break;
    case "done":
      setStatus(doneLine(msg.summary));
      finishRun();
      break;
    case "error":
      setStatus(`Crawl error: ${msg.message}`);
      finishRun();
      break;
  }
}

function stop(): void {
  try {
    port?.postMessage({ type: "stop" });
  } catch {
    // port already gone
  }
  setStatus("Stopping...");
}

function finishRun(): void {
  running = false;
  setRunningUi(false);
  try {
    port?.disconnect();
  } catch {
    // ignore
  }
  port = null;
}

function progressLine(p: GoldmineProgress): string {
  const tag = p.hashtag ? `#${p.hashtag} ` : "";
  return `${tag}(${p.hashtagsDone}/${p.hashtagsTotal} tags): ${p.postsScanned} posts scanned, ${p.profilesVisited} profiles, ${p.uniqueEmails} emails. Over cap ${p.authorsOverCap}, rechecked-skip ${p.skippedRecheck}.`;
}

function doneLine(s: GoldmineSummary): string {
  const why = {
    done: "Finished",
    target: "Email target reached",
    abort: "Stopped",
    blocked: `Instagram paused us (${s.blockedReason ?? "rate limit"}); stopped cleanly`,
  }[s.stopped];
  return `${why}: ${s.uniqueEmails} emails from ${s.profilesVisited} profiles (${s.postsScanned} posts scanned).`;
}

// ── Sinks ────────────────────────────────────────────────────────────────────

function exportCsv(): void {
  if (rows.length === 0) {
    setStatus("Nothing to export yet.");
    return;
  }
  const columns = [
    "profileUsername",
    "creatorEmail",
    "sourceHashtag",
    "fullName",
    "followerCount",
    "engagementRatePct",
    "bioLinkUrl",
    "postUrl",
  ];
  const records = rows.map((r) => ({
    profileUsername: r.username,
    creatorEmail: r.email,
    sourceHashtag: r.sourceHashtag,
    fullName: r.fullName ?? "",
    followerCount: r.followerCount ?? "",
    engagementRatePct: r.engagementRatePct ?? "",
    bioLinkUrl: r.bioLinkUrl ?? "",
    postUrl: r.postUrl ?? "",
  }));
  const csv = buildCsv(records, columns);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "instagram-goldmine.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function sendToDesktop(target: "pitch" | "group-invite"): Promise<void> {
  if (rows.length === 0) {
    setStatus("Nothing to send yet.");
    return;
  }
  const status = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
  if (!status.connected) {
    setStatus("The Influencer Butler app is not connected. Open it and pair the extension in the popup.");
    return;
  }

  const creators = rows.map(toCreatorRef);
  let sent = 0;
  let lastMessage = "";
  for (let i = 0; i < creators.length; i += CREATOR_PUSH_CHUNK) {
    const chunk = creators.slice(i, i + CREATOR_PUSH_CHUNK);
    const result = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "creator.push.batch", target, creators: chunk },
    });
    if (!result.ok) {
      lastMessage = result.message ?? "The app is not connected.";
      break;
    }
    sent += chunk.length;
  }
  const dest = target === "pitch" ? "Pitch Butler" : "Group Invite Butler";
  setStatus(sent > 0 ? `Sent ${sent} to ${dest}.` : lastMessage || "The app is not connected.");
}

function toCreatorRef(row: GoldmineRow): CreatorRef {
  return {
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    sourceHashtag: row.sourceHashtag,
    followerCount: row.followerCount,
    engagementRatePct: row.engagementRatePct,
    profileUrl: buildProfileUrl(row.username),
  };
}

// ── Instagram tab plumbing ───────────────────────────────────────────────────

async function ensureInstagramTab(): Promise<number> {
  const tabs = await chrome.tabs.query({
    url: ["*://www.instagram.com/*", "*://instagram.com/*"],
  });
  const existing = tabs.find((t) => t.id != null);
  if (existing?.id != null) return existing.id;
  const created = await chrome.tabs.create({ url: "https://www.instagram.com/", active: true });
  const id = created.id;
  if (id == null) throw new Error("no tab id");
  await waitForComplete(id);
  return id;
}

// Try to connect to the content script; if the tab predates the extension (no
// content script yet), reload it once and retry.
async function connectWithRetry(tabId: number): Promise<chrome.runtime.Port | null> {
  const first = await tryConnect(tabId);
  if (first) return first;
  try {
    await chrome.tabs.reload(tabId);
    await waitForComplete(tabId);
    await delay(600);
  } catch {
    return null;
  }
  return tryConnect(tabId);
}

function tryConnect(tabId: number): Promise<chrome.runtime.Port | null> {
  return new Promise((resolve) => {
    let p: chrome.runtime.Port;
    try {
      p = chrome.tabs.connect(tabId, { name: PORT_NAME });
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const onDisconnect = () => {
      if (settled) return;
      settled = true;
      resolve(null); // nothing listening: content script not present
    };
    p.onDisconnect.addListener(onDisconnect);
    // The content script keeps the port open; a missing receiver disconnects
    // right away. Surviving a short window means it is live.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      p.onDisconnect.removeListener(onDisconnect);
      resolve(p);
    }, 350);
  });
}

function waitForComplete(tabId: number, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t.status === "complete") finish();
      })
      .catch(() => finish());
    setTimeout(finish, timeoutMs);
  });
}

async function requestBioLinkPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ["https://*/*"] });
  } catch {
    return false;
  }
}

// ── Settings persistence ─────────────────────────────────────────────────────

function readSettings(): GoldmineSettings {
  return {
    hashtags: parseHashtags(fields.hashtags?.value ?? ""),
    targetUniqueEmails: intFrom(fields.targetUniqueEmails, DEFAULT_SETTINGS.targetUniqueEmails),
    recentDays: intFrom(fields.recentDays, DEFAULT_SETTINGS.recentDays),
    maxPostsPerHashtag: intFrom(fields.maxPostsPerHashtag, DEFAULT_SETTINGS.maxPostsPerHashtag),
    maxFollowers: intFrom(fields.maxFollowers, DEFAULT_SETTINGS.maxFollowers),
    reelsFirst: Boolean(fields.reelsFirst?.checked),
    safeMode: Boolean(fields.safeMode?.checked),
    followBioLinks: Boolean(fields.followBioLinks?.checked),
    harvestEngagement: Boolean(fields.harvestEngagement?.checked),
    ignoreRecheckCooldown: Boolean(fields.ignoreRecheckCooldown?.checked),
  };
}

function parseHashtags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/[\n,]+/)) {
    const tag = normalizeHashtag(line);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

async function loadSettings(): Promise<GoldmineSettings> {
  try {
    const out = await chrome.storage.local.get(SETTINGS_KEY);
    const raw = out?.[SETTINGS_KEY] as Partial<GoldmineSettings> | undefined;
    if (raw && typeof raw === "object") return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    // fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings: GoldmineSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch {
    // best effort
  }
}

// ── Small DOM helpers ────────────────────────────────────────────────────────

function setRunningUi(isRunning: boolean): void {
  byId<HTMLButtonElement>("gm-run").disabled = isRunning;
  byId<HTMLButtonElement>("gm-stop").disabled = !isRunning;
}

function setStatus(text: string): void {
  const status = document.getElementById("gm-status");
  if (status) status.textContent = text;
}

function section(heading: string): HTMLElement {
  const card = el("section", "card");
  const h = el("h2", "cat");
  h.textContent = heading;
  card.append(h);
  return card;
}

function field(label: string, hint?: string): HTMLElement {
  const wrap = el("label", "gm-field");
  const span = el("span");
  span.textContent = label;
  if (hint) {
    const h = el("span", "hint");
    h.textContent = hint;
    span.append(h);
  }
  wrap.append(span);
  return wrap;
}

function numberField(
  card: HTMLElement,
  label: string,
  value: number,
  hint?: string,
): HTMLInputElement {
  const wrap = field(label, hint);
  const input = el("input") as HTMLInputElement;
  input.type = "number";
  input.min = "0";
  input.value = String(value);
  wrap.append(input);
  card.append(wrap);
  return input;
}

function toggle(card: HTMLElement, label: string, checked: boolean): HTMLInputElement {
  const wrap = el("label", "gm-toggle");
  const box = el("input") as HTMLInputElement;
  box.type = "checkbox";
  box.checked = checked;
  const span = el("span");
  span.textContent = label;
  wrap.append(box, span);
  card.append(wrap);
  return box;
}

function intFrom(input: HTMLInputElement | null, fallback: number): number {
  const parsed = parseInt(input?.value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function textCell(text: string): HTMLElement {
  const td = el("td");
  td.textContent = text;
  return td;
}

function numCell(text: string): HTMLElement {
  const td = el("td", "gm-num");
  td.textContent = text;
  return td;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`goldmine element missing: ${id}`);
  return node as T;
}
