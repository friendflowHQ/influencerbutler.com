import { createAdminClient } from "@/lib/admin";
import { generateAndCreateAffiliateCode } from "@/lib/affiliate-code-generator";
import { fetchLsAffiliate, buildShareLink } from "@/lib/affiliates";
import { FEATURE_CATALOG, PRICING_TIERS } from "@/lib/mcp/feature-catalog";
import type { Principal } from "@/lib/mcp/auth";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  authRequired: boolean;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>, principal: Principal | null) => Promise<ToolResult>;

const DEFAULT_PERCENT_OFF = 10;

function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const listFeatures: ToolHandler = async () => ok({ features: FEATURE_CATALOG });

const getPricing: ToolHandler = async () => ok({ tiers: PRICING_TIERS });

type ProfileForAffiliate = {
  id: string;
  email: string | null;
  ls_affiliate_id: string | null;
  affiliate_code: string | null;
};

const createAffiliateLink: ToolHandler = async (args, principal) => {
  if (!principal) return err("auth required: include a valid Authorization: Bearer ib_pat_... header");
  const firstName = typeof args.firstName === "string" ? args.firstName.trim() : "";
  if (!firstName) return err("firstName is required");

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) return err("LEMONSQUEEZY_STORE_ID is not configured on the server");

  const result = await generateAndCreateAffiliateCode({
    firstName,
    storeId,
    percentOff: DEFAULT_PERCENT_OFF,
  });

  if (!result) return err("could not generate affiliate code (all candidates collided or LS error)");

  const admin = createAdminClient();
  if (admin) {
    try {
      await (admin as unknown as {
        from: (t: string) => {
          update: (p: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        };
      })
        .from("profiles")
        .update({
          affiliate_code: result.code,
          ls_affiliate_discount_id: result.discountId,
        })
        .eq("id", principal.userId);
    } catch (error) {
      console.error("mcp/create_affiliate_link: profile update failed", error);
    }
  }

  return ok({
    code: result.code,
    discountId: result.discountId,
    percentOff: DEFAULT_PERCENT_OFF,
  });
};

const getEarningsSummary: ToolHandler = async (_args, principal) => {
  if (!principal) return err("auth required: include a valid Authorization: Bearer ib_pat_... header");

  const admin = createAdminClient();
  if (!admin) return err("server is not configured for affiliate lookups");

  let lsAffiliateId: string | null = null;
  let affiliateCode: string | null = null;
  try {
    const { data } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: ProfileForAffiliate | null; error: unknown }>;
          };
        };
      };
    })
      .from("profiles")
      .select("id, email, ls_affiliate_id, affiliate_code")
      .eq("id", principal.userId)
      .maybeSingle();
    lsAffiliateId = data?.ls_affiliate_id ?? null;
    affiliateCode = data?.affiliate_code ?? null;
  } catch (error) {
    console.error("mcp/get_earnings_summary: profile lookup failed", error);
    return err("profile lookup failed");
  }

  if (!lsAffiliateId) {
    return ok({
      state: "no_affiliate",
      message: "this user is not yet an approved affiliate",
      affiliateCode,
    });
  }

  const summary = await fetchLsAffiliate(lsAffiliateId);
  if (!summary) return err("could not load affiliate summary from Lemon Squeezy");

  return ok({
    state: summary.status === "active" ? "active" : "disabled",
    affiliate: summary,
    affiliateCode,
    shareLink: buildShareLink(summary.shareDomain, lsAffiliateId),
  });
};

export const TOOL_REGISTRY: Record<string, { def: ToolDefinition; handler: ToolHandler }> = {
  list_features: {
    def: {
      name: "list_features",
      description: "List all Influencer Butler product features with slugs, titles and descriptions.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      authRequired: false,
    },
    handler: listFeatures,
  },
  get_pricing: {
    def: {
      name: "get_pricing",
      description: "Return the public pricing tiers (free, monthly, annual) with feature highlights.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      authRequired: false,
    },
    handler: getPricing,
  },
  create_affiliate_link: {
    def: {
      name: "create_affiliate_link",
      description: "Create a branded affiliate referral code for the authenticated influencer.",
      inputSchema: {
        type: "object",
        properties: {
          firstName: {
            type: "string",
            description: "First name to base the affiliate code on (uppercased, alphanumeric only).",
          },
        },
        required: ["firstName"],
        additionalProperties: false,
      },
      authRequired: true,
    },
    handler: createAffiliateLink,
  },
  get_earnings_summary: {
    def: {
      name: "get_earnings_summary",
      description: "Return the authenticated user's recent affiliate earnings summary from Lemon Squeezy.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      authRequired: true,
    },
    handler: getEarningsSummary,
  },
};

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  principal: Principal | null,
): Promise<ToolResult> {
  const entry = TOOL_REGISTRY[name];
  if (!entry) return err(`unknown tool: ${name}`);
  if (entry.def.authRequired && !principal) {
    return err(`tool ${name} requires authentication`);
  }
  try {
    return await entry.handler(args, principal);
  } catch (error) {
    console.error(`mcp/tool ${name} threw`, error);
    return err(`tool ${name} failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function listToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map((e) => e.def);
}
