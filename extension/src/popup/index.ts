import {
  sendToBackground,
  type AuthStatus,
  type CleanLinkResult,
  type GenerateLinkResult,
  type IntegrationsView,
  type PageStatus,
  type PairResult,
  type ProductListsResult,
  type RelayClaimResult,
  type RelayStateView,
  type RowBadge,
  type RowBadgesResult,
  type RowEnrichRef,
  type SignInResult,
  type UpdateStateView,
  type WatchlistResult,
  type WhatsNewView,
} from "../shared/messages";
import { shortenerOriginPattern } from "../integrations/clean-link";
import { detectRetailerForUrl } from "../content/page-type";
import { retailerModule } from "../retailers/module";
import { copyButton } from "../ui/components";
import { getSettings, patchSettings } from "../storage/store";
import { getFlags } from "../flags/cache";
import type { Settings, WatchCondition } from "../storage/schema";
import {
  AVAILABILITY_MARKETS,
  OPTIONAL_MARKET_ORIGINS,
} from "../background/market-availability";
import { channelAllowed } from "../shared/creator-mode";
import { isPairedLocal } from "../shared/bridge-token";
import { isAndroid, isMobileUserAgent } from "../shared/platform";
import { activePageTab } from "./active-tab";
import { initChatBubble } from "../tools/chat-bubble/panel";
import { autoFillFromDesktop, runSyncReconcile } from "../tools/settings-sync/ui";
import { getLocale, resolveLocale, setLocale, t } from "../i18n";
import { CHROME_REVIEW_URL, EXTENSION_FEEDBACK_URL, guideUrlFor } from "../shared/constants";

// Popup: page status via the active tab's content script, account sign-in via
// the background, settings straight to storage (content scripts pick changes
// up on the next page view).

// Adapter id of the first-party branded-link provider. Selecting it as the
// primary deeplink provider is the whole of "turn branded links on": it takes no
// credentials, only the signed-in license.
const IB_LINKS = "influencerbutler";

// Friendly names for the Walmart link providers, used in the Quick Link card's
// "Generating your <provider> link..." status. Keys match the adapter ids stored
// in integrations.global.walmartLinkProvider.
const WALMART_PROVIDER_NAMES: Record<string, string> = {
  walmartCreator: "Walmart Creator",
  mavely: "Mavely",
};

void init();

async function init(): Promise<void> {
  // Android extension browsers (Lemur) open the popup full screen or as a tab:
  // switch popup.css to its fluid, full-width layout and skip the desktop
  // resize-and-remember behavior, which would pin a saved desktop size.
  if (isMobileUserAgent()) {
    document.documentElement.classList.add("mobile");
  } else {
    restorePopupSize();
  }
  const settings = await getSettings();
  setLocale(settings.locale);
  applyStaticI18n();
  // The PDF guide in the user's language (the static href is the English file).
  byId<HTMLAnchorElement>("open-guide").href = guideUrlFor(getLocale());
  showVersion();
  await Promise.all([
    renderUpdateCard(),
    renderWhatsNewCard(),
    renderReviewAskCard(),
    renderPageStatus(),
    renderAccount(),
    renderAppBridge(),
    renderRemoteDevices(),
    renderSettings(),
    renderWatchlist(),
    renderProductLists(),
  ]);
  wirePopupZoom();
  // The Feedback Butler card was replaced by the same chat bubble the product pages
  // show: bug report + screenshots (picker / paste) + reply email + diagnostics.
  initChatBubble({ popup: true });
  wireOptions();
  // AI Assistant is a neutral help tool for every creator, so it is wired
  // unconditionally, like Link Butler below.
  wireChat(settings.locale);
  // Link Butler (branded-link Ledger) is a neutral tool: creators share links on
  // every channel, so it shows regardless of onsite/offsite creator mode.
  void wireLinkButler(settings.locale);
  // Quick Link: when the active tab is an Amazon or Walmart product page, offer
  // a top-of-box button to generate/copy the affiliate link for it. Async (it
  // reads the active tab), so it reveals its own card and re-syncs the nav.
  void wireQuickLink(settings.locale);
  // Clean Link is a neutral utility for every creator, wired unconditionally.
  wireCleanLink(settings.locale);
  // The Deal Sites Harvester and Instagram Goldmine are offsite tools (harvest
  // deals / creators to share off-Amazon). Hide their launcher cards for an
  // onsite-only creator; "both" and offsite show them as before.
  if (channelAllowed(settings.creatorMode, "offsite")) {
    wireDealHarvester(settings.locale);
    // Social Posting scheduler launcher: opens the composer + calendar. Offsite
    // (it publishes off-Amazon), so it rides the same creator-mode gate.
    wireSocialSchedule(settings.locale);
    // Instagram Goldmine launcher: self-hosted build only. The whole call (and
    // its import-free body) dead-code-eliminates out of the public build,
    // leaving the card hidden as authored in popup.html.
    if (IB_IG_ENABLED) wireGoldmine();
  } else {
    const dealCard = document.getElementById("deal-harvester");
    if (dealCard) dealCard.hidden = true;
  }
  // The left-hand section nav is wired last, once every card's visibility has
  // settled, so the nav mirrors exactly which cards are on screen.
  wireSectionNav();
  syncNavVisibility();
}

// The popup is user-resizable: popup.css gives <body> an explicit size plus
// `resize: both`, and Chrome sizes the popup window to the document, so dragging
// the bottom-right grabber resizes the whole popup. Restore the last size the
// user chose on open, and persist any resize so it reopens the same way. Kept in
// localStorage (popup-local, no schema migration) and wrapped in try/catch so a
// private window or blocked storage just falls back to the CSS default size.
const POPUP_SIZE_KEY = "ib_popup_size";

function restorePopupSize(): void {
  try {
    const raw = localStorage.getItem(POPUP_SIZE_KEY);
    if (raw) {
      const size = JSON.parse(raw) as { w?: unknown; h?: unknown };
      const w = Number(size.w);
      const h = Number(size.h);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        document.body.style.width = `${w}px`;
        document.body.style.height = `${h}px`;
      }
    }
  } catch {
    // Malformed or unavailable storage: the CSS default size applies.
  }
  let saveTimer = 0;
  const save = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          POPUP_SIZE_KEY,
          JSON.stringify({ w: document.body.offsetWidth, h: document.body.offsetHeight }),
        );
      } catch {
        // Best-effort; ignore quota / private-mode failures.
      }
    }, 200);
  };
  new ResizeObserver(save).observe(document.body);
}

// Left-hand section navigation. Each nav link points at a card (or a tool-group
// heading) by id; clicking scrolls it into view inside the bounded pane, and an
// IntersectionObserver keeps the link for the section currently in view marked
// active. The nav is authored statically in popup.html; this only wires it.
function wireSectionNav(): void {
  const nav = document.querySelector<HTMLElement>(".side-nav");
  const pane = document.getElementById("popup-pane");
  if (!nav || !pane) return;

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));

  // Click to scroll (smooth), without adding a #hash to the URL.
  nav.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor) return;
    event.preventDefault();
    const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Scrollspy: highlight the nav link for whichever observed section sits nearest
  // the top of the pane.
  const byTarget = new Map<string, HTMLAnchorElement>();
  const targets: HTMLElement[] = [];
  for (const link of links) {
    const el = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!el) continue;
    byTarget.set(el.id, link);
    targets.push(el);
  }

  const visible = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      // Pick the first observed target (document order) that is currently visible.
      const activeId = targets.find((el) => visible.has(el.id))?.id;
      for (const [id, link] of byTarget) link.classList.toggle("active", id === activeId);
    },
    { root: pane, rootMargin: "0px 0px -70% 0px", threshold: 0 },
  );
  for (const el of targets) observer.observe(el);
}

// Keep each nav item in sync with its card's visibility: cards that get hidden
// at runtime (update card, deal harvester for onsite-only creators, an empty
// watchlist) should not leave a dead link in the nav. Items without a
// data-nav-for target are always shown.
function syncNavVisibility(): void {
  for (const li of Array.from(document.querySelectorAll<HTMLLIElement>(".side-nav li[data-nav-for]"))) {
    const target = document.getElementById(li.dataset.navFor ?? "");
    li.hidden = !target || target.hidden;
  }
}

// Stamp the running extension version into the header, read from the manifest
// so it always matches the installed build (no hardcoded string to drift).
function showVersion(): void {
  const el = document.getElementById("ext-version");
  if (el) el.textContent = `v${chrome.runtime.getManifest().version}`;
}

// Extension-update card: shown only when Chrome has a newer version staged
// (and the user has not snoozed it). "Update now" restarts the extension to
// apply it, which closes this popup; that is expected.
async function renderUpdateCard(): Promise<void> {
  const view = await sendToBackground<UpdateStateView>({ kind: "GET_UPDATE_STATE" }).catch(
    () => null,
  );
  if (!view?.due || !view.availableVersion) return; // card stays hidden
  byId("update-heading").textContent = t().updatePopupHeading;
  byId("update-blurb").textContent = t().updatePopupBody(view.currentVersion, view.availableVersion);
  const btn = byId<HTMLButtonElement>("update-apply");
  btn.textContent = t().updateNow;
  btn.onclick = () => {
    void sendToBackground<void>({ kind: "APPLY_UPDATE" }).catch(() => {});
  };
  byId("update-card").hidden = false;
}

// Post-update "What's New" card: shown only when the extension has updated and
// the notice has not been dismissed yet. Lists what changed in the running
// version (all changelog sections plus any of the user's own resolved bug
// reports); "Got it" dismisses it on every surface. Mirrors the corner card
// that shows on retailer pages, sharing one stored "last shown version".
async function renderWhatsNewCard(): Promise<void> {
  const view = await sendToBackground<WhatsNewView>({ kind: "GET_WHATS_NEW" }).catch(() => null);
  if (!view?.show) return;
  const hasContent =
    view.features.length || view.fixes.length || view.other.length || view.reportedBugs.length;
  if (!hasContent) return; // card stays hidden; the on-page driver self-heals

  byId("whats-new-heading").textContent = t().whatsNewTitle;
  byId("whats-new-meta").textContent = view.date ? `v${view.version} - ${view.date}` : `v${view.version}`;

  const sections = byId("whats-new-sections");
  sections.replaceChildren();
  if (view.features.length) sections.append(whatsNewSection(t().whatsNewFeaturesHeading, view.features));
  if (view.fixes.length) sections.append(whatsNewSection(t().whatsNewFixesHeading, view.fixes));
  if (view.reportedBugs.length) {
    sections.append(whatsNewSection(t().whatsNewReportedHeading, view.reportedBugs.map((b) => b.summary)));
  }
  if (view.other.length) sections.append(whatsNewSection(t().whatsNewOtherHeading, view.other));

  const btn = byId<HTMLButtonElement>("whats-new-dismiss");
  btn.textContent = t().whatsNewDismiss;
  btn.onclick = () => {
    void sendToBackground<void>({ kind: "DISMISS_WHATS_NEW" }).catch(() => {});
    byId("whats-new-card").hidden = true;
    syncNavVisibility();
  };
  byId("whats-new-card").hidden = false;
}

// "Is this saving you time?" review ask: shown once an install is old and active
// enough (decided in the background). A happy answer opens the Web Store reviews
// tab, an unhappy one opens Feedback Butler, and either closes the card for good.
// No reward is ever mentioned: an incentivized store review would violate Chrome
// Web Store policy.
async function renderReviewAskCard(): Promise<void> {
  const due = await sendToBackground<boolean>({ kind: "GET_REVIEW_ASK_DUE" }).catch(() => false);
  if (!due) return; // card stays hidden
  const card = byId("review-ask-card");
  const answer = (choice: "yes" | "no" | "later" | "never", url?: string): void => {
    void sendToBackground<void>({ kind: "ANSWER_REVIEW_ASK", answer: choice }).catch(() => {});
    if (url) void chrome.tabs.create({ url });
    card.hidden = true;
    syncNavVisibility();
  };
  byId<HTMLButtonElement>("review-ask-yes").onclick = () => answer("yes", CHROME_REVIEW_URL);
  byId<HTMLButtonElement>("review-ask-no").onclick = () =>
    answer("no", `${EXTENSION_FEEDBACK_URL}?src=review-ask`);
  byId<HTMLButtonElement>("review-ask-later").onclick = () => answer("later");
  byId<HTMLButtonElement>("review-ask-never").onclick = () => answer("never");
  card.hidden = false;
}

// One labelled group of bullet points in the popup's What's New card.
function whatsNewSection(heading: string, items: string[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "whats-new-group";
  const h = document.createElement("h3");
  h.textContent = heading;
  const ul = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.append(li);
  }
  wrap.append(h, ul);
  return wrap;
}

// Build and wire the Instagram Goldmine card. Constructed entirely in JS (not
// in popup.html) so the public build's popup markup is byte-for-byte unchanged;
// this whole function dead-code-eliminates out when IB_IG_ENABLED is false. It
// opens in its own tab (it needs room for the config + results table and
// outlives the popup).
function wireGoldmine(): void {
  // Cards now live inside the scrolling pane, not directly under <main>.
  const main = document.getElementById("popup-pane") ?? document.querySelector("main");
  const anchor = document.getElementById("deal-harvester");
  if (!main) return;

  const card = document.createElement("section");
  card.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = "Instagram Goldmine";

  const blurb = document.createElement("p");
  blurb.className = "muted small";
  blurb.textContent =
    "Crawl Instagram hashtags for creator emails using your own logged-in Instagram session, then send them to Pitch or Group Invite.";

  const btn = document.createElement("button");
  btn.className = "primary";
  btn.textContent = "Open Instagram Goldmine";
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("goldmine.html") });
  };

  card.append(h2, blurb, btn);
  // Place it just after the Deal Sites Harvester card, else at the end.
  if (anchor && anchor.parentElement === main) {
    anchor.insertAdjacentElement("afterend", card);
  } else {
    main.append(card);
  }
}

// The Deal Sites Harvester opens in its own tab (it needs room for a review
// table and outlives the popup, which closes on blur). Localized inline so the
// three strings do not have to live in the shared catalog.
// The AI Assistant opens in its own tab, like the harvester. Strings are
// localized inline so they do not have to live in the shared catalog.
function wireChat(locale: Settings["locale"]): void {
  const dict = {
    en: {
      heading: "AI Assistant",
      blurb: "Ask setup and how-to questions and get instant answers from our help guides.",
      open: "Open AI Assistant",
    },
    es: {
      heading: "Asistente de IA",
      blurb: "Haz preguntas de configuración y guías, y obtén respuestas al instante desde nuestra ayuda.",
      open: "Abrir el asistente de IA",
    },
    fr: {
      heading: "Assistant IA",
      blurb: "Posez vos questions de configuration et obtenez des réponses instantanées depuis notre aide.",
      open: "Ouvrir l'assistant IA",
    },
  }[resolveLocale(locale)];
  byId("chat-heading").textContent = dict.heading;
  byId("chat-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-chat");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("chat.html") });
  };
}

function wireDealHarvester(locale: Settings["locale"]): void {
  const dict = {
    en: {
      heading: "Deal Sites Harvester",
      blurb:
        "Pull deals from the daily-deal sites you follow and send them into a Deals Butler workspace in the app.",
      open: "Open Deal Sites Harvester",
    },
    es: {
      heading: "Recolector de sitios de ofertas",
      blurb:
        "Extrae ofertas de los sitios de ofertas diarias que sigues y envíalas a un espacio de Ofertas Diarias en la app.",
      open: "Abrir el recolector de sitios",
    },
    fr: {
      heading: "Collecteur de sites de bons plans",
      blurb:
        "Récupérez les offres des sites de bons plans que vous suivez et envoyez-les vers un espace Offres du Jour dans l'app.",
      open: "Ouvrir le collecteur de sites",
    },
  }[resolveLocale(locale)];
  byId("deals-heading").textContent = dict.heading;
  byId("deals-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-deals");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("deals.html") });
  };
}

function wireSocialSchedule(locale: Settings["locale"]): void {
  const dict = {
    en: {
      heading: "Schedule a post",
      blurb:
        "Right-click any image on the web to schedule it as a social post, or open the composer to write a caption, pick a time, and see your calendar.",
      open: "Open composer and calendar",
    },
    es: {
      heading: "Programar una publicación",
      blurb:
        "Haz clic derecho en cualquier imagen de la web para programarla como publicación, o abre el editor para escribir un pie de foto, elegir la hora y ver tu calendario.",
      open: "Abrir editor y calendario",
    },
    fr: {
      heading: "Programmer une publication",
      blurb:
        "Faites un clic droit sur n'importe quelle image du web pour la programmer, ou ouvrez l'éditeur pour écrire une légende, choisir un horaire et voir votre calendrier.",
      open: "Ouvrir l'éditeur et le calendrier",
    },
  }[resolveLocale(locale)];
  byId("social-heading").textContent = dict.heading;
  byId("social-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-compose");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void sendToBackground<{ ok: boolean }>({
      kind: "OPEN_SOCIAL_COMPOSE",
      context: { imageUrl: null, pageUrl: null, title: null },
    });
  };
}

// The Link Butler (Ledger) opens in its own tab, like the harvester. Localized
// inline so the strings do not have to live in the shared catalog. The card also
// carries the branded-links switch: this is where a creator signs in, so it is
// the one place the free short-link feature is guaranteed to be seen, instead of
// only in a dropdown on the API Integrations page.
async function wireLinkButler(locale: Settings["locale"]): Promise<void> {
  const dict = {
    en: {
      heading: "Link Butler",
      blurb:
        "See how your branded links are performing, fix a posted link, and manage retargeting pixels.",
      open: "Open Link Butler",
      brandedLabel: "Copy short branded links",
      brandedHint:
        "Copy my link hands you a links.influencerbutler.com short link instead of a long Amazon url. Your affiliate tag stays out of what you post, and clicks are counted. Free on any plan. Turn it off to copy the plain Amazon link.",
      brandedSignIn: "Connect your license key above to use branded links.",
    },
    es: {
      heading: "Link Butler",
      blurb:
        "Mira el rendimiento de tus enlaces de marca, corrige un enlace publicado y gestiona los pixeles de retargeting.",
      open: "Abrir Link Butler",
      brandedLabel: "Copiar enlaces cortos de marca",
      brandedHint:
        "Copiar mi enlace te da un enlace corto de links.influencerbutler.com en lugar de una url larga de Amazon. Tu etiqueta de afiliado no aparece en lo que publicas y se cuentan los clics. Gratis en cualquier plan. Desactívalo para copiar el enlace normal de Amazon.",
      brandedSignIn: "Conecta tu clave de licencia arriba para usar enlaces de marca.",
    },
    fr: {
      heading: "Link Butler",
      blurb:
        "Suivez les performances de vos liens de marque, corrigez un lien publie et gerez les pixels de reciblage.",
      open: "Ouvrir Link Butler",
      brandedLabel: "Copier des liens de marque courts",
      brandedHint:
        "Copier mon lien vous donne un lien court links.influencerbutler.com au lieu d'une longue url Amazon. Votre balise d'affiliation reste hors de ce que vous publiez et les clics sont comptes. Gratuit sur toute offre. Desactivez-le pour copier le lien Amazon brut.",
      brandedSignIn: "Connectez votre cle de licence ci-dessus pour utiliser les liens de marque.",
    },
  }[resolveLocale(locale)];
  byId("lb-heading").textContent = dict.heading;
  byId("lb-blurb").textContent = dict.blurb;
  const btn = byId<HTMLButtonElement>("open-links");
  btn.textContent = dict.open;
  btn.onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("links.html") });
  };

  byId("lb-branded-label").textContent = dict.brandedLabel;
  const box = byId<HTMLInputElement>("lb-branded");
  const hint = byId("lb-branded-hint");
  const view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  const on = view.global.primaryDeeplinkProvider === IB_LINKS;
  box.checked = on;
  // `configured` for this provider means a license key is signed in, which is
  // the only thing branded links need. Say so rather than letting the toggle
  // look armed while links would quietly come back plain.
  const signedIn = Boolean(view.providers.find((p) => p.id === IB_LINKS)?.configured);
  hint.textContent = signedIn ? dict.brandedHint : dict.brandedSignIn;
  box.onchange = () => {
    void sendToBackground({
      kind: "SET_INTEGRATION_GLOBAL",
      partial: { primaryDeeplinkProvider: box.checked ? IB_LINKS : null },
    });
  };
}

// Clean Link: paste a product link carrying someone else's tracking, get back a
// clean link plus one re-tagged with the user's own attribution. Strings are
// Quick Link: a top-of-box card, shown only when the active tab is an Amazon or
// Walmart product page, that generates and copies the affiliate link (or branded
// deeplink) for that product. It reuses the same GENERATE_AFFILIATE_LINK message
// as the on-page overlays; Walmart routes through the headless Walmart Creator /
// Mavely mint (per the user's provider setting), so we name the provider in a
// "Generating..." status while the background works. Strings localized inline,
// no em dashes (repo convention).
async function wireQuickLink(locale: Settings["locale"]): Promise<void> {
  const dict = {
    en: {
      nav: "Get my link",
      heading: "Get my link for this page",
      blurb:
        "You're on a product page. Generate your affiliate link (or branded deeplink) for it and copy it in one tap.",
      generate: "Get my link",
      generating: "Building your link...",
      generatingProvider: (name: string): string => `Generating your ${name} link...`,
      linkLabel: "Your link",
      failed: "Could not build a link. Try again.",
      copied: "Copied!",
      copiedPlain: "Copied (plain link).",
      copiedSignIn:
        "Copied a plain link. Sign in to your Walmart link provider to get tracked links.",
      notTracked: "Links are not commission-tracked yet.",
      setup: "Set up Walmart affiliate links",
    },
    es: {
      nav: "Obtener mi enlace",
      heading: "Obten mi enlace para esta pagina",
      blurb:
        "Estas en una pagina de producto. Genera tu enlace de afiliado (o deeplink de marca) y copialo en un toque.",
      generate: "Obtener mi enlace",
      generating: "Creando tu enlace...",
      generatingProvider: (name: string): string => `Generando tu enlace de ${name}...`,
      linkLabel: "Tu enlace",
      failed: "No pudimos crear un enlace. Intenta de nuevo.",
      copied: "Copiado!",
      copiedPlain: "Copiado (enlace simple).",
      copiedSignIn:
        "Copiamos un enlace simple. Inicia sesion en tu proveedor de enlaces de Walmart para obtener enlaces con seguimiento.",
      notTracked: "Los enlaces aun no tienen seguimiento de comision.",
      setup: "Configurar enlaces de afiliado de Walmart",
    },
    fr: {
      nav: "Obtenir mon lien",
      heading: "Obtenir mon lien pour cette page",
      blurb:
        "Vous etes sur une page produit. Generez votre lien d'affiliation (ou deeplink de marque) et copiez-le en un clic.",
      generate: "Obtenir mon lien",
      generating: "Creation de votre lien...",
      generatingProvider: (name: string): string => `Generation de votre lien ${name}...`,
      linkLabel: "Votre lien",
      failed: "Impossible de creer un lien. Reessayez.",
      copied: "Copie !",
      copiedPlain: "Copie (lien simple).",
      copiedSignIn:
        "Lien simple copie. Connectez-vous a votre fournisseur de liens Walmart pour obtenir des liens suivis.",
      notTracked: "Les liens ne sont pas encore suivis pour la commission.",
      setup: "Configurer les liens d'affiliation Walmart",
    },
  }[resolveLocale(locale)];

  const card = document.getElementById("quick-link-card");
  if (!card) return;
  byId("ql-heading").textContent = dict.heading;
  byId("ql-blurb").textContent = dict.blurb;
  const navLink = document.getElementById("nav-quick-link");
  if (navLink) navLink.textContent = dict.nav;
  const btn = byId<HTMLButtonElement>("ql-generate");
  btn.textContent = dict.generate;
  const status = byId("ql-status");
  const results = byId("ql-results");

  const showStatus = (text: string): void => {
    status.textContent = text;
    status.hidden = !text;
  };

  const resultRow = (label: string, value: string): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "cl-result";
    const lbl = document.createElement("p");
    lbl.className = "muted small";
    lbl.textContent = label;
    const row = document.createElement("div");
    row.className = "row";
    const field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = value;
    row.append(field, copyButton(value));
    wrap.append(lbl, row);
    return wrap;
  };

  // Is the active tab a product page we can build a link for? Both Amazon /dp/
  // and Walmart /ip/ URLs carry the id in the path, so a pure URL parse (no page
  // DOM, no content-script round trip) covers the common case.
  const tab = await activePageTab();
  const url = tab?.url ?? "";
  const retailer = url ? detectRetailerForUrl(url) : null;
  // Not Amazon/Walmart (Target has no link routing): card stays hidden.
  if (!retailer || retailer === "target") return;
  const mod = retailerModule(retailer);
  const productId = mod.extractProductId(url);
  if (!productId || !mod.productIdValid(productId)) return; // not a product page
  const marketplace = mod.marketplaceFor(url);

  // Reveal the card, then re-sync the nav (init already ran syncNavVisibility
  // before this async work resolved, so the nav item is still hidden).
  card.hidden = false;
  syncNavVisibility();

  // For Walmart, learn the configured provider so we can name it in the status
  // and, when none is set, warn that links are not commission-tracked yet (same
  // path the on-page Walmart overlay offers).
  let providerName: string | null = null;
  if (retailer === "walmart") {
    try {
      const view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
      const providerId = view.global.walmartLinkProvider;
      const configured = Boolean(
        providerId && view.providers.find((p) => p.id === providerId)?.configured,
      );
      providerName = providerId ? WALMART_PROVIDER_NAMES[providerId] ?? null : null;
      if (!configured) {
        const setup = document.createElement("button");
        setup.className = "link-inline";
        setup.type = "button";
        setup.textContent = dict.setup;
        setup.onclick = () =>
          void sendToBackground({ kind: "OPEN_OPTIONS", section: "sec-cat-walmartLink" });
        const note = document.createElement("p");
        note.className = "muted small";
        note.append(document.createTextNode(`${dict.notTracked} `), setup);
        status.before(note);
      }
    } catch {
      // Integrations unavailable: proceed with neutral labels.
    }
  }

  const generatingText =
    retailer === "walmart" && providerName ? dict.generatingProvider(providerName) : dict.generating;

  const run = async (): Promise<void> => {
    btn.disabled = true;
    results.hidden = true;
    results.replaceChildren();
    showStatus(generatingText);
    try {
      const res = await sendToBackground<GenerateLinkResult>({
        kind: "GENERATE_AFFILIATE_LINK",
        asin: productId,
        marketplace,
        url,
        retailer,
      });
      if (!res.ok || !res.url) {
        showStatus(res.error || dict.failed);
        return;
      }
      results.replaceChildren(resultRow(dict.linkLabel, res.url));
      results.hidden = false;
      void navigator.clipboard?.writeText(res.url).catch(() => {});
      showStatus(
        res.notice === "signInRequired"
          ? dict.copiedSignIn
          : res.notice
            ? dict.copiedPlain
            : dict.copied,
      );
    } catch {
      showStatus(dict.failed);
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = () => void run();
}

// localized inline like the other launcher cards. No em dashes (repo convention).
function wireCleanLink(locale: Settings["locale"]): void {
  const dict = {
    en: {
      nav: "Clean link",
      heading: "Clean a link",
      blurb:
        "Paste a product link that has someone else's tracking on it. We strip their attribution and give you a clean link plus one with your own tag.",
      placeholder: "Paste a product link",
      clean: "Clean",
      working: "Cleaning...",
      pasteFirst: "Paste a link first.",
      failed: "Could not clean that link. Check it and try again.",
      cleanLabel: "Clean link (no tags)",
      myLinkLabel: "My link (with your attribution)",
      expanded: "Expanded the short link first.",
      expandFailed: "Could not expand that short link, so we cleaned it as given.",
      strippedOnly:
        "We could not identify the product, so only known trackers were removed.",
      noTag: "Set up your affiliate tag in Settings to also get your own link.",
    },
    es: {
      nav: "Limpiar enlace",
      heading: "Limpia un enlace",
      blurb:
        "Pega un enlace de producto que tenga el seguimiento de otra persona. Quitamos su atribucion y te damos un enlace limpio y otro con tu propia etiqueta.",
      placeholder: "Pega un enlace de producto",
      clean: "Limpiar",
      working: "Limpiando...",
      pasteFirst: "Pega un enlace primero.",
      failed: "No pudimos limpiar ese enlace. Revisalo e intenta de nuevo.",
      cleanLabel: "Enlace limpio (sin etiquetas)",
      myLinkLabel: "Mi enlace (con tu atribucion)",
      expanded: "Primero expandimos el enlace corto.",
      expandFailed: "No pudimos expandir ese enlace corto, asi que lo limpiamos tal cual.",
      strippedOnly:
        "No pudimos identificar el producto, asi que solo quitamos los rastreadores conocidos.",
      noTag: "Configura tu etiqueta de afiliado en Ajustes para obtener tambien tu propio enlace.",
    },
    fr: {
      nav: "Nettoyer un lien",
      heading: "Nettoyer un lien",
      blurb:
        "Collez un lien produit qui porte le suivi de quelqu'un d'autre. Nous retirons son attribution et vous donnons un lien propre plus un avec votre propre balise.",
      placeholder: "Collez un lien produit",
      clean: "Nettoyer",
      working: "Nettoyage...",
      pasteFirst: "Collez d'abord un lien.",
      failed: "Impossible de nettoyer ce lien. Verifiez-le et reessayez.",
      cleanLabel: "Lien propre (sans balises)",
      myLinkLabel: "Mon lien (avec votre attribution)",
      expanded: "Nous avons d'abord deploye le lien court.",
      expandFailed: "Impossible de deployer ce lien court, nous l'avons donc nettoye tel quel.",
      strippedOnly:
        "Nous n'avons pas pu identifier le produit, seuls les traceurs connus ont ete retires.",
      noTag: "Configurez votre balise d'affiliation dans les Reglages pour obtenir aussi votre propre lien.",
    },
  }[resolveLocale(locale)];

  byId("cl-heading").textContent = dict.heading;
  byId("cl-blurb").textContent = dict.blurb;
  const navLink = document.getElementById("nav-clean-link");
  if (navLink) navLink.textContent = dict.nav;
  const input = byId<HTMLInputElement>("cl-input");
  input.placeholder = dict.placeholder;
  const btn = byId<HTMLButtonElement>("cl-clean");
  btn.textContent = dict.clean;
  const status = byId("cl-status");
  const results = byId("cl-results");

  const showStatus = (text: string): void => {
    status.textContent = text;
    status.hidden = !text;
  };

  const resultRow = (label: string, value: string): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "cl-result";
    const lbl = document.createElement("p");
    lbl.className = "muted small";
    lbl.textContent = label;
    const row = document.createElement("div");
    row.className = "row";
    const field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = value;
    row.append(field, copyButton(value));
    wrap.append(lbl, row);
    return wrap;
  };

  const run = async (): Promise<void> => {
    const url = input.value.trim();
    results.hidden = true;
    results.replaceChildren();
    if (!url) {
      showStatus(dict.pasteFirst);
      return;
    }
    // A short link is followed by the background, which needs host access to the
    // shortener's origin. Request it here, in the click gesture, before the send.
    const pattern = shortenerOriginPattern(url);
    if (pattern) {
      try {
        await chrome.permissions.request({ origins: [pattern] });
      } catch {
        // Denied or unavailable: the background will report expandFailed.
      }
    }
    btn.disabled = true;
    showStatus(dict.working);
    try {
      const res = await sendToBackground<CleanLinkResult>({ kind: "CLEAN_LINK", url });
      if (!res.ok) {
        showStatus(res.error || dict.failed);
        return;
      }
      results.replaceChildren();
      results.append(resultRow(dict.cleanLabel, res.cleanUrl ?? ""));
      if (res.myLink) results.append(resultRow(dict.myLinkLabel, res.myLink));
      results.hidden = false;
      const notes: string[] = [];
      if (res.expandFailed) notes.push(dict.expandFailed);
      else if (res.expandedFrom) notes.push(dict.expanded);
      if (!res.matched) notes.push(dict.strippedOnly);
      else if (!res.myLink) notes.push(dict.noTag);
      showStatus(notes.join(" "));
    } catch {
      showStatus(dict.failed);
    } finally {
      btn.disabled = false;
    }
  };

  btn.onclick = () => void run();
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void run();
    }
  });
}

// The "Desktop app" card: a two-step pairing flow. Connect asks the running app
// to show a 6-digit code (it pops it in the app), then the user types the code
// here to pair. Once paired, the token is stored and commands authenticate with
// it; Disconnect forgets it.
async function renderAppBridge(): Promise<void> {
  const disconnected = byId("app-bridge-disconnected");
  const pairing = byId("app-bridge-pairing");
  const connected = byId("app-bridge-connected");
  const status = byId("app-pair-status");

  const show = (state: "disconnected" | "pairing" | "connected") => {
    disconnected.hidden = state !== "disconnected";
    pairing.hidden = state !== "pairing";
    connected.hidden = state !== "connected";
  };
  // Android (Lemur): the app cannot answer on this device's loopback, so swap
  // the pairing flow for a pointer to the relay card below.
  if (await isAndroid()) {
    show("disconnected");
    disconnected.hidden = true;
    byId("app-bridge-text").hidden = true;
    byId("app-next-step").hidden = true;
    byId("app-bridge-mobile").hidden = false;
    return;
  }
  const paired = await isPairedLocal();
  show(paired ? "connected" : "disconnected");

  const syncStatus = byId("app-sync-status");
  byId<HTMLButtonElement>("app-sync-btn").onclick = () => void runSyncReconcile(syncStatus);
  // Already paired when the popup opens: quietly fill any empty settings both ways.
  if (paired) void autoFillFromDesktop();

  // Guide freshly-connected users to the (optional) next step: once they've
  // linked a license but haven't paired the desktop app, surface a hint so the
  // two separate connections don't get conflated.
  const auth = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  byId("app-next-step").hidden = !(auth.signedIn && !paired);

  byId<HTMLButtonElement>("app-connect-btn").onclick = async () => {
    status.textContent = t().appRequestingCode;
    const r = await sendToBackground<PairResult>({ kind: "REQUEST_PAIRING" });
    if (r.ok && r.stage === "pending") {
      show("pairing");
      status.textContent = t().appCodeShown;
      byId<HTMLInputElement>("app-code-input").focus();
    } else {
      status.textContent = r.message ?? t().appNotRunning;
    }
  };

  byId<HTMLButtonElement>("app-pair-submit").onclick = async () => {
    const code = byId<HTMLInputElement>("app-code-input").value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = t().appCodeInvalid;
      return;
    }
    status.textContent = t().appPairing;
    const r = await sendToBackground<PairResult>({ kind: "SUBMIT_PAIRING_CODE", code });
    if (r.ok && r.stage === "paired") {
      show("connected");
      status.textContent = t().appPaired;
      // Newly paired: fill any empty settings both ways so the two apps line up.
      void autoFillFromDesktop();
    } else {
      status.textContent = r.message ?? t().appPairFailed;
    }
  };

  byId<HTMLButtonElement>("app-unpair-btn").onclick = async () => {
    await sendToBackground({ kind: "UNPAIR_APP" });
    show("disconnected");
    status.textContent = "";
  };
}

// The "Send to another computer" card: link a desktop app running on a
// different machine (via the 6-digit code that app shows) and pick which linked
// computer the deal harvester falls back to when no app is running on this one.
// Only shown once an account is connected (the relay needs the license key).
async function renderRemoteDevices(): Promise<void> {
  const card = byId("relay-card");
  const signedOut = byId("relay-signed-out");
  const body = byId("relay-body");
  const status = byId("relay-status");
  const targetsLabel = byId("relay-targets-label");
  const targetsWrap = byId("relay-targets");

  const state = await sendToBackground<RelayStateView>({ kind: "RELAY_GET_STATE" });
  card.hidden = false;
  // Guided checklist: tick step 1 once signed in, step 3 once a computer is linked.
  byId("relay-step-1").classList.toggle("done", state.signedIn);
  byId("relay-step-3").classList.toggle("done", state.signedIn && state.targets.length > 0);
  if (!state.signedIn) {
    // Stay visible so a user who is not signed in sees WHY linking is unavailable
    // (it was hidden before, which read as "this feature does not exist").
    signedOut.hidden = false;
    body.hidden = true;
    return;
  }
  signedOut.hidden = true;
  body.hidden = false;
  renderRelayTargets(state, targetsWrap, targetsLabel, status);

  byId<HTMLButtonElement>("relay-link-btn").onclick = async () => {
    const input = byId<HTMLInputElement>("relay-code-input");
    const code = input.value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = "Enter the 6-digit code shown in the app on your other computer.";
      return;
    }
    status.textContent = "Linking...";
    const r = await sendToBackground<RelayClaimResult>({ kind: "RELAY_CLAIM_LINK", code });
    if (r.ok) {
      input.value = "";
      status.textContent = `Linked ${r.receiverLabel || "your other computer"}.`;
      const next = await sendToBackground<RelayStateView>({ kind: "RELAY_GET_STATE" });
      renderRelayTargets(next, targetsWrap, targetsLabel, status);
      byId("relay-step-3").classList.toggle("done", next.targets.length > 0);
    } else {
      status.textContent = r.error || "Could not link. Check the code and try again.";
    }
  };
}

function renderRelayTargets(
  state: RelayStateView,
  wrap: HTMLElement,
  label: HTMLElement,
  status: HTMLElement,
): void {
  wrap.replaceChildren();
  if (!state.targets.length) {
    label.hidden = true;
    return;
  }
  label.hidden = false;
  const only = state.targets.length === 1 ? state.targets[0] : undefined;
  const defaultId = state.defaultTarget?.instanceId ?? only?.receiverInstanceId ?? null;
  for (const target of state.targets) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "muted small";
    name.textContent = target.receiverLabel || "Linked computer";
    row.append(name);
    const isDefault = target.receiverInstanceId === defaultId;
    const btn = document.createElement("button");
    btn.className = isDefault ? "ghost" : "primary";
    btn.textContent = isDefault ? "Default" : "Make default";
    btn.disabled = isDefault;
    btn.onclick = async () => {
      await sendToBackground({
        kind: "RELAY_SET_DEFAULT_TARGET",
        target: { instanceId: target.receiverInstanceId, label: target.receiverLabel },
      });
      const next = await sendToBackground<RelayStateView>({ kind: "RELAY_GET_STATE" });
      renderRelayTargets(next, wrap, label, status);
      status.textContent = `Deals will send to ${target.receiverLabel || "this computer"} when the app is not running here.`;
    };
    row.append(btn);
    wrap.append(row);
  }
}

// The gear opens the full API Integrations settings page.
function wireOptions(): void {
  byId<HTMLButtonElement>("open-options").onclick = () => {
    chrome.runtime.openOptionsPage();
  };
  // "Setup guide": reopen the first-run walkthrough on demand (it also opens
  // itself once on a fresh install). Opens in its own tab.
  byId<HTMLAnchorElement>("open-onboarding").onclick = (event) => {
    event.preventDefault();
    void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  };
}

// Translate the static popup chrome: every element carrying data-i18n gets its
// text set, and data-i18n-ph sets an input/textarea placeholder. Interpolated
// strings (counts, times) are handled inline where they are built.
function applyStaticI18n(): void {
  const dict = t() as unknown as Record<string, unknown>;
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const value = dict[node.dataset.i18n ?? ""];
    if (typeof value === "string") node.textContent = value;
  }
  for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-ph]"))) {
    const value = dict[node.dataset.i18nPh ?? ""];
    if (typeof value === "string") {
      (node as HTMLInputElement | HTMLTextAreaElement).placeholder = value;
    }
  }
}

// Zoom for the whole popup. Chrome caps a popup at 800x600 and has no zoom of its
// own for it, so scale the document with CSS `zoom` and divide the body's size
// caps by the same factor (popup.css reads --z) so the window never exceeds the
// cap. Persisted in localStorage like the popup size; Ctrl +/-/0 also work.
const ZOOM_KEY = "ib_popup_zoom";
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;

function applyPopupZoom(z: number, reflow: boolean): void {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
  const root = document.documentElement;
  root.style.setProperty("--z", String(zoom));
  (root.style as CSSStyleDeclaration & { zoom: string }).zoom = String(zoom);
  // A saved drag-size was measured at the old zoom; drop it so the default
  // (which scales with --z) fits the new one.
  if (reflow) {
    document.body.style.width = "";
    document.body.style.height = "";
  }
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // Best-effort; zoom just will not persist.
  }
}

function currentPopupZoom(): number {
  const z = Number(document.documentElement.style.getPropertyValue("--z"));
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function wirePopupZoom(): void {
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (Number.isFinite(saved) && saved > 0) applyPopupZoom(saved, false);
  } catch {
    // Storage unavailable: stay at 100%.
  }
  byId<HTMLButtonElement>("zoom-out").onclick = () => applyPopupZoom(currentPopupZoom() - 0.1, true);
  byId<HTMLButtonElement>("zoom-in").onclick = () => applyPopupZoom(currentPopupZoom() + 0.1, true);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      applyPopupZoom(currentPopupZoom() + 0.1, true);
    } else if (e.key === "-") {
      e.preventDefault();
      applyPopupZoom(currentPopupZoom() - 0.1, true);
    } else if (e.key === "0") {
      e.preventDefault();
      applyPopupZoom(1, true);
    }
  });
}

async function renderPageStatus(): Promise<void> {
  const text = byId("page-status-text");
  const list = byId("page-status-list");
  // An admin notice from the operational flags feed (for example, "We paused
  // the storefront check while Amazon settles a layout change"), shown above
  // the page status so a user knows why a tool went quiet.
  const notice = byId("page-status-notice");
  try {
    const flags = await getFlags();
    if (flags?.notice) {
      notice.textContent = flags.notice;
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  } catch {
    notice.hidden = true;
  }
  try {
    const tab = await activePageTab();
    // Amazon and Walmart are both supported; the content script answers
    // GET_PAGE_STATUS on either. Any other host has no tools to report.
    const onSupportedSite =
      tab?.url?.includes("amazon.com") || tab?.url?.includes("walmart.com");
    if (!tab?.id || !onSupportedSite) {
      text.textContent = t().openAmazonToStart;
      return;
    }
    const status = await chrome.tabs.sendMessage<unknown, PageStatus>(tab.id, { kind: "GET_PAGE_STATUS" });
    if (!status || status.pageType === "other") {
      text.textContent = t().noToolsOnPage;
      return;
    }
    text.textContent = {
      product: t().productToolsActive,
      "order-history": t().orderScanReady,
      storefront: t().storefrontCheckupReady,
      "creator-upload": t().uploadHelperReady,
      "creator-manage": t().sumVideoMoney,
      "creator-post": t().sumYouTubeStatus,
      "manage-content": t().sumYouTubeStatus,
      "campaign-grid": t().campaignRadarActive,
      "campaign-detail": t().sumCampaignDetail,
      search: t().searchOverlayActive,
      "brand-store": t().storeOverlayActive,
      discovery: t().trendRadarActive,
      deals: t().dealsOverlayActive,
      "idea-list": t().ideaListActive,
    }[status.pageType];
    if (status.toolSummaries.length > 0) {
      list.hidden = false;
      list.replaceChildren(
        ...status.toolSummaries.map((s) => {
          const li = document.createElement("li");
          const label = document.createElement("span");
          label.textContent = s.label;
          const value = document.createElement("b");
          value.textContent = s.value;
          li.append(label, value);
          return li;
        }),
      );
    }
  } catch {
    text.textContent = t().reloadTabToActivate;
  }
}

// Set after a successful key connect/switch and shown as a banner (until
// dismissed) so the user can see which account and key are now live.
let keyConnectedNotice: { email: string | null; keyTail: string | null } | null = null;

async function renderAccount(): Promise<void> {
  const signedOut = byId("signed-out");
  const signedIn = byId("signed-in");
  const errorEl = byId("auth-error");

  const status = await sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" });
  const settings = await getSettings();

  signedOut.hidden = status.signedIn;
  signedIn.hidden = !status.signedIn;

  if (status.signedIn) {
    byId("account-email").textContent = status.email ?? t().connectedFallback;
    byId("account-key-tail").textContent = status.keyTail ? t().accountKeyTail(status.keyTail) : "";

    const banner = byId("key-connected-banner");
    banner.hidden = !keyConnectedNotice;
    if (keyConnectedNotice) {
      byId("key-banner-title").textContent = t().keyConnectedTitle;
      byId("key-banner-body").textContent = t().keyConnectedBody(
        keyConnectedNotice.email ?? t().connectedFallback,
        keyConnectedNotice.keyTail ?? "",
      );
      const dismiss = byId<HTMLButtonElement>("key-banner-dismiss");
      dismiss.setAttribute("aria-label", t().keyBannerDismiss);
      dismiss.title = t().keyBannerDismiss;
      dismiss.onclick = () => {
        keyConnectedNotice = null;
        banner.hidden = true;
      };
    }

    byId("change-key-heading").textContent = t().changeKeyHeading;
    byId("change-key-hint").textContent = t().changeKeyHint;
    const changeBtn = byId<HTMLButtonElement>("license-change-btn");
    changeBtn.textContent = t().changeKeyBtn;
    const changeInput = byId<HTMLInputElement>("license-change-input");
    const changeError = byId("license-change-error");
    // signIn() only overwrites the stored key once the new one verifies, so a
    // typo here leaves the current connection untouched.
    changeBtn.onclick = async () => {
      const licenseKey = changeInput.value.trim();
      if (!licenseKey) return;
      changeBtn.disabled = true;
      changeError.hidden = true;
      const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
      changeBtn.disabled = false;
      if (result.ok) {
        changeInput.value = "";
        keyConnectedNotice = { email: result.email ?? null, keyTail: licenseKey.slice(-4) };
        await renderAccount();
        byId("key-connected-banner").scrollIntoView({ block: "nearest" });
      } else {
        changeError.hidden = false;
        changeError.textContent = result.error ?? t().licenseDidNotVerify;
      }
    };
    const toggle = byId<HTMLInputElement>("sync-toggle");
    toggle.checked = settings.syncEnabled;
    toggle.onchange = () => void patchSettings({ syncEnabled: toggle.checked });

    // Opt-in (off by default): contribute product facts to the shared catalogue.
    const contribute = byId<HTMLInputElement>("contribute-toggle");
    contribute.checked = settings.contributeCatalogue;
    contribute.onchange = () => void patchSettings({ contributeCatalogue: contribute.checked });
    byId("sync-status").textContent =
      status.queueDepth > 0
        ? t().findingsWaiting(status.queueDepth)
        : status.lastSyncAt
          ? t().lastSynced(new Date(status.lastSyncAt).toLocaleTimeString())
          : t().nothingToSync;
    // Name the endpoint holding the queue (only while something is waiting).
    if (status.queueDepth > 0 && status.lastSyncError) {
      byId("sync-status").textContent += `. ${t().syncProblem(status.lastSyncError)}`;
    }
    byId("disconnect-btn").onclick = async () => {
      keyConnectedNotice = null;
      await sendToBackground({ kind: "SIGN_OUT" });
      await renderAccount();
    };
    return;
  }

  const connect = byId<HTMLButtonElement>("connect-btn");
  const input = byId<HTMLInputElement>("license-input");
  connect.onclick = async () => {
    const licenseKey = input.value.trim();
    if (!licenseKey) return;
    connect.disabled = true;
    errorEl.hidden = true;
    const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
    connect.disabled = false;
    if (result.ok) {
      input.value = "";
      keyConnectedNotice = { email: result.email ?? null, keyTail: licenseKey.slice(-4) };
      await renderAccount();
    } else {
      errorEl.hidden = false;
      errorEl.textContent = result.error ?? t().licenseDidNotVerify;
    }
  };
}

async function renderSettings(): Promise<void> {
  const settings = await getSettings();

  const language = byId<HTMLSelectElement>("set-language");
  language.value = settings.locale;
  language.onchange = async () => {
    await patchSettings({ locale: language.value as Settings["locale"] });
    // Re-render the whole popup in the chosen language. A reload is the simplest
    // way to retranslate both the static chrome and the dynamic status lines.
    location.reload();
  };

  bindNumber("set-commission", settings.commissionRatePct, (v) => ({ commissionRatePct: v }));
  bindNumber("set-hourly", settings.hourlyValue, (v) => ({ hourlyValue: v }));
  bindNumber("set-minutes", settings.minutesPerVideo, (v) => ({ minutesPerVideo: v }));
  bindNumber("set-gap", settings.contentGapThreshold, (v) => ({ contentGapThreshold: v }));

  // Auto-accept master switch (the full rules live on the options page). Turning
  // it ON asks once, because it acts on the creator's Amazon account in the
  // background; turning it off is immediate.
  const autoAccept = byId<HTMLInputElement>("auto-accept-enabled");
  autoAccept.checked = settings.autoAccept.enabled;
  autoAccept.onchange = () => {
    if (autoAccept.checked && !window.confirm(t().autoEnableConfirm)) {
      autoAccept.checked = false;
      return;
    }
    void getSettings().then((current) =>
      patchSettings({ autoAccept: { ...current.autoAccept, enabled: autoAccept.checked } }),
    );
  };
  byId<HTMLAnchorElement>("auto-accept-settings").onclick = (event) => {
    event.preventDefault();
    void chrome.tabs.create({ url: chrome.runtime.getURL("options.html#sec-auto-accept") });
  };

  const storefront = byId<HTMLInputElement>("set-storefront");
  storefront.value = settings.storefrontHandle ?? "";
  storefront.onchange = () =>
    void patchSettings({ storefrontHandle: storefront.value.trim() || null });

  for (const tool of [
    "walmart",
    "target",
    "crossRetailer",
    "videoCounts",
    "videoLandscape",
    "videoLikes",
    "approved",
    "calculator",
    "storefront",
    "ordersButler",
    "searchOverlay",
    "dealSignals",
    "socialSchedule",
    "storeOverlay",
    "trendRadar",
    "ideaListOverlay",
    "dealsOverlay",
    "globalMaximizer",
    "campaignMatcher",
    "campaignRadar",
    "earningsOverlay",
    "watchlist",
    "messageCards",
    "brandConversations",
    "brandKeywords",
    "messageTemplates",
    "benableBadge",
  ] as const) {
    const box = byId<HTMLInputElement>(`tool-${tool}`);
    box.checked = settings.tools[tool];
    box.onchange = async () => {
      const current = await getSettings();
      await patchSettings({ tools: { ...current.tools, [tool]: box.checked } });
      if (tool === "watchlist") await renderWatchlist();
    };
  }

  // Campaign Radar availability markets. AU is not in the manifest's required
  // host_permissions, so ticking it requests the amazon.com.au origin first
  // (rides the optional_host_permissions wildcard); a declined prompt unticks
  // the box and explains, so the setting never claims a market we cannot fetch.
  const auDenied = byId("avail-au-denied");
  for (const market of AVAILABILITY_MARKETS) {
    const box = byId<HTMLInputElement>(`avail-${market}`);
    box.checked = settings.availabilityMarkets.includes(market);
    box.onchange = async () => {
      const origin = OPTIONAL_MARKET_ORIGINS[market];
      if (box.checked && origin) {
        let granted = false;
        try {
          granted = await chrome.permissions.request({ origins: [origin] });
        } catch {
          granted = false;
        }
        auDenied.hidden = granted;
        if (!granted) {
          box.checked = false;
          return;
        }
      }
      const current = await getSettings();
      const next = current.availabilityMarkets.filter((m) => m !== market);
      if (box.checked) next.push(market);
      // Keep the picker's display order, not click order.
      await patchSettings({
        availabilityMarkets: AVAILABILITY_MARKETS.filter((m) => next.includes(m)),
      });
    };
  }
}

// A rendered row waiting on its enrichment: the thumbnail to fill, the title to
// upgrade from a bare ASIN, and the chip strip to populate. `ref` carries the
// batch request (and where a fetched image/title is written back).
type RowHandle = {
  ref: RowEnrichRef;
  thumb: HTMLImageElement;
  title: HTMLElement;
  signals: HTMLElement;
};

// A 34px product thumbnail; renders a neutral placeholder box until (or unless)
// an image URL is known. A broken image URL falls back to the placeholder.
function makeThumb(imageUrl: string | null, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = imageUrl ? "row-thumb" : "row-thumb placeholder";
  img.loading = "lazy";
  // The row already shows the product name as visible text next to the thumb, so
  // the image is decorative: keep alt empty while it is a placeholder (or after a
  // failed load) so the browser does not paint the alt string + broken-image
  // glyph inside the box, which reads as "images broken".
  img.alt = imageUrl ? alt : "";
  img.dataset.alt = alt;
  if (imageUrl) img.src = imageUrl;
  img.onerror = () => {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("placeholder");
  };
  return img;
}

function setThumb(img: HTMLImageElement, imageUrl: string): void {
  img.src = imageUrl;
  img.alt = img.dataset.alt ?? "";
  img.classList.remove("placeholder");
}

function makeChip(kind: "cc" | "spcc", label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `row-chip ${kind}`;
  span.textContent = label;
  return span;
}

function makeRatePill(label: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "row-rate";
  span.textContent = label;
  return span;
}

// Paint one row's badge: fill the image, upgrade a bare-ASIN title, and lay out
// the CC / SPCC / commission chips (in that order, matching Orders Butler).
function applyRowBadge(handle: RowHandle, badge: RowBadge): void {
  if (badge.imageUrl) setThumb(handle.thumb, badge.imageUrl);
  if (badge.title && handle.title.dataset.hasTitle !== "1") {
    handle.title.textContent = badge.title;
    handle.title.dataset.hasTitle = "1";
  }
  handle.signals.replaceChildren();
  if (badge.cc) handle.signals.append(makeChip("cc", t().radarChipCc));
  if (badge.spcc) handle.signals.append(makeChip("spcc", t().radarChipSpcc));
  if (badge.ratePct != null) handle.signals.append(makeRatePill(t().tileCampaignRate(badge.ratePct)));
}

// One batch round-trip for a card's rows, then patch each in place. Runs after
// the card is drawn so the list is interactive immediately; nodes detached by a
// re-render before this resolves are simply patched off-screen (harmless).
async function enrichRowHandles(handles: RowHandle[]): Promise<void> {
  if (handles.length === 0) return;
  const { badges } = await sendToBackground<RowBadgesResult>({
    kind: "ENRICH_ROWS",
    refs: handles.map((h) => h.ref),
  });
  for (const handle of handles) {
    const badge = badges[handle.ref.asin.toUpperCase()];
    if (badge) applyRowBadge(handle, badge);
  }
}

// The Watchlist card: the products the background poller is watching, each with
// per-condition toggles and a remove. Hidden entirely when the watchlist tool
// is off, so a user who does not want it never sees the card.
async function renderWatchlist(): Promise<void> {
  const card = byId("watchlist-card");
  const list = byId("watchlist-list");
  const empty = byId("watchlist-empty");

  const settings = await getSettings();
  if (!settings.tools.watchlist) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  // The watchlist poller opens hidden tabs, which stays desktop-only.
  byId("watchlist-mobile-note").hidden = !(await isAndroid());

  const { items } = await sendToBackground<WatchlistResult>({ kind: "GET_WATCHLIST" });
  list.replaceChildren();
  empty.hidden = items.length > 0;

  const conditions: Array<{ key: WatchCondition; label: string }> = [
    { key: "back_in_stock", label: t().watchCondBackInStock },
    { key: "slot_opens", label: t().watchCondSlotOpens },
    { key: "price_drop", label: t().watchCondPriceDrop },
  ];

  const handles: RowHandle[] = [];
  for (const item of items) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "watchlist-head";
    const thumb = makeThumb(item.imageUrl ?? null, item.title ?? item.asin);
    const title = document.createElement("span");
    title.className = "watchlist-title";
    title.textContent = item.title ?? item.asin;
    if (item.title) title.dataset.hasTitle = "1";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost small";
    remove.textContent = t().watchRemoveShort;
    remove.onclick = async () => {
      await sendToBackground<WatchlistResult>({
        kind: "REMOVE_FROM_WATCHLIST",
        asin: item.asin,
        marketplace: item.marketplace,
      });
      await renderWatchlist();
    };
    head.append(thumb, title, remove);
    li.append(head);

    const signals = document.createElement("div");
    signals.className = "row-signals";
    li.append(signals);
    handles.push({
      ref: {
        asin: item.asin,
        marketplace: item.marketplace,
        source: "watchlist",
        needsImage: !(item.imageUrl && item.title),
      },
      thumb,
      title,
      signals,
    });

    const conds = document.createElement("div");
    conds.className = "watchlist-conds";
    for (const cond of conditions) {
      const label = document.createElement("label");
      label.className = "watchlist-cond";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = item.notifyOn.includes(cond.key);
      box.onchange = () => {
        const next = conditions
          .map((c) => c.key)
          .filter((key) =>
            key === cond.key ? box.checked : item.notifyOn.includes(key),
          );
        item.notifyOn = next;
        void sendToBackground<WatchlistResult>({
          kind: "SET_WATCH_CONDITIONS",
          asin: item.asin,
          marketplace: item.marketplace,
          notifyOn: next,
        });
      };
      const span = document.createElement("span");
      span.textContent = cond.label;
      label.append(box, span);
      conds.append(label);
    }
    li.append(conds);
    list.append(li);
  }

  void enrichRowHandles(handles);
}

// "My lists" card: the user-named product collections built from the search
// overlay's action menu. Read-only management here (open a product, remove an
// item, delete a list); adding happens on-page.
async function renderProductLists(): Promise<void> {
  const card = byId("lists-card");
  const list = byId("lists-list");
  const empty = byId("lists-empty");

  // Default to an empty result: sendToBackground resolves to undefined if the
  // background channel closes without a response, and an unguarded destructure
  // would crash the popup on load.
  const { lists } = (await sendToBackground<ProductListsResult>({ kind: "GET_PRODUCT_LISTS" })) ?? {
    lists: [],
  };
  list.replaceChildren();
  empty.hidden = lists.length > 0;
  card.hidden = false;

  const handles: RowHandle[] = [];
  for (const pl of lists) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "watchlist-head";
    const title = document.createElement("span");
    title.className = "watchlist-title";
    title.textContent = `${pl.name} · ${t().popupListItems(pl.items.length)}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost small";
    del.textContent = t().popupListDelete;
    del.onclick = async () => {
      await sendToBackground<ProductListsResult>({ kind: "DELETE_PRODUCT_LIST", id: pl.id });
      await renderProductLists();
    };
    head.append(title, del);
    li.append(head);

    for (const item of pl.items) {
      const row = document.createElement("div");
      row.className = "list-item-row";
      const thumb = makeThumb(item.imageUrl, item.title ?? item.asin);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "linklike small";
      open.textContent = item.title ?? item.asin;
      if (item.title) open.dataset.hasTitle = "1";
      open.onclick = () => {
        const url = `https://www.${item.marketplace}/dp/${item.asin}`;
        void sendToBackground<void>({ kind: "OPEN_URL", url });
      };
      const signals = document.createElement("div");
      signals.className = "row-signals";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost small";
      remove.textContent = t().watchRemoveShort;
      remove.onclick = async () => {
        await sendToBackground<ProductListsResult>({
          kind: "REMOVE_FROM_PRODUCT_LIST",
          listId: pl.id,
          asin: item.asin,
          marketplace: item.marketplace,
        });
        await renderProductLists();
      };
      row.append(thumb, open, signals, remove);
      li.append(row);
      handles.push({
        ref: {
          asin: item.asin,
          marketplace: item.marketplace,
          source: "list",
          listId: pl.id,
          needsImage: !(item.imageUrl && item.title),
        },
        thumb,
        title: open,
        signals,
      });
    }

    list.append(li);
  }

  void enrichRowHandles(handles);
}

function bindNumber(
  id: string,
  value: number,
  toPatch: (value: number) => Partial<Settings>,
): void {
  const input = byId<HTMLInputElement>(id);
  input.value = String(value);
  input.onchange = () => {
    const parsed = parseFloat(input.value);
    if (!Number.isNaN(parsed) && parsed >= 0) void patchSettings(toPatch(parsed));
  };
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup element missing: ${id}`);
  return el as T;
}
