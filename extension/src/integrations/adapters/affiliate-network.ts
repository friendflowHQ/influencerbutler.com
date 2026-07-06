import type { AffiliateNetworkId, FieldSpec, IntegrationAdapter, TestResult } from "../types";

// Affiliate networks (Levanta, Archer, Logie, Benable). Their attribution links
// route through whichever deeplink provider is set as primary, independent of
// their own hosting, so at the extension layer these are credential stores plus
// a participation flag for routing. As with the deeplink providers, live
// verification is deferred until each network's endpoint is confirmed (see the
// plan's open items); the test validates that the credential is present.

type NetworkMeta = {
  id: AffiliateNetworkId;
  labelKey: string;
  field: FieldSpec;
};

const NETWORKS: NetworkMeta[] = [
  { id: "levanta", labelKey: "provLevanta", field: { name: "apiKey", labelKey: "fieldApiKey", type: "password" } },
  { id: "archer", labelKey: "provArcher", field: { name: "apiKey", labelKey: "fieldApiKey", type: "password" } },
  { id: "logie", labelKey: "provLogie", field: { name: "apiKey", labelKey: "fieldApiKey", type: "password" } },
  {
    id: "benable",
    labelKey: "provBenable",
    field: { name: "referralUrl", labelKey: "fieldReferralUrl", type: "text", placeholder: "https://benable.com/you" },
  },
];

function makeAdapter(meta: NetworkMeta): IntegrationAdapter {
  const fieldName = meta.field.name;
  return {
    id: meta.id,
    labelKey: meta.labelKey,
    category: "affiliateNetwork",
    hosts: [],
    fields: [meta.field],
    async test(creds): Promise<TestResult> {
      const value = (creds[fieldName] ?? "").trim();
      if (!value) return { ok: false, message: "Enter your credential to connect this network." };
      return {
        ok: true,
        message: "Saved. Attribution links route through your primary deeplink provider.",
      };
    },
  };
}

export const affiliateNetworkAdapters: IntegrationAdapter[] = NETWORKS.map(makeAdapter);
