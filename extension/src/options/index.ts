import { ADAPTERS, CATEGORY_ORDER, DEEPLINK_PROVIDER_IDS, getAdapter } from "../integrations/registry";
import type { IntegrationAdapter, IntegrationCategory } from "../integrations/types";
import { OPTIONS_CATALOG, type OptionsDict } from "./strings";
import { resolveLocale } from "../i18n";
import { getSettings } from "../storage/store";
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

let D: OptionsDict;
let view: IntegrationsView;

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  D = OPTIONS_CATALOG[resolveLocale(settings.locale)];
  view = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  renderChrome();
  renderGlobals();
  renderCategories();
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
  select.onchange = () =>
    void setGlobal({ primaryDeeplinkProvider: select.value || null });

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
  };
  return map[category];
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
  const inputs = new Map<string, HTMLInputElement>();
  if (adapter.id === ASSOCIATES) {
    block.append(renderTagGrid(pv, inputs));
  } else {
    for (const field of adapter.fields) {
      const wrap = document.createElement("label");
      wrap.className = "field";
      const span = document.createElement("span");
      span.textContent = label(field.labelKey);
      const input = document.createElement("input");
      input.type = field.type === "password" ? "password" : "text";
      input.autocomplete = "off";
      if (field.type === "password") {
        input.placeholder = pv.configured ? D.secretSavedPlaceholder : field.placeholder ?? "";
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
  const msg = document.createElement("span");
  msg.className = "test-msg";
  if (pv.lastTest.message) {
    msg.textContent = pv.lastTest.message;
    msg.classList.add(pv.lastTest.status === "ok" ? "ok" : "fail");
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
  actions.append(msg);
  block.append(actions);

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
    msg.textContent = "";
    msg.className = "test-msg";
    // Persist first so the tested credentials are the ones on screen.
    if (adapter.hosts.length) {
      const granted = await requestOrigins(adapter.hosts);
      if (!granted) {
        msg.textContent = D.permissionDenied;
        msg.classList.add("fail");
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
    msg.textContent = outcome.message;
    msg.classList.add(outcome.ok ? "ok" : "fail");
    head.replaceChild(makeBadge(outcome.ok ? "ok" : "fail"), head.lastChild as Node);
    testBtn.disabled = false;
    testBtn.textContent = D.testBtn;
  };

  return block;
}

function renderTagGrid(pv: IntegrationView, inputs: Map<string, HTMLInputElement>): HTMLElement {
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
function rebuildTagInputs(grid: HTMLElement, inputs: Map<string, HTMLInputElement>): void {
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
