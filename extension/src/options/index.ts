import {
  ADAPTERS,
  CATEGORY_ORDER,
  DEEPLINK_PROVIDER_IDS,
  WALMART_LINK_PROVIDER_IDS,
  getAdapter,
} from "../integrations/registry";
import type { IntegrationAdapter, IntegrationCategory } from "../integrations/types";
import { OPTIONS_CATALOG, type OptionsDict } from "./strings";
import { resolveLocale } from "../i18n";
import { getSettings, patchSettings } from "../storage/store";
import type {
  Settings,
  VoiceoverDisclosureKey,
  VoiceoverHookStyle,
  VoiceoverPacing,
  VoiceoverSettings,
  VoiceoverVideoType,
} from "../storage/schema";
import {
  LENGTH_MAX_SECONDS,
  LENGTH_MIN_SECONDS,
  clampLength,
} from "../tools/my-link/voiceover-prompt";
import {
  sendToBackground,
  type CreatorApiBackupStatus,
  type IntegrationsView,
  type IntegrationTestOutcome,
  type IntegrationView,
} from "../shared/messages";
import { ONBOARDING_VIDEO_ID, API_INTEGRATIONS_TUTORIAL_URL } from "../shared/constants";

// The API Integrations options page. All credentials are handled by the
// background worker; this page only shows non-secret values and status, and
// requests host permission (from the user's click) before a provider is tested.

const ASSOCIATES = "associates";
// The Amazon Creators API (PA-API) card embeds the same setup walkthrough the
// desktop app plays on its API Integrations > Creator API screen, so the
// credential paste has a video to follow right where the keys are entered.
const CREATORS_API = "creatorsApi";
// Branded links authenticate with the signed-in license key instead of a stored
// credential, so "configured" for this provider means "signed in".
const IB_LINKS = "influencerbutler";

let D: OptionsDict;
let view: IntegrationsView;
let settings: Settings;

void init();

async function init(): Promise<void> {
  settings = await getSettings();
  D = OPTIONS_CATALOG[resolveLocale(settings.locale)];
  view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  renderChrome();
  renderGeneral();
  renderAffiliateRoutingStrategy();
  renderCategories();
  renderVoiceover();
  // Nav depends on the sections above already being in the DOM.
  renderSideNav();
  setupScrollSpy();
}

// Build the left section nav from the sections rendered above and wire scroll-to
// (plain href anchors, with a scroll-margin offset handled in CSS). Grouped like
// the desktop app's Settings sub-nav: General, then API Integrations, then
// Voiceover Butler.
function renderSideNav(): void {
  const nav = byId("side-nav");
  nav.replaceChildren();

  type NavItem = { id: string; text: string };
  type NavGroup = { title: string | null; items: NavItem[] };
  const groups: NavGroup[] = [
    { title: null, items: [{ id: "sec-general", text: D.navGeneral }] },
    {
      title: D.navApiIntegrations,
      items: [
        { id: "sec-routing", text: D.navAffiliateRouting },
        ...CATEGORY_ORDER.filter((c) => ADAPTERS.some((a) => a.category === c)).map((c) => ({
          id: `sec-cat-${c}`,
          text: categoryLabel(c),
        })),
      ],
    },
    { title: null, items: [{ id: "sec-voiceover", text: D.voHeading }] },
  ];

  for (const group of groups) {
    if (group.title) {
      const heading = document.createElement("p");
      heading.className = "side-nav-group";
      heading.textContent = group.title;
      nav.append(heading);
    }
    for (const item of group.items) {
      const link = document.createElement("a");
      link.href = `#${item.id}`;
      link.textContent = item.text;
      if (group.title) link.classList.add("side-nav-child");
      nav.append(link);
    }
  }
}

// Highlight the nav link for the section currently in view. Uses an
// IntersectionObserver keyed to the top of the viewport (below the sticky
// header) so the active item tracks scrolling, like the desktop scroll-spy.
function setupScrollSpy(): void {
  const links = new Map<string, HTMLAnchorElement>();
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("#side-nav a"))) {
    links.set(link.getAttribute("href")?.slice(1) ?? "", link);
  }
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("main .settings-section[id]"),
  );
  if (sections.length === 0) return;

  const setActive = (id: string): void => {
    for (const [linkId, link] of links) {
      if (linkId === id) link.dataset.active = "1";
      else delete link.dataset.active;
    }
  };
  const first = sections[0];
  if (first) setActive(first.id);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(entry.target.id);
      }
    },
    { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
  );
  for (const section of sections) observer.observe(section);
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`options element missing: ${id}`);
  return el as T;
}

function label(key: string): string {
  return (D as unknown as Record<string, string>)[key] ?? key;
}

function providerView(id: string): IntegrationView {
  const found = view.providers.find((p) => p.id === id);
  if (found) return found;
  return { id, enabled: false, configured: false, values: {}, lastTest: { status: "untested", at: null, message: null }, routingParticipates: true };
}

function renderChrome(): void {
  document.title = `Influencer Butler: ${D.pageTitle}`;
  byId("page-title").textContent = D.pageTitle;
  byId("page-intro").textContent = D.pageIntro;
  byId("security-note").textContent = D.securityNote;
  byId("affiliate-disclosure").textContent = D.affiliateDisclosure;
  byId("title-general").textContent = D.navGeneral;
  byId("title-routing").textContent = D.routingStrategyTitle;
  byId("label-startup").textContent = D.testOnStartup;
  byId("run-all").textContent = D.runAllTests;
}

// General section: run-all-tests and the test-on-startup toggle (the rest of the
// old globals card moved into the Affiliate Routing Strategy section below).
function renderGeneral(): void {
  const startup = byId<HTMLInputElement>("test-on-startup");
  startup.checked = view.global.testOnStartup;
  startup.onchange = () => void setGlobal({ testOnStartup: startup.checked });

  const runAll = byId<HTMLButtonElement>("run-all");
  const status = byId("run-all-status");
  runAll.onclick = async () => {
    runAll.disabled = true;
    status.textContent = D.runningTests;
    // Ask for every host any configured provider needs, in one prompt.
    const needed = [
      ...new Set(
        view.providers
          .filter((p) => p.configured)
          .flatMap((p) => getAdapter(p.id)?.hosts ?? []),
      ),
    ];
    if (needed.length) await requestOrigins(needed);
    const results = await sendToBackground<Record<string, IntegrationTestOutcome>>({
      kind: "TEST_ALL_INTEGRATIONS",
    });
    view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
    renderCategories();
    renderAffiliateRoutingStrategy();
    runAll.disabled = false;
    const failed = Object.values(results).filter((r) => !r.ok).length;
    status.textContent = failed === 0 ? D.statusOk : `${failed} ${D.statusFail}`;
  };
}

// The routing-strategy roster, mapping each roster row to the extension provider
// whose connection state drives its status pill.
const ROUTING_ROSTER: Array<{ key: string; labelKey: keyof OptionsDict; providerId: string }> = [
  { key: "amazon", labelKey: "routingRowAmazon", providerId: ASSOCIATES },
  { key: "levanta", labelKey: "provLevanta", providerId: "levanta" },
  { key: "archer", labelKey: "provArcher", providerId: "archer" },
  { key: "mavely", labelKey: "provMavely", providerId: "mavely" },
  { key: "walmart", labelKey: "routingRowWalmart", providerId: "walmartCreator" },
];

// Providers that authenticate with a signed-in session/license rather than a
// stored API key: a saved credential reads as "Signed in", not "Connected".
const SESSION_PROVIDERS = new Set([IB_LINKS, "mavely", "walmartCreator"]);

// Map a provider's connection state to a routing status pill (text + state key).
function routingStatus(providerId: string): { text: string; state: "success" | "error" | "idle" } {
  const pv = providerView(providerId);
  if (pv.lastTest.status === "fail") return { text: D.statusFail, state: "error" };
  if (!pv.configured) return { text: D.statusNotConnected, state: "idle" };
  if (pv.lastTest.status === "ok") {
    return SESSION_PROVIDERS.has(providerId)
      ? { text: D.statusSignedIn, state: "success" }
      : { text: D.statusOk, state: "success" };
  }
  // Configured but not yet tested.
  return SESSION_PROVIDERS.has(providerId)
    ? { text: D.statusSignedIn, state: "success" }
    : { text: D.statusReady, state: "idle" };
}

// Affiliate Routing Strategy: the consolidated routing card (mirrors the desktop
// app). Holds the highest-commission master toggle, the "rewrite links" switch,
// the provider roster, and the deeplink/Walmart provider pickers that used to
// live in the globals card.
function renderAffiliateRoutingStrategy(): void {
  const root = byId("affiliate-routing-strategy");
  root.replaceChildren();
  const card = document.createElement("section");
  card.className = "card";

  const hint = document.createElement("p");
  hint.className = "routing-hint small";
  hint.textContent = D.routingStrategyHint;
  card.append(hint);

  // Master toggle: pick the highest-commission provider per product.
  const master = document.createElement("label");
  master.className = "routing-toggle";
  const masterBox = document.createElement("input");
  masterBox.type = "checkbox";
  masterBox.className = "switch";
  masterBox.checked = view.global.useHighestCommission;
  masterBox.onchange = () => void setGlobal({ useHighestCommission: masterBox.checked });
  const masterCopy = document.createElement("span");
  masterCopy.className = "routing-toggle-copy";
  const masterTitle = document.createElement("span");
  masterTitle.className = "routing-toggle-title";
  masterTitle.textContent = D.routingUseHighest;
  const masterHint = document.createElement("span");
  masterHint.className = "routing-toggle-hint";
  masterHint.textContent = D.routingUseHighestHint;
  masterCopy.append(masterTitle, masterHint);
  master.append(masterBox, masterCopy);
  card.append(master);

  // The overall "rewrite links" switch (was the globals affiliate-routing
  // toggle): when off, Copy my link hands back plain tagged Amazon links.
  const rewrite = document.createElement("label");
  rewrite.className = "toggle";
  rewrite.style.marginTop = "14px";
  const rewriteBox = document.createElement("input");
  rewriteBox.type = "checkbox";
  rewriteBox.checked = view.global.affiliateRoutingEnabled;
  rewriteBox.onchange = () => void setGlobal({ affiliateRoutingEnabled: rewriteBox.checked });
  const rewriteLabel = document.createElement("span");
  rewriteLabel.textContent = D.affiliateRouting;
  rewrite.append(rewriteBox, rewriteLabel);
  card.append(rewrite);

  // Provider roster: which connected providers may take part in routing.
  const roster = view.global.routingProviders ?? {};
  const providers = document.createElement("div");
  providers.className = "routing-providers";
  for (const row of ROUTING_ROSTER) {
    const label = document.createElement("label");
    label.className = "routing-row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = roster[row.key] !== false;
    box.onchange = () => {
      const next = { ...(view.global.routingProviders ?? {}), [row.key]: box.checked };
      void setGlobal({ routingProviders: next });
    };
    const name = document.createElement("span");
    name.className = "routing-row-label";
    name.textContent = D[row.labelKey];
    const status = document.createElement("span");
    status.className = "routing-status";
    const st = routingStatus(row.providerId);
    status.textContent = st.text;
    status.dataset.state = st.state;
    label.append(box, name, status);
    providers.append(label);
  }
  card.append(providers);

  // Deeplink + Walmart provider pickers (moved from the old globals card).
  const selects = document.createElement("div");
  selects.className = "routing-selects";
  card.append(selects);

  const deeplinkField = document.createElement("label");
  deeplinkField.className = "field";
  const deeplinkLabel = document.createElement("span");
  deeplinkLabel.textContent = D.primaryDeeplink;
  const select = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = D.primaryDeeplinkNone;
  select.append(none);
  for (const id of DEEPLINK_PROVIDER_IDS) {
    const adapter = getAdapter(id);
    if (!adapter) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label(adapter.labelKey);
    select.append(opt);
  }
  select.value = view.global.primaryDeeplinkProvider ?? "";
  deeplinkField.append(deeplinkLabel, select);
  selects.append(deeplinkField);

  const deeplinkHint = document.createElement("p");
  deeplinkHint.className = "muted small";
  deeplinkHint.style.margin = "6px 0 0";
  deeplinkHint.style.maxWidth = "62ch";
  deeplinkHint.textContent = D.primaryDeeplinkHint;
  selects.append(deeplinkHint);

  // Branded links selected with nobody signed in silently does nothing: routing
  // keeps handing back plain tagged Amazon links. Say so rather than let the
  // user guess.
  const warning = document.createElement("p");
  warning.className = "warn";
  const syncWarning = (): void => {
    const needsSignIn = select.value === IB_LINKS && !providerView(IB_LINKS).configured;
    warning.textContent = needsSignIn ? D.primaryDeeplinkSignIn : "";
    warning.hidden = !needsSignIn;
  };
  syncWarning();
  selects.append(warning);
  select.onchange = () => {
    syncWarning();
    void setGlobal({ primaryDeeplinkProvider: select.value || null });
  };

  const wmField = document.createElement("label");
  wmField.className = "field";
  const wmLabel = document.createElement("span");
  wmLabel.textContent = D.walmartLink;
  const wmSelect = document.createElement("select");
  const wmNone = document.createElement("option");
  wmNone.value = "";
  wmNone.textContent = D.walmartLinkNone;
  wmSelect.append(wmNone);
  for (const id of WALMART_LINK_PROVIDER_IDS) {
    const adapter = getAdapter(id);
    if (!adapter) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label(adapter.labelKey);
    wmSelect.append(opt);
  }
  wmSelect.value = view.global.walmartLinkProvider ?? "";
  wmSelect.onchange = () => void setGlobal({ walmartLinkProvider: wmSelect.value || null });
  wmField.append(wmLabel, wmSelect);
  selects.append(wmField);

  const wmHint = document.createElement("p");
  wmHint.className = "muted small";
  wmHint.style.margin = "6px 0 0";
  wmHint.textContent = D.walmartLinkHint;
  selects.append(wmHint);

  root.append(card);
}

async function setGlobal(partial: Partial<IntegrationsView["global"]>): Promise<void> {
  view.global = await sendToBackground<IntegrationsView["global"]>({
    kind: "SET_INTEGRATION_GLOBAL",
    partial,
  });
}

function renderCategories(): void {
  const root = byId("categories");
  root.replaceChildren();
  for (const category of CATEGORY_ORDER) {
    const adapters = ADAPTERS.filter((a) => a.category === category);
    if (adapters.length === 0) continue;
    // Each category is its own scroll-to section with a title, so the left nav
    // can jump to it and scroll-spy can highlight it.
    const section = document.createElement("section");
    section.className = "settings-section";
    section.id = `sec-cat-${category}`;
    const heading = document.createElement("h3");
    heading.className = "section-title";
    heading.textContent = categoryLabel(category);
    section.append(heading);
    const card = document.createElement("section");
    card.className = "card";
    for (const adapter of adapters) card.append(renderProvider(adapter));
    section.append(card);
    root.append(section);
  }
}

function categoryLabel(category: IntegrationCategory): string {
  const map: Record<IntegrationCategory, string> = {
    ai: D.catAi,
    productData: D.catProductData,
    affiliateTag: D.catAffiliateTag,
    deeplink: D.catDeeplink,
    affiliateNetwork: D.catAffiliateNetwork,
    walmartLink: D.catWalmartLink,
  };
  return map[category];
}

// Voiceover Butler settings: the first feature-settings section on this page
// (everything above is API integrations). Non-secret feature config, so it
// writes chrome.storage.local directly via patchSettings like the popup does,
// with no background message. The Save handler always writes the WHOLE
// voiceover object: patchSettings shallow-merges, so a partial nested patch
// would drop sibling keys (see the warning in storage/schema.ts).
function renderVoiceover(): void {
  const root = byId("voiceover");
  root.replaceChildren();
  const vo = settings.voiceover;

  const section = document.createElement("section");
  section.className = "settings-section";
  section.id = "sec-voiceover";
  const heading = document.createElement("h3");
  heading.className = "section-title";
  heading.textContent = D.voHeading;
  const card = document.createElement("section");
  card.className = "card";

  const intro = document.createElement("p");
  intro.className = "muted small";
  intro.textContent = D.voIntro;
  card.append(intro);

  const group = (title: string): HTMLElement => {
    const block = document.createElement("div");
    block.className = "provider";
    const head = document.createElement("div");
    head.className = "provider-head";
    const name = document.createElement("span");
    name.className = "provider-name";
    name.textContent = title;
    head.append(name);
    block.append(head);
    card.append(block);
    return block;
  };

  const textField = (
    parent: HTMLElement,
    labelText: string,
    value: string,
    placeholder = "",
  ): HTMLInputElement => {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.value = value;
    input.placeholder = placeholder;
    wrap.append(span, input);
    parent.append(wrap);
    return input;
  };

  const selectField = (
    parent: HTMLElement,
    labelText: string,
    options: Array<[string, string]>,
    value: string,
  ): HTMLSelectElement => {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = labelText;
    const select = document.createElement("select");
    for (const [optValue, optLabel] of options) {
      const option = document.createElement("option");
      option.value = optValue;
      option.textContent = optLabel;
      select.append(option);
    }
    select.value = value;
    wrap.append(span, select);
    parent.append(wrap);
    return select;
  };

  // Creator profile
  const profile = group(D.voProfileGroup);
  const toneInput = textField(profile, D.voTone, vo.tone, D.voTonePlaceholder);
  const nicheInput = textField(profile, D.voNiche, vo.niche, D.voNichePlaceholder);
  const audienceInput = textField(profile, D.voAudience, vo.audience, D.voAudiencePlaceholder);

  // Script defaults
  const defaults = group(D.voDefaultsGroup);

  const lengthLabel = document.createElement("p");
  lengthLabel.className = "muted small";
  lengthLabel.textContent = D.voLength;
  defaults.append(lengthLabel);
  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  defaults.append(chipRow);
  const PRESET_LENGTHS = [15, 20, 30, 60];
  const customNumber = document.createElement("input");
  customNumber.type = "number";
  customNumber.min = String(LENGTH_MIN_SECONDS);
  customNumber.max = String(LENGTH_MAX_SECONDS);
  customNumber.value = String(vo.defaults.lengthSeconds);
  // A stored preset value selects its chip; anything else is a custom length.
  let lengthChoice: number | "custom" = PRESET_LENGTHS.includes(vo.defaults.lengthSeconds)
    ? vo.defaults.lengthSeconds
    : "custom";
  const chipButtons = new Map<number | "custom", HTMLButtonElement>();
  const syncChips = (): void => {
    for (const [choice, btn] of chipButtons) {
      btn.className = choice === lengthChoice ? "ghost chip active" : "ghost chip";
    }
    customNumber.hidden = lengthChoice !== "custom";
  };
  const addChip = (choice: number | "custom", text: string): void => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.onclick = () => {
      lengthChoice = choice;
      syncChips();
      if (choice === "custom") customNumber.focus();
    };
    chipButtons.set(choice, btn);
    chipRow.append(btn);
  };
  for (const preset of PRESET_LENGTHS) addChip(preset, String(preset));
  addChip("custom", D.voLengthCustom);
  chipRow.append(customNumber);
  syncChips();

  const videoTypeSelect = selectField(
    defaults,
    D.voVideoType,
    [
      ["social-hook", D.voVtSocialHook],
      ["tutorial", D.voVtTutorial],
      ["unboxing", D.voVtUnboxing],
      ["problem-solution", D.voVtProblemSolution],
      ["edu-story", D.voVtEduStory],
      ["product-setup", D.voVtProductSetup],
    ],
    vo.defaults.videoType,
  );
  const hookSelect = selectField(
    defaults,
    D.voHookStyle,
    [
      ["joke-pun", D.voHookJokePun],
      ["relatable", D.voHookRelatable],
      ["30-day-review", D.voHook30Day],
      ["tired-of", D.voHookTiredOf],
      ["bold-claim", D.voHookBoldClaim],
      ["question", D.voHookQuestion],
      ["surprise-reveal", D.voHookSurprise],
      ["custom", D.voHookCustomOption],
    ],
    vo.defaults.hookStyle,
  );
  const hookCustomInput = textField(
    defaults,
    D.voHookCustomLine,
    vo.defaults.hookCustom,
    D.voHookCustomPlaceholder,
  );
  const syncHookCustom = (): void => {
    (hookCustomInput.parentElement as HTMLElement).hidden = hookSelect.value !== "custom";
  };
  syncHookCustom();
  hookSelect.onchange = syncHookCustom;
  const pacingSelect = selectField(
    defaults,
    D.voPacing,
    [
      ["slow", D.voPaceSlow],
      ["standard", D.voPaceStandard],
      ["fast", D.voPaceFast],
    ],
    vo.defaults.pacing,
  );
  const disclosureSelect = selectField(
    defaults,
    D.voDisclosure,
    [
      ["honest-paid-sample", D.voDiscHonestPaid],
      ["affiliate-link", D.voDiscAffiliate],
      ["free-pr-sample", D.voDiscFreePr],
      ["none", D.voDiscNone],
    ],
    vo.defaults.disclosureKey,
  );

  // About Me: fit & styling
  const about = group(D.voAboutGroup);
  const aboutHint = document.createElement("p");
  aboutHint.className = "muted small";
  aboutHint.textContent = D.voAboutHint;
  about.append(aboutHint);
  const aboutFields: Array<[keyof VoiceoverSettings["aboutMe"], string]> = [
    ["height", D.voHeight],
    ["topSize", D.voTopSize],
    ["bustSize", D.voBustSize],
    ["dressSize", D.voDressSize],
    ["pantSize", D.voPantSize],
    ["shoeSize", D.voShoeSize],
    ["hairColor", D.voHairColor],
    ["eyeColor", D.voEyeColor],
    ["skinTone", D.voSkinTone],
    ["preferredColors", D.voPreferredColors],
    ["preferredStyles", D.voPreferredStyles],
  ];
  const aboutInputs = new Map<keyof VoiceoverSettings["aboutMe"], HTMLInputElement>();
  for (const [key, labelText] of aboutFields) {
    aboutInputs.set(key, textField(about, labelText, vo.aboutMe[key]));
  }

  // Brand denylist
  const deny = group(D.voDenyGroup);
  const denyInput = textField(deny, D.voDenyLabel, vo.brandDenylist.join(", "));
  const denyHint = document.createElement("p");
  denyHint.className = "muted small";
  denyHint.textContent = D.voDenyHint;
  deny.append(denyHint);

  const actions = document.createElement("div");
  actions.className = "actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.textContent = D.save;
  actions.append(saveBtn);
  card.append(actions);

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = D.saving;
    const aboutMe = {} as VoiceoverSettings["aboutMe"];
    for (const [key, input] of aboutInputs) aboutMe[key] = input.value.trim();
    const voiceover: VoiceoverSettings = {
      tone: toneInput.value.trim(),
      niche: nicheInput.value.trim(),
      audience: audienceInput.value.trim(),
      defaults: {
        lengthSeconds:
          lengthChoice === "custom" ? clampLength(Number(customNumber.value)) : lengthChoice,
        videoType: videoTypeSelect.value as VoiceoverVideoType,
        hookStyle: hookSelect.value as VoiceoverHookStyle,
        hookCustom: hookCustomInput.value.trim(),
        pacing: pacingSelect.value as VoiceoverPacing,
        disclosureKey: disclosureSelect.value as VoiceoverDisclosureKey,
      },
      aboutMe,
      brandDenylist: denyInput.value
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean),
    };
    settings = await patchSettings({ voiceover });
    // Reflect the clamp back so the field shows what was actually saved.
    customNumber.value = String(settings.voiceover.defaults.lengthSeconds);
    saveBtn.disabled = false;
    saveBtn.textContent = D.saved;
    window.setTimeout(() => (saveBtn.textContent = D.save), 1200);
  };

  section.append(heading, card);
  root.append(section);
}

function makeBadge(status: "ok" | "fail" | "untested"): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `badge ${status}`;
  badge.textContent =
    status === "ok" ? D.statusOk : status === "fail" ? D.statusFail : D.statusUntested;
  return badge;
}

// The Creators API setup walkthrough. We deliberately do NOT embed a raw
// youtube-nocookie iframe here: this options page loads from a chrome-extension://
// origin, which YouTube's player cannot validate as an embedding site, so the
// inline player fails with "Error 153". Instead we show a click-to-play facade
// (the real video thumbnail plus a play glyph) that opens the video in a normal
// browser tab, where a real https origin lets it play. This also loads faster and
// avoids handing YouTube a frame on page load. Built as DOM nodes so it stays
// inside the extension page's default CSP.
function renderSetupVideo(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "provider-video";

  const caption = document.createElement("p");
  caption.className = "muted small provider-video-caption";
  caption.textContent = D.watchSetupVideo;
  wrap.append(caption);

  // Open on the real YouTube watch page (valid https origin) in a new tab.
  const watchUrl = `https://www.youtube.com/watch?v=${ONBOARDING_VIDEO_ID}`;
  const facade = document.createElement("a");
  facade.className = "provider-video-frame provider-video-facade";
  facade.href = watchUrl;
  facade.target = "_blank";
  facade.rel = "noopener noreferrer";
  facade.title = D.watchSetupVideo;
  facade.setAttribute("aria-label", D.watchSetupVideo);

  const thumb = document.createElement("img");
  thumb.className = "provider-video-thumb";
  thumb.src = `https://i.ytimg.com/vi/${ONBOARDING_VIDEO_ID}/hqdefault.jpg`;
  thumb.alt = "";
  thumb.loading = "lazy";
  facade.append(thumb);

  const play = document.createElement("span");
  play.className = "provider-video-play";
  play.setAttribute("aria-hidden", "true");
  facade.append(play);
  wrap.append(facade);

  const link = document.createElement("a");
  link.className = "provider-video-link small";
  link.href = API_INTEGRATIONS_TUTORIAL_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = D.openFullTutorial;
  wrap.append(link);

  return wrap;
}

// Backup-credential controls for the Creator API card. Shows an "active" chip
// when a lease is live, and an "offer" (revealed by an eligibility-blocked Test)
// to lease Influencer Butler's house credentials while Amazon has not unlocked
// the user's own account. Returns the element plus a showOffer() the test
// handler calls when it sees eligibilityBlocked.
function renderCreatorsBackup(): { el: HTMLElement; showOffer: () => void } {
  const el = document.createElement("div");
  el.className = "provider-backup";

  const status = document.createElement("p");
  status.className = "muted small";
  status.setAttribute("aria-live", "polite");
  status.hidden = true;

  const offer = document.createElement("div");
  offer.className = "provider-backup-offer";
  offer.hidden = true;
  const offerHint = document.createElement("p");
  offerHint.className = "muted small";
  offerHint.textContent = D.creatorsBackupOfferHint;
  const enableBtn = document.createElement("button");
  enableBtn.className = "ghost";
  enableBtn.textContent = D.creatorsBackupEnable;
  offer.append(offerHint, enableBtn);

  const activeChip = document.createElement("div");
  activeChip.className = "provider-backup-active warn";
  activeChip.hidden = true;
  const activeText = document.createElement("span");
  activeText.textContent = D.creatorsBackupActive;
  const disableBtn = document.createElement("button");
  disableBtn.className = "ghost";
  disableBtn.textContent = D.creatorsBackupDisable;
  activeChip.append(activeText, disableBtn);

  el.append(status, offer, activeChip);

  const showActive = (active: boolean): void => {
    activeChip.hidden = !active;
    if (active) offer.hidden = true;
  };

  enableBtn.onclick = async () => {
    enableBtn.disabled = true;
    status.hidden = false;
    status.textContent = D.creatorsBackupWorking;
    const res = await sendToBackground<CreatorApiBackupStatus | { error: string }>({
      kind: "CREATOR_API_BACKUP",
      action: "backup-enable",
    });
    enableBtn.disabled = false;
    if (res && "error" in res) {
      status.textContent = res.error;
      return;
    }
    status.hidden = true;
    showActive(Boolean(res?.active));
  };

  disableBtn.onclick = async () => {
    disableBtn.disabled = true;
    await sendToBackground<CreatorApiBackupStatus>({ kind: "CREATOR_API_BACKUP", action: "backup-disable" });
    disableBtn.disabled = false;
    showActive(false);
  };

  // Load the current lease state on render; a live lease shows the active chip.
  void sendToBackground<CreatorApiBackupStatus | { error: string }>({
    kind: "CREATOR_API_BACKUP",
    action: "backup-status",
  }).then((res) => {
    if (res && !("error" in res) && res?.active) showActive(true);
  });

  return { el, showOffer: () => { if (activeChip.hidden) offer.hidden = false; } };
}

function renderProvider(adapter: IntegrationAdapter): HTMLElement {
  const pv = providerView(adapter.id);
  const block = document.createElement("div");
  block.className = "provider";

  const head = document.createElement("div");
  head.className = "provider-head";
  const name = document.createElement("span");
  name.className = "provider-name";
  name.textContent = label(adapter.labelKey);
  head.append(name, makeBadge(pv.lastTest.status));
  block.append(head);

  // Optional one-line explainer (e.g. for providers with no credential fields).
  if (adapter.descriptionKey) {
    const desc = document.createElement("p");
    desc.className = "muted small";
    desc.textContent = label(adapter.descriptionKey);
    block.append(desc);
  }

  // The Creators API card carries the setup walkthrough, matching the desktop
  // app's API Integrations screen.
  let backupControls: { el: HTMLElement; showOffer: () => void } | null = null;
  if (adapter.id === CREATORS_API) {
    block.append(renderSetupVideo());
    backupControls = renderCreatorsBackup();
    block.append(backupControls.el);
  }

  // Inputs. Associates gets a per-country tag grid; everything else gets fields.
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  if (adapter.id === ASSOCIATES) {
    block.append(renderTagGrid(pv, inputs));
  } else {
    for (const field of adapter.fields) {
      const wrap = document.createElement("label");
      wrap.className = "field";
      const span = document.createElement("span");
      span.textContent = label(field.labelKey);
      if (field.type === "select") {
        const select = document.createElement("select");
        const stored = (pv.values[field.name] ?? "").trim();
        for (const opt of field.options ?? []) {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.recommended ? `${opt.value} ${D.recommendedSuffix}` : opt.value;
          if (opt.recommended && !stored) option.selected = true;
          select.append(option);
        }
        // A previously typed custom value stays selectable so saving the form
        // never silently swaps the user's model.
        if (stored && !(field.options ?? []).some((o) => o.value === stored)) {
          const custom = document.createElement("option");
          custom.value = stored;
          custom.textContent = stored;
          select.append(custom);
        }
        if (stored) select.value = stored;
        wrap.append(span, select);
        block.append(wrap);
        inputs.set(field.name, select);
        continue;
      }
      const input = document.createElement("input");
      input.type = field.type === "password" ? "password" : "text";
      input.autocomplete = "off";
      if (field.type === "password") {
        input.placeholder = pv.configured ? D.secretSavedPlaceholder : field.placeholder ?? "";
        // A password box is never pre-filled, so a stored key otherwise looks like
        // an empty field. A "Stored" chip on the label makes it obvious the key is
        // still saved and the blank box is expected.
        if (pv.configured) {
          const chip = document.createElement("span");
          chip.className = "stored-chip";
          chip.textContent = D.storedBadge;
          span.append(" ", chip);
        }
      } else {
        input.value = pv.values[field.name] ?? "";
        input.placeholder = field.placeholder ?? "";
      }
      wrap.append(span, input);
      block.append(wrap);
      inputs.set(field.name, input);
    }
  }

  // Routing participation, for providers that take part in routing.
  let participatesBox: HTMLInputElement | null = null;
  if (adapter.category === "deeplink" || adapter.category === "affiliateNetwork") {
    const toggle = document.createElement("label");
    toggle.className = "toggle";
    participatesBox = document.createElement("input");
    participatesBox.type = "checkbox";
    participatesBox.checked = pv.routingParticipates;
    const span = document.createElement("span");
    span.textContent = D.participatesLabel;
    toggle.append(participatesBox, span);
    block.append(toggle);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "ghost";
  saveBtn.textContent = D.save;
  const testBtn = document.createElement("button");
  testBtn.className = "primary";
  testBtn.textContent = D.testBtn;
  // Test result shown as its own callout block BELOW the actions row (not as
  // cramped inline text), so a long provider error is easy to read and act on.
  const msg = document.createElement("div");
  msg.className = "test-result";
  msg.hidden = true;
  const setMsg = (text: string, status: "ok" | "fail" | "") => {
    msg.textContent = text || "";
    msg.className = "test-result" + (status ? ` ${status}` : "");
    msg.hidden = !text;
  };
  if (pv.lastTest.message) {
    setMsg(pv.lastTest.message, pv.lastTest.status === "ok" ? "ok" : "fail");
  }
  actions.append(saveBtn, testBtn);
  // "Show me where" opens the provider's own credentials page in a new tab, so
  // users can find these keys without leaving the flow. Matches the desktop app.
  if (adapter.credentialsUrl) {
    const whereBtn = document.createElement("button");
    whereBtn.className = "ghost";
    whereBtn.textContent = D.showMeWhere;
    whereBtn.onclick = () =>
      window.open(adapter.credentialsUrl, "_blank", "noopener,noreferrer");
    actions.append(whereBtn);
  }
  // "Clear saved keys": wipe a stored credential the user is unsure about (for
  // example when an update left the fields looking blank). Only shown when a
  // secret is actually stored, and only for providers that keep a secret field.
  const hasSecretField = adapter.fields.some((f) => f.type === "password");
  if (hasSecretField && pv.configured) {
    const clearBtn = document.createElement("button");
    clearBtn.className = "ghost";
    clearBtn.textContent = D.clearKeys;
    clearBtn.onclick = async () => {
      if (!window.confirm(D.clearKeysConfirm)) return;
      clearBtn.disabled = true;
      const updated = await sendToBackground<IntegrationView>({
        kind: "CLEAR_INTEGRATION",
        id: adapter.id,
      });
      replaceProviderView(updated);
      // Re-render this card so the emptied state (no "Stored" chip, reset badge,
      // no Clear button) shows immediately.
      block.replaceWith(renderProvider(adapter));
    };
    actions.append(clearBtn);
  }
  block.append(actions);
  block.append(msg);

  const collectValues = (): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const [key, input] of inputs) values[key] = input.value;
    return values;
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = D.saving;
    if (adapter.hosts.length) await requestOrigins(adapter.hosts);
    const updated = await sendToBackground<IntegrationView>({
      kind: "SAVE_INTEGRATION",
      id: adapter.id,
      values: collectValues(),
      enabled: true,
      routingParticipates: participatesBox ? participatesBox.checked : undefined,
    });
    replaceProviderView(updated);
    saveBtn.disabled = false;
    saveBtn.textContent = D.saved;
    window.setTimeout(() => (saveBtn.textContent = D.save), 1200);
  };

  testBtn.onclick = async () => {
    testBtn.disabled = true;
    testBtn.textContent = D.testing;
    setMsg("", "");
    // Persist first so the tested credentials are the ones on screen.
    if (adapter.hosts.length) {
      const granted = await requestOrigins(adapter.hosts);
      if (!granted) {
        setMsg(D.permissionDenied, "fail");
        testBtn.disabled = false;
        testBtn.textContent = D.testBtn;
        return;
      }
    }
    await sendToBackground<IntegrationView>({
      kind: "SAVE_INTEGRATION",
      id: adapter.id,
      values: collectValues(),
      enabled: false,
      routingParticipates: participatesBox ? participatesBox.checked : undefined,
    });
    const outcome = await sendToBackground<IntegrationTestOutcome>({
      kind: "TEST_INTEGRATION",
      id: adapter.id,
    });
    setMsg(outcome.message, outcome.ok ? "ok" : "fail");
    head.replaceChild(makeBadge(outcome.ok ? "ok" : "fail"), head.lastChild as Node);
    // Amazon accepted the credentials but has not unlocked the Creator API yet:
    // reveal the backup-credentials offer.
    if (outcome.eligibilityBlocked) backupControls?.showOffer();
    testBtn.disabled = false;
    testBtn.textContent = D.testBtn;
  };

  return block;
}

function renderTagGrid(pv: IntegrationView, inputs: Map<string, HTMLInputElement | HTMLSelectElement>): HTMLElement {
  const wrap = document.createElement("div");
  const hint = document.createElement("p");
  hint.className = "muted small";
  hint.textContent = D.perCountryHint;
  wrap.append(hint);

  const grid = document.createElement("div");
  grid.className = "tag-grid";
  wrap.append(grid);

  const addRow = (country: string, tag: string): void => {
    const code = document.createElement("input");
    code.placeholder = D.countryCode;
    code.value = country;
    const value = document.createElement("input");
    value.placeholder = "mytag-20";
    value.value = tag;
    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "x";
    remove.onclick = () => {
      code.remove();
      value.remove();
      remove.remove();
      rebuildTagInputs(grid, inputs);
    };
    grid.append(code, value, remove);
    code.oninput = () => rebuildTagInputs(grid, inputs);
    value.oninput = () => rebuildTagInputs(grid, inputs);
  };

  const entries = Object.entries(pv.values);
  if (entries.length === 0) addRow("US", "");
  else for (const [country, tag] of entries) addRow(country, tag);
  rebuildTagInputs(grid, inputs);

  const add = document.createElement("button");
  add.className = "ghost";
  add.textContent = D.addCountry;
  add.onclick = () => {
    addRow("", "");
    rebuildTagInputs(grid, inputs);
  };
  wrap.append(add);
  return wrap;
}

// Rebuild the country->tag map from the current grid rows into the inputs map
// the save handler reads. Keyed by country code, skipping blank rows.
function rebuildTagInputs(grid: HTMLElement, inputs: Map<string, HTMLInputElement | HTMLSelectElement>): void {
  inputs.clear();
  const cells = Array.from(grid.querySelectorAll("input"));
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const code = cells[i] as HTMLInputElement;
    const value = cells[i + 1] as HTMLInputElement;
    const country = code.value.trim().toUpperCase();
    if (country) inputs.set(country, value);
  }
}

function replaceProviderView(updated: IntegrationView): void {
  const index = view.providers.findIndex((p) => p.id === updated.id);
  if (index >= 0) view.providers[index] = updated;
  else view.providers.push(updated);
}

// Request host permissions from the current user gesture. Returns true when the
// permissions are granted (or none were needed).
async function requestOrigins(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}
