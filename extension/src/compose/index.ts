import { sendToBackground } from "../shared/messages";
import type {
  CancelSocialPostResult,
  GenSocialCaptionResult,
  ListSocialPostsResult,
  ScheduleSocialPostResult,
  UploadSocialImageResult,
} from "../shared/messages";
import { getState, getIntegration } from "../storage/store";
import type {
  CaptionEngine,
  SocialPostInput,
  SocialPostRecord,
  SocialSchedule,
} from "../shared/social";

// The compose page for the "click an image, schedule a post" flow. Opened as a
// small popup window from the right-click menu or a retailer "Schedule" action,
// carrying the source image + page in the URL query. It builds a SocialPostInput
// and hands it to the background (Bearer-authed) to create a scheduled post the
// desktop app then publishes.

const $ = (id: string): HTMLElement | null => document.getElementById(id);
const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const ctx = {
  imageUrl: params.get("src"),
  pageUrl: params.get("page"),
  title: params.get("title"),
};

// Uploaded-image state: when the creator picks a file (fallback path), we hold
// the returned storage path so the scheduled post uses image_source 'upload'.
let uploadedPath: string | null = null;

function setStatus(el: HTMLElement | null, text: string, kind?: "ok" | "err"): void {
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.classList.remove("status-ok", "status-err");
  if (kind === "ok") el.classList.add("status-ok");
  if (kind === "err") el.classList.add("status-err");
}

// ---- Image ----------------------------------------------------------------

function initImage(): void {
  const preview = byId<HTMLImageElement>("image-preview");
  const none = $("image-none");
  const warn = $("image-warn");
  if (ctx.imageUrl) {
    preview.src = ctx.imageUrl;
    preview.hidden = false;
    if (none) none.hidden = true;
    preview.addEventListener("error", () => {
      // The source cannot be loaded here (and likely not server-side either):
      // nudge the creator to upload the bytes instead.
      preview.hidden = true;
      if (warn) warn.hidden = false;
      if (none) none.hidden = false;
    });
  }

  const fileInput = byId<HTMLInputElement>("image-file");
  const fileStatus = $("image-file-status");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setStatus(fileStatus, "That image is too large (max 12 MB).", "err");
      return;
    }
    setStatus(fileStatus, "Uploading...");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      void sendToBackground<UploadSocialImageResult>({ kind: "UPLOAD_SOCIAL_IMAGE", dataUrl }).then(
        (res) => {
          if (!res.ok || !res.url) {
            setStatus(fileStatus, res.error ?? "Upload failed.", "err");
            return;
          }
          uploadedPath = res.path ?? null;
          preview.src = res.url;
          preview.hidden = false;
          if (none) none.hidden = true;
          if (warn) warn.hidden = true;
          setStatus(fileStatus, "Image ready.", "ok");
        },
      );
    };
    reader.onerror = () => setStatus(fileStatus, "Could not read that file.", "err");
    reader.readAsDataURL(file);
  });
}

// ---- Caption --------------------------------------------------------------

async function initCaption(): Promise<void> {
  const engineSel = byId<HTMLSelectElement>("caption-engine");
  // Hide the "My OpenAI key" option unless a key is actually connected.
  try {
    const openai = await getIntegration("openai");
    if (!openai.credentialsEnc) {
      const opt = Array.from(engineSel.options).find((o) => o.value === "openai");
      if (opt) {
        opt.disabled = true;
        opt.text = "My OpenAI key (connect in Settings)";
      }
    }
  } catch {
    // ignore: default to the free engine
  }

  const captionEl = byId<HTMLTextAreaElement>("caption");
  const statusEl = $("caption-status");
  const altsEl = $("caption-alts");
  const btn = byId<HTMLButtonElement>("caption-generate");

  btn.addEventListener("click", () => {
    const engine = engineSel.value as CaptionEngine;
    btn.disabled = true;
    setStatus(statusEl, "Drafting...");
    if (altsEl) {
      altsEl.hidden = true;
      altsEl.textContent = "";
    }
    void sendToBackground<GenSocialCaptionResult>({
      kind: "GEN_SOCIAL_CAPTION",
      input: {
        engine,
        topic: ctx.title,
        productTitle: ctx.title,
        imageUrl: ctx.imageUrl,
        pageUrl: ctx.pageUrl,
        tone: null,
        locale: null,
      },
    }).then((res) => {
      btn.disabled = false;
      if (!res.ok || !res.caption) {
        setStatus(statusEl, res.error ?? "Could not draft a caption.", "err");
        return;
      }
      captionEl.value = res.caption;
      setStatus(statusEl, "Draft ready. Edit it however you like.", "ok");
      if (altsEl && res.alts && res.alts.length) {
        altsEl.hidden = false;
        for (const alt of res.alts) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "alt";
          b.textContent = alt;
          b.addEventListener("click", () => {
            captionEl.value = alt;
          });
          altsEl.append(b);
        }
      }
    });
  });
}

// ---- Destinations ---------------------------------------------------------

function initDestinations(): void {
  const useDefault = byId<HTMLInputElement>("dest-default");
  const list = $("dest-list");
  const sync = () => {
    if (list) list.hidden = useDefault.checked;
  };
  useDefault.addEventListener("change", sync);
  sync();
}

function collectDestinations(): string[] | null {
  const useDefault = byId<HTMLInputElement>("dest-default");
  if (useDefault.checked) return null;
  const list = $("dest-list");
  if (!list) return null;
  const checked = Array.from(list.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")).map(
    (c) => c.value,
  );
  return checked.length ? checked : null;
}

// ---- When (mode + mini calendar) -----------------------------------------

const cal = {
  view: new Date(),
  selected: null as Date | null,
  busy: new Set<string>(),
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function renderCalendar(): void {
  const root = $("mini-calendar");
  if (!root) return;
  root.textContent = "";
  const today = startOfDay(new Date());
  const year = cal.view.getFullYear();
  const month = cal.view.getMonth();

  const head = document.createElement("div");
  head.className = "mini-cal-head";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "<";
  prev.addEventListener("click", () => {
    cal.view = new Date(year, month - 1, 1);
    renderCalendar();
  });
  const title = document.createElement("span");
  title.className = "mini-cal-title";
  title.textContent = cal.view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = ">";
  next.addEventListener("click", () => {
    cal.view = new Date(year, month + 1, 1);
    renderCalendar();
  });
  head.append(prev, title, next);
  root.append(head);

  const grid = document.createElement("div");
  grid.className = "mini-cal-grid";
  for (const dow of ["S", "M", "T", "W", "T", "F", "S"]) {
    const c = document.createElement("div");
    c.className = "mini-cal-dow";
    c.textContent = dow;
    grid.append(c);
  }

  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Leading blanks.
  for (let i = 0; i < startDow; i += 1) {
    const blank = document.createElement("div");
    blank.className = "mini-cal-day other";
    grid.append(blank);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const cell = document.createElement("div");
    cell.className = "mini-cal-day";
    cell.textContent = String(day);
    const key = ymd(date);
    if (startOfDay(date) < today) {
      cell.classList.add("past");
    } else {
      cell.addEventListener("click", () => {
        cal.selected = date;
        byId<HTMLInputElement>("once-date").value = key;
        renderCalendar();
      });
    }
    if (cal.selected && ymd(cal.selected) === key) cell.classList.add("selected");
    if (cal.busy.has(key)) {
      const dot = document.createElement("span");
      dot.className = "dot";
      cell.append(dot);
    }
    grid.append(cell);
  }
  root.append(grid);
}

function initWhen(): void {
  // Default the once-date to tomorrow at the preset time.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  cal.selected = startOfDay(tomorrow);
  cal.view = new Date(tomorrow);
  byId<HTMLInputElement>("once-date").value = ymd(tomorrow);
  byId<HTMLInputElement>("once-date").addEventListener("change", (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (value) {
      cal.selected = new Date(`${value}T00:00`);
      cal.view = new Date(cal.selected);
      renderCalendar();
    }
  });
  renderCalendar();

  // Mode segmented control.
  const seg = $("mode-seg");
  const oncePanel = $("mode-once");
  const everPanel = $("mode-evergreen");
  seg?.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      if (oncePanel) oncePanel.hidden = mode !== "once";
      if (everPanel) everPanel.hidden = mode !== "evergreen";
    });
  });

  // Repeat frequency panels.
  const freq = byId<HTMLSelectElement>("repeat-freq");
  const panels: Record<string, string> = {
    daily: "repeat-daily",
    weekly: "repeat-weekly",
    hours: "repeat-hours",
  };
  const syncFreq = () => {
    for (const [value, id] of Object.entries(panels)) {
      const p = $(id);
      if (p) p.hidden = freq.value !== value;
    }
  };
  freq.addEventListener("change", syncFreq);
  syncFreq();
}

function currentMode(): "once" | "evergreen" {
  const active = $("mode-seg")?.querySelector(".seg-btn.active") as HTMLElement | null;
  return active?.dataset.mode === "evergreen" ? "evergreen" : "once";
}

function buildOnceAt(): string | null {
  const date = byId<HTMLInputElement>("once-date").value;
  const time = byId<HTMLInputElement>("once-time").value || "09:00";
  if (!date) return null;
  const dt = new Date(`${date}T${time}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

// Compute the next occurrence of HH:MM from now, as an ISO anchor.
function nextTimeAnchor(time: string): string {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const now = new Date();
  const anchor = new Date();
  anchor.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  if (anchor <= now) anchor.setDate(anchor.getDate() + 1);
  return anchor.toISOString();
}

function buildSchedule(): SocialSchedule | null {
  const freq = byId<HTMLSelectElement>("repeat-freq").value;
  if (freq === "daily") {
    const time = byId<HTMLInputElement>("daily-time").value || "09:00";
    return { type: "interval", everyHours: 24, anchorAt: nextTimeAnchor(time) };
  }
  if (freq === "hours") {
    const every = parseInt(byId<HTMLInputElement>("hours-every").value, 10);
    if (!Number.isFinite(every) || every < 1) return null;
    return { type: "interval", everyHours: every };
  }
  // weekly
  const days = Array.from(
    byId<HTMLElement>("weekly-days").querySelectorAll<HTMLInputElement>("input:checked"),
  ).map((c) => parseInt(c.value, 10));
  if (days.length === 0) return null;
  const time = byId<HTMLInputElement>("weekly-time").value || "09:00";
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return { type: "weekly", days, hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 };
}

// ---- Schedule -------------------------------------------------------------

function initSchedule(): void {
  const btn = byId<HTMLButtonElement>("schedule-btn");
  const status = $("schedule-status");
  btn.addEventListener("click", () => {
    const caption = byId<HTMLTextAreaElement>("caption").value.trim();

    // Resolve the image source.
    let image_source: SocialPostInput["image_source"] = "none";
    let image_url: string | null = null;
    let image_path: string | null = null;
    if (uploadedPath) {
      image_source = "upload";
      image_path = uploadedPath;
    } else if (ctx.imageUrl) {
      image_source = "url";
      image_url = ctx.imageUrl;
    }

    if (image_source === "none" && !caption) {
      setStatus(status, "Add a caption or an image first.", "err");
      return;
    }

    const mode = currentMode();
    let scheduled_at: string | null = null;
    let schedule: SocialSchedule | null = null;
    if (mode === "once") {
      scheduled_at = buildOnceAt();
      if (!scheduled_at) {
        setStatus(status, "Pick a date and time.", "err");
        return;
      }
    } else {
      schedule = buildSchedule();
      if (!schedule) {
        setStatus(status, "Set how often to repeat (pick at least one weekday for weekly).", "err");
        return;
      }
    }

    const post: SocialPostInput = {
      title: ctx.title,
      caption: caption || null,
      link: byId<HTMLInputElement>("link").value.trim() || null,
      link_in_first_comment: byId<HTMLInputElement>("link-first-comment").checked,
      image_source,
      image_url,
      image_path,
      destinations: collectDestinations(),
      mode,
      scheduled_at,
      schedule,
      page_url: ctx.pageUrl,
    };

    btn.disabled = true;
    setStatus(status, "Scheduling...");
    void sendToBackground<ScheduleSocialPostResult>({ kind: "SCHEDULE_SOCIAL_POST", post }).then(
      (res) => {
        btn.disabled = false;
        if (!res.ok) {
          setStatus(status, res.error ?? "Could not schedule.", "err");
          return;
        }
        setStatus(status, "Scheduled. Your desktop app will post it.", "ok");
        void loadUpcoming();
      },
    );
  });
}

// ---- Upcoming -------------------------------------------------------------

function describeWhen(post: SocialPostRecord): string {
  if (post.mode === "once" && post.scheduled_at) {
    return new Date(post.scheduled_at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const s = post.schedule;
  if (s?.type === "interval") return `Every ${s.everyHours} hours`;
  if (s?.type === "weekly") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const list = s.days.map((d) => names[d]).join(", ");
    return `Weekly: ${list} at ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  }
  return "Scheduled";
}

async function loadUpcoming(): Promise<void> {
  const listEl = $("upcoming-list");
  const empty = $("upcoming-empty");
  if (!listEl) return;
  const res = await sendToBackground<ListSocialPostsResult>({ kind: "LIST_SOCIAL_POSTS", limit: 50 });
  listEl.textContent = "";
  cal.busy = new Set();
  const posts = res.ok ? res.posts : [];
  const visible = posts.filter((p) => p.status !== "canceled");
  if (visible.length === 0) {
    if (empty) empty.hidden = false;
    renderCalendar();
    return;
  }
  if (empty) empty.hidden = true;
  for (const post of visible) {
    if (post.mode === "once" && post.scheduled_at) {
      cal.busy.add(ymd(new Date(post.scheduled_at)));
    }
    const li = document.createElement("li");

    const imgSrc = post.image_source === "upload" ? null : post.image_url;
    if (imgSrc) {
      const thumb = document.createElement("img");
      thumb.className = "up-thumb";
      thumb.src = imgSrc;
      thumb.alt = "";
      li.append(thumb);
    }

    const main = document.createElement("div");
    main.className = "up-main";
    const when = document.createElement("div");
    when.className = "up-when";
    when.textContent = describeWhen(post);
    const cap = document.createElement("div");
    cap.className = "up-cap";
    cap.textContent = post.caption || post.title || "(no caption)";
    main.append(when, cap);
    li.append(main);

    const status = document.createElement("span");
    status.className = `up-status ${post.status}`;
    status.textContent = post.status;
    li.append(status);

    if (post.status === "pending") {
      const cancel = document.createElement("button");
      cancel.className = "up-cancel";
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        cancel.disabled = true;
        void sendToBackground<CancelSocialPostResult>({ kind: "CANCEL_SOCIAL_POST", id: post.id }).then(
          (r) => {
            if (r.ok) void loadUpcoming();
            else cancel.disabled = false;
          },
        );
      });
      li.append(cancel);
    }

    listEl.append(li);
  }
  renderCalendar();
}

// ---- Boot -----------------------------------------------------------------

async function main(): Promise<void> {
  const state = await getState();
  if (!state.auth.licenseKey) {
    const need = $("need-key");
    const body = $("compose-body");
    if (need) need.hidden = false;
    if (body) body.hidden = true;
    return;
  }
  initImage();
  await initCaption();
  initDestinations();
  initWhen();
  initSchedule();
  await loadUpcoming();
}

void main();
