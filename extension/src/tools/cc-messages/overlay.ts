import { getLocale, t } from "../../i18n";
import { log } from "../../shared/log";
import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { sendToBackground, type AcceptOutcome, type AcceptResult } from "../../shared/messages";
import type { Settings } from "../../storage/schema";
import { subscribeMessagesWidget } from "../cc-widget/observer";
import { describeAcceptResult } from "../campaigns/accept";
import { setChatBubbleAvoid } from "../chat-bubble/panel";
import { getBrandSignals, onBrandSignalsChanged } from "../brand-keywords/overlay";
import { normalizeBrand } from "../brand-keywords/normalize";
import {
  findConversationRows,
  findListRowBrandEl,
  findMessagesWidget,
  findThreadHeader,
  readThreadBrand,
} from "../brand-keywords/selectors";
import { lookupBrandEntry, summarizeBrand, type BrandEntry, type BrandSummary } from "./brand-index";
import {
  getIndex,
  getNotes,
  isAccepted,
  loadStored,
  noteAccepted,
  readSavedFilter,
  refreshLedger,
  resetData,
  saveFilter,
  saveNotes,
  mergeGrid,
  startFeeds,
} from "./data";
import {
  CARD_HOST_CLASS,
  DUPE_HOST_CLASS,
  FILTER_HOST_CLASS,
  MORE_HOST_CLASS,
  STRIP_HOST_CLASS,
  hiddenSignature,
  hideBubble,
  insertOnOwnLine,
  readRowUnread,
  readThreadBubbles,
  readThreadText,
  restoreAllHidden,
  showBubble,
} from "./dom";
import { findDuplicateIndexes, normalizeMessageText } from "./dupes";
import { buildFilterBar, filterBarSignature, formatCount, type BuiltFilterBar, type FilterBarModel } from "./filterbar";
import { INBOX_STALE_MS, type InboxCache } from "./inbox-cache";
import { getInbox, markConversationRead, subscribeInbox } from "./inbox-store";
import {
  MAX_MORE_ITEMS,
  MORE_STEP,
  buildInboxView,
  inboxFacts,
  matchesQuery,
  threadProgress,
  visibleExtras,
  type DomFact,
  type InboxView,
  type MoreItem,
} from "./inbox-view";
import { extractMessageLinks } from "./links";
import { buildMoreList, moreListSignature, type MoreListModel } from "./more-list";
import { openBrandConversation } from "./open-conversation";
import { getBrandNote, setBrandNote } from "./notes";
import { buildStrip, stripSignature, type StripModel } from "./strip";
import { buildCard, cardSignature, type CardModel } from "./thread-card";
import {
  TRIAGE_FILTERS,
  countMatches,
  isTriageFilter,
  matchesFilter,
  type RowFacts,
  type TriageFilter,
} from "./triage";
import { formatAgo, formatWhen, numericDate } from "./when";

// Message Cards: the richer Creator Connections Messages drawer. A status strip
// under each conversation's brand name, a brand card above an open thread (with
// the links pulled out of the brand's message, a note, and Accept), duplicate
// brand blasts folded, an inbox filter bar with brand search, and the
// conversations the drawer does not render listed after its rows. It runs from
// the campaigns the page has already loaded (tools/cc-messages/data.ts), so it
// works with the desktop app closed; the app's keyword and cadence answers (read
// through brand-keywords) only add extras. Like Brand Keywords, it lives on the
// floating widget that mounts, unmounts and toggles between a list and a thread
// on the same /p/connect/* route, so it subscribes to the shared widget observer
// and is torn down explicitly on every SPA navigation.

const RESWEEP_DEBOUNCE_MS = 200;

let unsubscribe: (() => void) | null = null;
let unsubscribeSignals: (() => void) | null = null;
let unsubscribeInbox: (() => void) | null = null;
let epoch = 0;
let settingsRef: Settings | null = null;
let resweepTimer: number | null = null;

let activeFilter: TriageFilter = "all";
let query = "";
let moreLimit = MAX_MORE_ITEMS;

type RowEntry = { host: HTMLElement | null; sig: string };
const rowEntries = new Map<HTMLElement, RowEntry>();
let filterBar: { built: BuiltFilterBar; sig: string } | null = null;
let moreList: { host: HTMLElement; sig: string } | null = null;
let card: { host: HTMLElement; sig: string; brand: string } | null = null;
const dupeBars = new Map<HTMLElement, HTMLElement>();
// Duplicate bubbles the creator chose to show, so a sweep does not fold them again.
const revealed = new Set<string>();
let onResize: (() => void) | null = null;

export function initMessageCards(settings: Settings): void {
  teardownMessageCards();
  settingsRef = settings;
  const myEpoch = ++epoch;
  void (async () => {
    const saved = await readSavedFilter();
    if (myEpoch !== epoch) return;
    if (isTriageFilter(saved)) activeFilter = saved;
    await loadStored();
    if (myEpoch !== epoch) return;
    requestSweep(myEpoch);
  })();
  startFeeds(() => requestSweep(myEpoch));
  // Repaint when the desktop app's keyword / enrichment answers land.
  unsubscribeSignals = onBrandSignalsChanged(() => requestSweep(myEpoch));
  // Repaint when the full-inbox read (or a batch of thread reads) lands.
  unsubscribeInbox = subscribeInbox(() => requestSweep(myEpoch));
  unsubscribe = subscribeMessagesWidget(() => runSweep(myEpoch));
  // The chat bubble is placed relative to the drawer, which moves on resize.
  onResize = () => requestSweep(myEpoch);
  window.addEventListener("resize", onResize);
}

export function teardownMessageCards(): void {
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeSignals?.();
  unsubscribeSignals = null;
  unsubscribeInbox?.();
  unsubscribeInbox = null;
  if (onResize) window.removeEventListener("resize", onResize);
  onResize = null;
  epoch += 1;
  if (resweepTimer !== null) {
    window.clearTimeout(resweepTimer);
    resweepTimer = null;
  }
  removeAllHosts();
  restoreAllHidden(document);
  rowEntries.clear();
  dupeBars.clear();
  revealed.clear();
  filterBar = null;
  moreList = null;
  card = null;
  activeFilter = "all";
  query = "";
  moreLimit = MAX_MORE_ITEMS;
  settingsRef = null;
  setChatBubbleAvoid(null);
  resetData();
}

function removeAllHosts(): void {
  const selector = `.${STRIP_HOST_CLASS}, .${CARD_HOST_CLASS}, .${FILTER_HOST_CLASS}, .${MORE_HOST_CLASS}, .${DUPE_HOST_CLASS}`;
  for (const host of Array.from(document.querySelectorAll(selector))) host.remove();
  unhideFilteredRows();
}

function unhideFilteredRows(): void {
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-ib-ccm-filtered]"))) {
    row.removeAttribute("data-ib-ccm-filtered");
    row.style.removeProperty("display");
  }
}

function requestSweep(myEpoch: number): void {
  if (myEpoch !== epoch || resweepTimer !== null) return;
  resweepTimer = window.setTimeout(() => {
    resweepTimer = null;
    runSweep(myEpoch);
  }, RESWEEP_DEBOUNCE_MS);
}

function runSweep(myEpoch: number): void {
  if (myEpoch !== epoch) return;
  try {
    sweep(myEpoch);
  } catch (error) {
    log("cc-messages", "sweep failed", error);
  }
}

function sweep(myEpoch: number): void {
  const widget = findMessagesWidget(document);
  const open = widget !== null && widget.getClientRects().length > 0;
  // Keep the extension's support bubble off the drawer while it is open.
  setChatBubbleAvoid(open && widget ? widget.getBoundingClientRect() : null);
  if (!widget) {
    // Panel closed: drop our hosts so a reopen starts clean.
    dropListUi();
    dropThreadUi();
    return;
  }
  mergeGrid();
  void refreshLedger().then((grew) => {
    if (grew) requestSweep(myEpoch);
  });

  const header = findThreadHeader(widget);
  if (header) {
    dropListUi();
    sweepThread(widget, header, myEpoch);
  } else {
    dropThreadUi();
    sweepList(widget, myEpoch);
  }
}

// ── models ───────────────────────────────────────────────────────────────────

function liveEntry(brand: string): { entry: BrandEntry | null; summary: BrandSummary | null } {
  const entry = lookupBrandEntry(getIndex(), brand);
  return { entry, summary: entry ? summarizeBrand(entry, Date.now()) : null };
}

function entryAccepted(entry: BrandEntry | null): boolean {
  if (!entry) return false;
  const now = Date.now();
  return entry.campaigns.some((c) => (c.endsAt === null || c.endsAt > now) && isAccepted(c.id));
}

function formatDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toLocaleDateString(getLocale(), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function cadenceLabel(cadence: string | null | undefined): string | null {
  const s = t();
  switch (cadence) {
    case "renews":
      return s.ccmCadenceRenews;
    case "occasional":
      return s.ccmCadenceOccasional;
    case "one-shot":
      return s.ccmCadenceOneTime;
    default:
      return null;
  }
}

function rowModel(brand: string): { strip: StripModel; facts: RowFacts } {
  const s = t();
  const { entry, summary } = liveEntry(brand);
  const { keyword, enrichment } = getBrandSignals(brand);
  const note = getBrandNote(getNotes(), brand)?.note ?? null;

  const ratePct = summary?.bestRatePct ?? enrichment?.bestRatePct ?? null;
  const endsInDays = summary?.endsInDays ?? enrichment?.latestEndsInDays ?? null;
  const openSlots = summary?.openSlots ?? enrichment?.slotsOpen ?? null;
  let kw: StripModel["keyword"] = null;
  if (keyword) {
    const when = formatDate(keyword.lastSentAt);
    const others = keyword.keywords.filter((k) => k && k !== keyword.keyword);
    let tip = s.ccmPitchedUnder(keyword.keyword);
    if (when) tip += s.ccmPitchedOn(when);
    if (others.length > 0) tip += s.ccmPitchedAlso(others.join(", "));
    kw = { text: keyword.keyword, tip };
  }
  const strip: StripModel = {
    keyword: kw,
    ratePct,
    cadence: cadenceLabel(enrichment?.cadence),
    risky: enrichment?.verdict === "risky",
    endsInDays,
    openSlots,
    allClaimed: summary?.allClaimed ?? false,
    accepted: entryAccepted(entry),
    spcc: (summary?.spccCampaigns ?? 0) > 0,
    note,
  };
  const facts: RowFacts = {
    unread: false, // filled in by the caller (needs the row element / inbox row)
    live: summary !== null || (typeof enrichment?.slotsOpen === "number" && enrichment.slotsOpen > 0),
    pitched: keyword !== null,
    ratePct,
    state: null, // filled in by the caller from the inbox row
  };
  return { strip, facts };
}

// ── list view ────────────────────────────────────────────────────────────────

function sweepList(widget: HTMLElement, myEpoch: number): void {
  const rows = findConversationRows(widget);
  // Forget rows React dropped.
  for (const row of Array.from(rowEntries.keys())) {
    if (!row.isConnected) rowEntries.delete(row);
  }

  const inbox = getInbox();
  const facts = new Map<HTMLElement, RowFacts>();
  const brandEls = new Map<HTMLElement, HTMLElement>();
  const brandKeys = new Map<HTMLElement, string>();
  for (const row of rows) {
    const brandEl = findListRowBrandEl(row);
    const brand = brandEl ? (brandEl.textContent ?? "").trim() : "";
    if (!brandEl || !brand) continue;
    const brandKey = normalizeBrand(brand);
    brandEls.set(row, brandEl);
    brandKeys.set(row, brandKey);
    const { strip, facts: rowFacts } = rowModel(brand);
    // Unread from either source: the drawer's red dot (current) or the inbox
    // read (a couple of minutes old at most; cleared locally when a thread opens).
    const fromInbox = inboxFacts(inbox.rows[brandKey]);
    rowFacts.unread = readRowUnread(row) || fromInbox.unread;
    rowFacts.state = fromInbox.state;
    facts.set(row, rowFacts);

    const sig = `${brandKey}#${stripSignature(strip)}`;
    const existing = rowEntries.get(row);
    if (existing && existing.sig === sig && (existing.host === null || existing.host.isConnected)) continue;
    existing?.host?.remove();
    const host = buildStrip(strip);
    if (host && !insertOnOwnLine(brandEl, row, host)) {
      host.remove();
      rowEntries.set(row, { host: null, sig });
      continue;
    }
    rowEntries.set(row, { host, sig });
  }

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  if (facts.size === 0 || !firstRow || !lastRow) {
    removeFilterBar();
    removeMoreList();
    return;
  }

  const view = inboxViewFor(facts, brandKeys, inbox);
  applyFilter(facts, brandKeys);
  mountFilterBar(firstRow, view, facts, brandEls, inbox, myEpoch);
  mountMoreList(lastRow, view, myEpoch);
}

function keepsRow(rowFacts: RowFacts, brandKey: string): boolean {
  return matchesFilter(activeFilter, rowFacts) && matchesQuery(brandKey, query);
}

function applyFilter(facts: Map<HTMLElement, RowFacts>, brandKeys: Map<HTMLElement, string>): void {
  for (const [row, rowFacts] of facts) {
    const show = keepsRow(rowFacts, brandKeys.get(row) ?? "");
    const strip = rowEntries.get(row)?.host ?? null;
    if (show) {
      if (row.hasAttribute("data-ib-ccm-filtered")) {
        row.removeAttribute("data-ib-ccm-filtered");
        row.style.removeProperty("display");
      }
      if (strip) strip.style.display = "block";
    } else {
      row.setAttribute("data-ib-ccm-filtered", "1");
      row.style.display = "none";
      if (strip) strip.style.display = "none";
    }
  }
}

// Conversations the full-inbox read knows about and the drawer does not render
// (it stops at 100 rows), joined with the drawer's rows and narrowed to the
// search query.
function inboxViewFor(
  facts: Map<HTMLElement, RowFacts>,
  brandKeys: Map<HTMLElement, string>,
  inbox: InboxCache,
): InboxView {
  const dom: DomFact[] = [];
  for (const [row, rowFacts] of facts) {
    const brandKey = brandKeys.get(row);
    if (brandKey) dom.push({ brandKey, facts: rowFacts });
  }
  return buildInboxView(
    dom,
    inbox,
    (brand, inboxRow) => ({ ...rowModel(brand).facts, ...inboxFacts(inboxRow) }),
    query,
  );
}

// Why the active filter shows nothing, or "" when it shows rows.
function emptyReason(view: InboxView, counts: Record<TriageFilter, number>, inbox: InboxCache): string {
  const s = t();
  const locale = getLocale();
  if (view.all.length === 0 && normalizeBrand(query)) return s.ccmEmptySearch(query.trim());
  if (activeFilter === "all" || counts[activeFilter] > 0) return "";
  switch (activeFilter) {
    case "unread":
      return s.ccmEmptyUnread;
    case "replied":
    case "waiting": {
      const progress = threadProgress(inbox);
      if (progress.checked < progress.total) {
        return s.ccmEmptyThreads(formatCount(progress.checked, locale), formatCount(progress.total, locale));
      }
      return activeFilter === "replied" ? s.ccmEmptyReplied : s.ccmEmptyWaiting;
    }
    case "live":
    case "highrate":
      return s.ccmEmptyLive;
    case "pitched":
      return s.ccmEmptyPitched;
  }
}

// "1,480 conversations, updated 2 min ago, threads checked: 120 of 1,480".
function syncLine(inbox: InboxCache): string {
  const s = t();
  const locale = getLocale();
  if (inbox.syncedAt === 0) return s.ccmSyncReading;
  const now = Date.now();
  const total = Object.keys(inbox.rows).length;
  const ago =
    now - inbox.syncedAt > INBOX_STALE_MS
      ? numericDate(inbox.syncedAt, locale)
      : formatAgo(
          inbox.syncedAt,
          now,
          { justNow: s.ccmAgoJustNow, minAgo: s.ccmAgoMin, hoursAgo: s.ccmAgoHours },
          locale,
        );
  let line = s.ccmSyncLine(formatCount(total, locale), ago);
  const progress = threadProgress(inbox);
  if (progress.checked < progress.total) {
    line += `, ${s.ccmSyncThreads(formatCount(progress.checked, locale), formatCount(progress.total, locale))}`;
  }
  return line;
}

function mountFilterBar(
  firstRow: HTMLElement,
  view: InboxView,
  facts: Map<HTMLElement, RowFacts>,
  brandEls: Map<HTMLElement, HTMLElement>,
  inbox: InboxCache,
  myEpoch: number,
): void {
  const counts = Object.fromEntries(TRIAGE_FILTERS.map((f) => [f, countMatches(f, view.all)])) as Record<
    TriageFilter,
    number
  >;
  const model: FilterBarModel = {
    active: activeFilter,
    counts,
    total: view.all.length,
    query,
    emptyReason: emptyReason(view, counts, inbox),
    sync: syncLine(inbox),
  };
  const sig = filterBarSignature(model);
  if (filterBar && filterBar.sig === sig && filterBar.built.host.isConnected) return;

  const searchHadFocus = filterBar?.built.isSearchFocused() ?? false;
  filterBar?.built.host.remove();
  const built = buildFilterBar(
    model,
    {
      onSelect: (filter) => {
        activeFilter = filter;
        moreLimit = MAX_MORE_ITEMS;
        saveFilter(filter);
        runSweep(myEpoch);
        filterBar?.built.focusFilter(filter);
      },
      onNextUnread: () => {
        for (const [row, rowFacts] of facts) {
          if (!rowFacts.unread || row.getAttribute("data-ib-ccm-filtered")) continue;
          row.scrollIntoView({ block: "nearest" });
          // Click the brand name: it bubbles to whichever ancestor Amazon wired.
          (brandEls.get(row) ?? row).click();
          return;
        }
        // Nothing unread in the drawer's rows: the next one may be an older
        // conversation the drawer does not list.
        const next: MoreItem | undefined = view.extras.find((item) => item.unread);
        if (next) void openBrandConversation(next.brand);
      },
      onSearch: (next) => {
        if (next === query) return;
        query = next;
        moreLimit = MAX_MORE_ITEMS;
        runSweep(myEpoch);
        filterBar?.built.focusSearch();
      },
      onSearchEnter: () => {
        if (!normalizeBrand(query)) return;
        // First visible drawer row, else the first older conversation.
        for (const [row] of facts) {
          if (row.getAttribute("data-ib-ccm-filtered")) continue;
          (brandEls.get(row) ?? row).click();
          return;
        }
        const first = view.extras.find((item) => matchesFilter(activeFilter, item.facts));
        if (first) void openBrandConversation(first.brand);
      },
    },
    getLocale(),
  );
  if (!insertOnOwnLine(firstRow, firstRow, built.host, "before")) return;
  filterBar = { built, sig };
  if (searchHadFocus) built.focusSearch();
}

function removeFilterBar(): void {
  filterBar?.built.host.remove();
  filterBar = null;
}

function mountMoreList(lastRow: HTMLElement, view: InboxView, myEpoch: number): void {
  const s = t();
  const locale = getLocale();
  const shown = visibleExtras(view.extras, (rowFacts) => matchesFilter(activeFilter, rowFacts), moreLimit);
  if (shown.items.length === 0) {
    removeMoreList();
    return;
  }
  const now = Date.now();
  const words = { today: s.ccmToday, yesterday: s.ccmYesterday, daysAgo: s.ccmDaysAgo };
  const model: MoreListModel = {
    items: shown.items.map((item) => ({
      brandKey: item.brandKey,
      brand: item.brand,
      when: formatWhen(item.lastMsgAt, now, locale, words),
      unread: item.unread,
    })),
    hidden: shown.hidden,
    step: MORE_STEP,
  };
  const sig = moreListSignature(model);
  if (moreList && moreList.sig === sig && moreList.host.isConnected) return;

  moreList?.host.remove();
  const host = buildMoreList(
    model,
    {
      onOpen: (brand) => {
        void openBrandConversation(brand);
      },
      onShowMore: () => {
        moreLimit += MORE_STEP;
        runSweep(myEpoch);
      },
    },
    locale,
  );
  if (!insertOnOwnLine(lastRow, lastRow, host, "after")) return;
  moreList = { host, sig };
}

function removeMoreList(): void {
  moreList?.host.remove();
  moreList = null;
}

function dropListUi(): void {
  for (const entry of rowEntries.values()) entry.host?.remove();
  rowEntries.clear();
  removeFilterBar();
  removeMoreList();
  unhideFilteredRows();
}

// ── thread view ──────────────────────────────────────────────────────────────

function sweepThread(widget: HTMLElement, header: HTMLElement, myEpoch: number): void {
  const s = t();
  const brand = readThreadBrand(header);
  if (!brand) return;
  // The creator is looking at this thread, so it is read now.
  markConversationRead(normalizeBrand(brand));

  const bubbles = readThreadBubbles(widget, brand);
  foldDuplicates(widget, brand, bubbles);

  const brandTexts = bubbles.filter((b) => b.sender !== "me").map((b) => b.text);
  const links = extractMessageLinks(brandTexts.length > 0 ? brandTexts : [readThreadText(widget)]);

  const { entry, summary } = liveEntry(brand);
  const { keyword, enrichment } = getBrandSignals(brand);
  const bestId = summary?.bestCampaignId ?? null;
  const settings = settingsRef;
  let blocked = "";
  if (!bestId) blocked = s.ccmNoCampaignId;
  else if (settings && !settings.tools.standaloneAccept) {
    blocked = s.ccmAcceptOff;
  }
  const accepted = entryAccepted(entry) || isAccepted(bestId);

  const model: CardModel = {
    brand,
    summary,
    cadence: cadenceLabel(enrichment?.cadence),
    risky: enrichment?.verdict === "risky",
    pitchedKeyword: keyword?.keyword ?? null,
    links,
    note: getBrandNote(getNotes(), brand)?.note ?? "",
    accepted,
    acceptBlockedReason: blocked,
    campaignUrl: bestId
      ? `${location.origin}/p/connect/request?campaignId=${encodeURIComponent(bestId)}`
      : null,
  };
  const sig = cardSignature(model);
  if (card && card.sig === sig && card.brand === brand && card.host.isConnected) return;

  card?.host.remove();
  const host = buildCard(model, {
    onSaveNote: (text) => {
      void saveNotes(setBrandNote(getNotes(), brand, text, Date.now()));
    },
    onAccept: async () => {
      if (!bestId) return { ok: false, message: blocked || s.ccmNoCampaignToAccept };
      let outcome: AcceptOutcome;
      try {
        outcome = await sendToBackground<AcceptOutcome>({
          kind: "ACCEPT_CAMPAIGN_IN_TAB",
          campaignId: bestId,
          asin: null,
          marketplace: location.hostname.replace(/^affiliate-program\./, ""),
          source: "manual",
        });
      } catch {
        outcome = { ok: false, reason: "error" };
      }
      const result: AcceptResult = { ...outcome, route: "standalone" };
      if (result.ok) {
        noteAccepted(bestId);
        requestSweep(myEpoch);
      }
      return { ok: result.ok, message: describeAcceptResult(result) };
    },
  });
  if (!insertOnOwnLine(header, widget, host)) return;
  card = { host, sig, brand };
}

// Fold repeats of an earlier brand message behind a "Show" bar, reveal anything
// the creator asked to see, and un-hide nodes React reused for another message.
function foldDuplicates(
  widget: HTMLElement,
  brand: string,
  bubbles: ReturnType<typeof readThreadBubbles>,
): void {
  const dupIdx = new Set(findDuplicateIndexes(bubbles));
  const keep = new Set<HTMLElement>();
  bubbles.forEach((bubble, i) => {
    const sig = `${normalizeBrand(brand)}|${bubble.sender}|${normalizeMessageText(bubble.text)}`;
    const alreadyHidden = hiddenSignature(bubble.el);
    if (!dupIdx.has(i) || revealed.has(sig)) {
      if (alreadyHidden !== null) unfold(bubble.el);
      return;
    }
    keep.add(bubble.el);
    if (alreadyHidden === sig && dupeBars.get(bubble.el)?.isConnected) return;
    hideBubble(bubble.el, sig);
    dupeBars.get(bubble.el)?.remove();
    const bar = buildDupeBar(() => {
      revealed.add(sig);
      unfold(bubble.el);
    });
    bubble.el.before(bar);
    dupeBars.set(bubble.el, bar);
  });
  // Any hidden node that is not a current duplicate is stale (the thread changed
  // under React's reused nodes): put it back.
  for (const node of Array.from(widget.querySelectorAll<HTMLElement>("[data-ib-ccm-hidden]"))) {
    if (!keep.has(node)) unfold(node);
  }
}

function unfold(el: HTMLElement): void {
  showBubble(el);
  dupeBars.get(el)?.remove();
  dupeBars.delete(el);
}

function buildDupeBar(onShow: () => void): HTMLElement {
  const { host, root } = createInlineShadow(DUPE_HOST_CLASS);
  const btn = el("button", "ccm-dupe", t().ccmDupeShow);
  btn.type = "button";
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onShow();
  });
  root.append(btn);
  return host;
}

function dropThreadUi(): void {
  card?.host.remove();
  card = null;
  for (const [el, bar] of dupeBars) {
    bar.remove();
    showBubble(el);
  }
  dupeBars.clear();
}
