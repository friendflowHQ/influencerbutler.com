import { decryptFields, encryptFields } from "../integrations/crypto";
import { ADAPTERS, getAdapter } from "../integrations/registry";
import { buildAffiliateLink } from "../integrations/routing";
import { getIntegration, getIntegrations, getSettings, patchIntegration, patchIntegrationsGlobal } from "../storage/store";
import type { IntegrationState, IntegrationsState, IntegrationTestResult } from "../storage/schema";
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

// Decrypt a provider's stored credentials. Associates has no encrypted blob:
// its "credentials" are the per-country affiliate tags kept in global state.
async function credsFor(id: string, integrations: IntegrationsState): Promise<Record<string, string>> {
  if (id === ASSOCIATES) return { ...integrations.global.perCountryTags };
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
        : Boolean(state?.credentialsEnc);
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
    merged[field.name] = trimmed;
  }
  const credentialsEnc = await encryptFields(merged);
  await patchIntegration(id, (s) => {
    s.credentialsEnc = credentialsEnc;
    if (enabled !== undefined) s.enabled = enabled;
    if (routingParticipates !== undefined) s.routingParticipates = routingParticipates;
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
): Promise<GenerateLinkResult> {
  try {
    const [integrations, settings] = await Promise.all([getIntegrations(), getSettings()]);
    const link = await buildAffiliateLink(
      { asin, marketplace, url },
      {
        // Explicit "Copy my link" always applies the affiliate setup; the
        // global toggle only governs automatic rewriting (see rewriteLink).
        enabled: true,
        primaryDeeplinkProvider: integrations.global.primaryDeeplinkProvider,
        perCountryTags: integrations.global.perCountryTags,
        storefrontHandle: settings.storefrontHandle,
      },
      async (providerId) => credsFor(providerId, integrations),
    );
    return { ok: true, url: link };
  } catch {
    return { ok: false, error: "Could not build a link." };
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
