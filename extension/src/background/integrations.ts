import { decryptFields, encryptFields } from "../integrations/crypto";
import { ADAPTERS, AFFILIATE_NETWORK_IDS, getAdapter } from "../integrations/registry";
import { buildAffiliateLink } from "../integrations/routing";
import { retailerFromHost } from "../shared/retailer";
import { maybePublishGeneratedLink } from "./links";
import { getIntegration, getIntegrations, getSettings, getState, patchIntegration, patchIntegrationsGlobal, patchSettings } from "../storage/store";
import type { IntegrationState, IntegrationsState, IntegrationTestResult } from "../storage/schema";
import type { SyncProviderPayload, SyncSettingsPayload } from "../transport/sync-settings";
import type {
  GenerateLinkResult,
  IntegrationsView,
  IntegrationTestOutcome,
  IntegrationView,
  OpenAiResult,
} from "../shared/messages";

// The background is the ONLY place credentials are decrypted or sent to a
// provider. The options page and content scripts talk to it through messages;
// raw secrets never travel back out.

const ASSOCIATES = "associates";
// Influencer Butler branded links authenticate with the signed-in license key
// instead of a stored, user-typed credential (see adapters/influencerbutler).
const IB_LINKS = "influencerbutler";

// Decrypt a provider's stored credentials. Two providers have no encrypted blob:
// Associates' "credentials" are the per-country affiliate tags in global state,
// and the branded-link provider's "credential" is the signed-in license key,
// supplied from auth at call time so it is never duplicated into storage.
async function credsFor(id: string, integrations: IntegrationsState): Promise<Record<string, string>> {
  if (id === ASSOCIATES) return { ...integrations.global.perCountryTags };
  if (id === IB_LINKS) {
    const { auth } = await getState();
    return auth.licenseKey ? { licenseKey: auth.licenseKey } : {};
  }
  const provider = integrations.providers[id];
  return decryptFields(provider?.credentialsEnc ?? null);
}

// Non-secret field values a provider can safely show back in the UI (templates,
// model, marketplace, referral url) with password/secret fields stripped.
function nonSecretValues(id: string, creds: Record<string, string>): Record<string, string> {
  const adapter = getAdapter(id);
  if (!adapter) return {};
  const out: Record<string, string> = {};
  for (const field of adapter.fields) {
    const value = creds[field.name];
    if (field.type !== "password" && value) out[field.name] = value;
  }
  return out;
}

export async function buildIntegrationsView(): Promise<IntegrationsView> {
  const integrations = await getIntegrations();
  const providers: IntegrationView[] = [];
  for (const adapter of ADAPTERS) {
    const state = integrations.providers[adapter.id];
    const creds = await credsFor(adapter.id, integrations);
    const configured =
      adapter.id === ASSOCIATES
        ? Object.values(integrations.global.perCountryTags).some((v) => v.trim())
        : adapter.id === IB_LINKS
          ? Boolean(creds.licenseKey)
          : adapter.fields.length === 0
            ? // Session-based providers (the Walmart link providers) store no
              // credentials; Save or a passing Test marks them enabled, and that
              // is what "set up" means for them.
              (state?.enabled ?? false)
            : // "Configured" means a stored credential actually decrypts to a
              // value, not merely that a blob exists. After an update that resets
              // the wrapping key the blob is present but unreadable (credsFor
              // returns {}); reporting that as unconfigured prompts a clean
              // re-entry instead of showing an empty field that claims "Saved".
              adapter.fields.some((f) => (creds[f.name] ?? "").trim() !== "");
    providers.push({
      id: adapter.id,
      enabled: state?.enabled ?? false,
      configured,
      // Associates has no secret fields; its "values" are the per-country tags.
      values:
        adapter.id === ASSOCIATES
          ? { ...integrations.global.perCountryTags }
          : nonSecretValues(adapter.id, creds),
      lastTest: state?.lastTest ?? { status: "untested", at: null, message: null },
      routingParticipates: state?.routingParticipates ?? true,
    });
  }
  return { global: integrations.global, providers };
}

// Save one provider. Password fields left blank keep their stored value, so the
// user never has to retype a secret to change a non-secret field next to it.
export async function saveIntegration(
  id: string,
  values: Record<string, string>,
  enabled?: boolean,
  routingParticipates?: boolean,
): Promise<IntegrationView> {
  const adapter = getAdapter(id);
  if (!adapter) throw new Error(`unknown integration: ${id}`);

  if (id === IB_LINKS) {
    // No stored credentials: the license key is read from auth at call time.
    // Only the enable / routing flags are persisted.
    if (enabled !== undefined || routingParticipates !== undefined) {
      await patchIntegration(id, (s) => {
        if (enabled !== undefined) s.enabled = enabled;
        if (routingParticipates !== undefined) s.routingParticipates = routingParticipates;
      });
    }
    return viewFor(id);
  }

  if (id === ASSOCIATES) {
    // Tags are not secret; store them directly in global state.
    const tags: Record<string, string> = {};
    for (const [country, tag] of Object.entries(values)) {
      const trimmed = (tag ?? "").trim();
      if (trimmed) tags[country] = trimmed;
    }
    await patchIntegrationsGlobal({ perCountryTags: tags });
    if (enabled !== undefined || routingParticipates !== undefined) {
      await patchIntegration(id, (s) => {
        if (enabled !== undefined) s.enabled = enabled;
        if (routingParticipates !== undefined) s.routingParticipates = routingParticipates;
      });
    }
    return viewFor(id);
  }

  const existing = await credsFor(id, await getIntegrations());
  const merged: Record<string, string> = { ...existing };
  for (const field of adapter.fields) {
    const incoming = values[field.name];
    if (incoming === undefined) continue;
    const trimmed = incoming.trim();
    if (field.type === "password" && trimmed === "") continue; // keep stored secret
    // Per-field cleanup (for example strip a leading "@" from a partner tag) so a
    // pasted value is stored in the canonical form the provider expects.
    merged[field.name] = field.normalize ? field.normalize(trimmed) : trimmed;
  }
  const credentialsEnc = await encryptFields(merged);
  await patchIntegration(id, (s) => {
    s.credentialsEnc = credentialsEnc;
    if (enabled !== undefined) s.enabled = enabled;
    if (routingParticipates !== undefined) s.routingParticipates = routingParticipates;
  });
  return viewFor(id);
}

// Wipe a provider's stored credentials (the options page "Clear saved keys"
// button). Nulls the encrypted blob, disables the provider so nothing keeps
// using a half-removed credential, and resets the test badge. Lets a user who is
// unsure whether an old key is still saved deliberately start clean.
export async function clearIntegration(id: string): Promise<IntegrationView> {
  const adapter = getAdapter(id);
  if (!adapter) throw new Error(`unknown integration: ${id}`);
  await patchIntegration(id, (s) => {
    s.credentialsEnc = null;
    s.enabled = false;
    s.lastTest = { status: "untested", at: null, message: null };
  });
  return viewFor(id);
}

async function viewFor(id: string): Promise<IntegrationView> {
  const view = await buildIntegrationsView();
  const entry = view.providers.find((p) => p.id === id);
  if (!entry) throw new Error(`missing view for ${id}`);
  return entry;
}

export async function testIntegration(id: string): Promise<IntegrationTestOutcome> {
  const adapter = getAdapter(id);
  if (!adapter) return { ok: false, message: "Unknown integration." };
  const integrations = await getIntegrations();
  const creds = await credsFor(id, integrations);
  let outcome: IntegrationTestOutcome;
  try {
    outcome = await adapter.test(creds);
  } catch {
    outcome = { ok: false, message: "Test failed unexpectedly. Try again." };
  }
  const lastTest: IntegrationTestResult = {
    status: outcome.ok ? "ok" : "fail",
    at: Date.now(),
    message: outcome.message,
  };
  // Associates keeps its state row too, so the badge persists.
  await patchIntegration(id, (s: IntegrationState) => {
    s.lastTest = lastTest;
    if (outcome.ok) s.enabled = true;
  });
  return outcome;
}

// Run every test whose provider has something saved. Used by the "Run all saved
// tests" button and, when enabled, on browser startup.
export async function testAllIntegrations(): Promise<Record<string, IntegrationTestOutcome>> {
  const view = await buildIntegrationsView();
  const results: Record<string, IntegrationTestOutcome> = {};
  for (const provider of view.providers) {
    if (!provider.configured) continue;
    results[provider.id] = await testIntegration(provider.id);
  }
  return results;
}

export async function maybeTestAllOnStartup(): Promise<void> {
  const { global } = await getIntegrations();
  if (global.testOnStartup) await testAllIntegrations();
}

export async function generateAffiliateLink(
  asin: string,
  marketplace: string,
  url?: string,
  retailer?: "amazon" | "walmart",
): Promise<GenerateLinkResult> {
  try {
    const [integrations, settings] = await Promise.all([getIntegrations(), getSettings()]);
    // Retailer is explicit when the caller knows it, else derived from the host.
    const resolvedRetailer = retailer ?? retailerFromHost(marketplace);
    // Affiliate networks that are enabled, take part in routing, have saved
    // credentials, and can mint their own link. Tried before the deeplink
    // wrapper (see buildAffiliateLink), in registry order.
    const affiliateNetworks = AFFILIATE_NETWORK_IDS.filter((id) => {
      const state = integrations.providers[id];
      return Boolean(
        state?.enabled &&
          state.routingParticipates &&
          state.credentialsEnc &&
          getAdapter(id)?.generateLink,
      );
    });
    const built = await buildAffiliateLink(
      { asin, marketplace, url, retailer: resolvedRetailer },
      {
        // Explicit "Copy my link" always applies the affiliate setup; the
        // global toggle only governs automatic rewriting (see rewriteLink).
        enabled: true,
        primaryDeeplinkProvider: integrations.global.primaryDeeplinkProvider,
        affiliateNetworks,
        walmartLinkProvider: integrations.global.walmartLinkProvider,
        perCountryTags: integrations.global.perCountryTags,
        storefrontHandle: settings.storefrontHandle,
      },
      async (providerId) => credsFor(providerId, integrations),
    );
    // When the resolved link is a branded short url and smart routing is on,
    // publish its routing definition so the edge does Passport / Best-Rate /
    // heal at click time. Best-effort: never blocks handing back the link.
    void maybePublishGeneratedLink(built.url);
    // `notice` rides along so the caller can say why this is a plain link
    // instead of the branded one the user picked. The link is still good.
    return { ok: true, url: built.url, notice: built.notice };
  } catch {
    return { ok: false, error: "Could not build a link." };
  }
}

// Settings sync with the desktop app. buildSyncPayload decrypts the syncable
// providers into a flat payload (this is the ONLY place that leaves the encrypted
// store, and it is sent over the loopback bridge only); writeSyncPayload folds an
// already-merged payload back in, re-encrypting each provider through
// saveIntegration. Only credential-based providers participate: session-based
// (Walmart link) and license-based (branded links, Associates tags-in-global)
// providers have no portable secret and are covered by the global fields.
export async function buildSyncPayload(): Promise<SyncSettingsPayload> {
  const [settings, integrations] = await Promise.all([getSettings(), getIntegrations()]);
  const providers: Record<string, SyncProviderPayload> = {};
  for (const adapter of ADAPTERS) {
    if (adapter.fields.length === 0) continue; // no stored credential to sync
    const state = integrations.providers[adapter.id];
    const creds = await credsFor(adapter.id, integrations);
    const filtered: Record<string, string> = {};
    for (const field of adapter.fields) {
      const value = creds[field.name];
      if (typeof value === "string" && value.trim()) filtered[field.name] = value;
    }
    providers[adapter.id] = {
      enabled: state?.enabled ?? false,
      routingParticipates: state?.routingParticipates ?? true,
      creds: filtered,
    };
  }
  return {
    storefrontHandle: settings.storefrontHandle,
    primaryDeeplinkProvider: integrations.global.primaryDeeplinkProvider,
    walmartLinkProvider: integrations.global.walmartLinkProvider,
    affiliateRoutingEnabled: integrations.global.affiliateRoutingEnabled,
    perCountryTags: { ...integrations.global.perCountryTags },
    providers,
  };
}

export async function writeSyncPayload(payload: SyncSettingsPayload): Promise<void> {
  await patchSettings({ storefrontHandle: payload.storefrontHandle });
  await patchIntegrationsGlobal({
    primaryDeeplinkProvider: payload.primaryDeeplinkProvider,
    walmartLinkProvider: payload.walmartLinkProvider,
    affiliateRoutingEnabled: payload.affiliateRoutingEnabled,
    perCountryTags: { ...payload.perCountryTags },
  });
  for (const [id, provider] of Object.entries(payload.providers)) {
    if (!getAdapter(id)) continue; // ignore a provider this build does not know
    // saveIntegration re-encrypts and keeps a stored secret when an incoming
    // password field is blank, so re-saving unchanged creds is a safe no-op.
    await saveIntegration(id, provider.creds, provider.enabled, provider.routingParticipates);
  }
}

export async function openaiComplete(prompt: string): Promise<OpenAiResult> {
  const adapter = getAdapter("openai");
  if (!adapter?.complete) return { ok: false, error: "OpenAI is not available." };
  const provider = await getIntegration("openai");
  if (!provider.credentialsEnc) return { ok: false, error: "Connect OpenAI in Settings first." };
  try {
    const creds = await decryptFields(provider.credentialsEnc);
    const text = await adapter.complete(prompt, creds);
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "OpenAI request failed." };
  }
}
