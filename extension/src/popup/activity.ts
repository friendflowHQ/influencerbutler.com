import { getLocale } from "../i18n";
import { formatAge } from "../shared/format-age";
import {
  summarizeActivity,
  WINDOW_DAY_MS,
  WINDOW_WEEK_MS,
  type ActivityEvent,
  type ActivitySummary,
} from "../shared/activity-summary";
import type { DesktopActivityEntry } from "../shared/desktop-activity";
import { ACCEPT_LEDGER_KEY } from "../shared/constants";

// The popup's "Activity" card: what the extension did in the last 24 hours or 7
// days (campaigns accepted, items sent to the desktop app, problems). Read-only
// and local: it only reads keys the extension already keeps.

type Copy = {
  heading: string;
  day: string;
  week: string;
  empty: string;
  counts: (s: ActivitySummary["counts"]) => string;
  event: (e: ActivityEvent) => string;
  report: string;
};

const EN: Copy = {
  heading: "Activity",
  day: "24 hours",
  week: "7 days",
  empty: "Nothing yet. Accepted campaigns, items sent to the desktop app and problems will show up here.",
  counts: (c) => {
    const parts = [`${c.accepted} accepted${c.acceptedAuto ? ` (${c.acceptedAuto} automatic)` : ""}`, `${c.sentToApp} sent to the app`];
    if (c.failures) parts.push(`${c.failures} problem${c.failures === 1 ? "" : "s"}`);
    return parts.join(", ");
  },
  event: (e) =>
    e.kind === "accepted-auto"
      ? `Accepted a campaign automatically`
      : e.kind === "accepted-manual"
        ? `You accepted a campaign`
        : e.kind === "accepted"
          ? `Accepted a campaign`
          : e.kind === "sent"
            ? `Sent to the app: ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
            : e.kind === "send-failed"
              ? `Could not reach the app: ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
              : `A tool had a problem: ${e.detail}`,
  report: "Report",
};
const ES: Copy = {
  heading: "Actividad",
  day: "24 horas",
  week: "7 dias",
  empty: "Nada todavia. Aqui apareceran las campanas aceptadas, lo enviado a la app de escritorio y los problemas.",
  counts: (c) => {
    const parts = [`${c.accepted} aceptadas${c.acceptedAuto ? ` (${c.acceptedAuto} automaticas)` : ""}`, `${c.sentToApp} enviados a la app`];
    if (c.failures) parts.push(`${c.failures} problema${c.failures === 1 ? "" : "s"}`);
    return parts.join(", ");
  },
  event: (e) =>
    e.kind === "accepted-auto"
      ? `Campana aceptada automaticamente`
      : e.kind === "accepted-manual"
        ? `Aceptaste una campana`
        : e.kind === "accepted"
          ? `Campana aceptada`
          : e.kind === "sent"
            ? `Enviado a la app: ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
            : e.kind === "send-failed"
              ? `No se pudo contactar la app: ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
              : `Una herramienta tuvo un problema: ${e.detail}`,
  report: "Informar",
};
const FR: Copy = {
  heading: "Activite",
  day: "24 heures",
  week: "7 jours",
  empty: "Rien pour l'instant. Les campagnes acceptees, les envois a l'application de bureau et les problemes apparaitront ici.",
  counts: (c) => {
    const parts = [`${c.accepted} acceptee${c.accepted === 1 ? "" : "s"}${c.acceptedAuto ? ` (${c.acceptedAuto} automatique${c.acceptedAuto === 1 ? "" : "s"})` : ""}`, `${c.sentToApp} envoye${c.sentToApp === 1 ? "" : "s"} a l'appli`];
    if (c.failures) parts.push(`${c.failures} probleme${c.failures === 1 ? "" : "s"}`);
    return parts.join(", ");
  },
  event: (e) =>
    e.kind === "accepted-auto"
      ? `Campagne acceptee automatiquement`
      : e.kind === "accepted-manual"
        ? `Vous avez accepte une campagne`
        : e.kind === "accepted"
          ? `Campagne acceptee`
          : e.kind === "sent"
            ? `Envoye a l'appli : ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
            : e.kind === "send-failed"
              ? `Appli injoignable : ${e.detail}${e.count > 1 ? ` (x${e.count})` : ""}`
              : `Un outil a rencontre un probleme : ${e.detail}`,
  report: "Signaler",
};

function copy(): Copy {
  const locale = String(getLocale());
  return locale.startsWith("es") ? ES : locale.startsWith("fr") ? FR : EN;
}

type Raw = Record<string, unknown>;

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Raw[]) : [];
}

async function load(windowMs: number): Promise<ActivitySummary> {
  const got = (await chrome.storage.local.get([ACCEPT_LEDGER_KEY, "ib-desktop-activity", "ib-breakage"])) as Raw;
  const ledger = (got[ACCEPT_LEDGER_KEY] && typeof got[ACCEPT_LEDGER_KEY] === "object" ? got[ACCEPT_LEDGER_KEY] : {}) as Raw;
  const items = asArray(ledger.items)
    .filter((i) => typeof i.campaignId === "string" && typeof i.at === "number")
    .map((i) => ({ campaignId: i.campaignId as string, at: i.at as number, source: i.source === "auto" ? ("auto" as const) : ("manual" as const) }));
  const history = asArray(ledger.history)
    .filter((h) => typeof h.campaignId === "string" && typeof h.at === "number")
    .map((h) => ({ campaignId: h.campaignId as string, at: h.at as number }));
  const desktop = asArray(got["ib-desktop-activity"]).filter(
    (d) => typeof d.at === "number" && typeof d.action === "string",
  ) as unknown as DesktopActivityEntry[];
  const breakage = (got["ib-breakage"] && typeof got["ib-breakage"] === "object" ? got["ib-breakage"] : {}) as Record<string, { lastAt?: number }>;
  return summarizeActivity({ ledgerItems: items, ledgerHistory: history, desktop, breakage, now: Date.now(), windowMs });
}

export async function renderActivityCard(): Promise<void> {
  const card = document.getElementById("activity-card");
  if (!card) return;
  const c = copy();
  const locale = String(getLocale());
  const heading = document.getElementById("activity-heading");
  const dayBtn = document.getElementById("activity-day") as HTMLButtonElement | null;
  const weekBtn = document.getElementById("activity-week") as HTMLButtonElement | null;
  const counts = document.getElementById("activity-counts");
  const list = document.getElementById("activity-list");
  const empty = document.getElementById("activity-empty");
  if (!heading || !dayBtn || !weekBtn || !counts || !list || !empty) return;
  heading.textContent = c.heading;
  dayBtn.textContent = c.day;
  weekBtn.textContent = c.week;

  const paint = async (windowMs: number): Promise<void> => {
    dayBtn.setAttribute("aria-pressed", String(windowMs === WINDOW_DAY_MS));
    weekBtn.setAttribute("aria-pressed", String(windowMs === WINDOW_WEEK_MS));
    let summary: ActivitySummary;
    try {
      summary = await load(windowMs);
    } catch {
      summary = { counts: { accepted: 0, acceptedAuto: 0, sentToApp: 0, failures: 0 }, events: [] };
    }
    list.replaceChildren();
    const none = summary.events.length === 0;
    empty.textContent = c.empty;
    empty.hidden = !none;
    counts.hidden = none;
    counts.textContent = none ? "" : c.counts(summary.counts);
    for (const event of summary.events) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      const age = formatAge(new Date(event.at).toISOString(), Date.now(), locale);
      text.textContent = `${c.event(event)}${age ? ` · ${age}` : ""}`;
      li.append(text);
      if (event.kind === "send-failed" || event.kind === "tool-problem") {
        const report = document.createElement("button");
        report.type = "button";
        report.className = "secondary small";
        report.textContent = c.report;
        report.addEventListener("click", () => {
          window.dispatchEvent(
            new CustomEvent("ib-open-report", {
              detail: { title: c.event(event), description: `${c.event(event)}\n\nWhen: ${new Date(event.at).toISOString()}` },
            }),
          );
        });
        li.append(" ", report);
      }
      list.append(li);
    }
  };

  dayBtn.onclick = () => void paint(WINDOW_DAY_MS);
  weekBtn.onclick = () => void paint(WINDOW_WEEK_MS);
  await paint(WINDOW_DAY_MS);
}
