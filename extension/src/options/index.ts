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
  type IntegrationsView,
  type IntegrationTestOutcome,
  type IntegrationView,
} from "../shared/messages";

// The API Integrations options page. All credentials are handled by the
// background worker; this page only shows non-secret values and status, and
// requests host permission (from the user's click) before a provider is tested.

const ASSOCIATES = "associates";
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
  renderGlobals();
  renderCategories();
  renderVoiceover();
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
  byId("label-startup").textContent = D.testOnStartup;
  byId("label-routing").textContent = D.affiliateRouting;
  byId("label-primary-deeplink").textContent = D.primaryDeeplink;
  byId("hint-primary-deeplink").textContent = D.primaryDeeplinkHint;
  byId("label-walmart-link").textContent = D.walmartLink;
  byId("hint-walmart-link").textContent = D.walmartLinkHint;
  byId("run-all").textContent = D.runAllTests;
}

function renderGlobals(): void {
  const startup = byId<HTMLInputElement>("test-on-startup");
  startup.checked = view.global.testOnStartup;
  startup.onchange = () => void setGlobal({ testOnStartup: startup.checked });

  const routing = byId<HTMLInputElement>("affiliate-routing");
  routing.checked = view.global.affiliateRoutingEnabled;
  routing.onchange = () => void setGlobal({ affiliateRoutingEnabled: routing.checked });

  const select = byId<HTMLSelectElement>("primary-deeplink");
  select.replaceChildren();
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

  // Branded links selected with nobody signed in is the one provider choice
  // that silently does nothing: routing keeps handing back plain tagged Amazon
  // links. Say so here rather than letting the user guess.
  const warning = byId("primary-deeplink-warning");
  const syncWarning = (): void => {
    const needsSignIn = select.value === IB_LINKS && !providerView(IB_LINKS).configured;
    warning.textContent = needsSignIn ? D.primaryDeeplinkSignIn : "";
    warning.hidden = !needsSignIn;
  };
  syncWarning();

  select.onchange = () => {
    syncWarning();
    void setGlobal({ primaryDeeplinkProvider: select.value || null });
  };

  // Walmart affiliate link provider (mirrors the primary-deeplink select). The
  // user picks which connected provider mints their Walmart links.
  const wmSelect = byId<HTMLSelectElement>("walmart-link");
  wmSelect.replaceChildren();
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
    runAll.disabled = false;
    const failed = Object.values(results).filter((r) => !r.ok).length;
    status.textContent = failed === 0 ? D.statusOk : `${failed} ${D.statusFail}`;
  };
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
    const heading = document.createElement("h2");
    heading.className = "cat";
    heading.textContent = categoryLabel(category);
    root.append(heading);
    const card = document.createElement("section");
    card.className = "card";
    for (const adapter of adapters) card.append(renderProvider(adapter));
    root.append(card);
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

  const heading = document.createElement("h2");
  heading.className = "cat";
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

  root.append(heading, card);
}

function makeBadge(status: "ok" | "fail" | "untested"): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `badge ${status}`;
  badge.textContent =
    status === "ok" ? D.statusOk : status === "fail" ? D.statusFail : D.statusUntested;
  return badge;
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
