/**
 * Single source of truth for the admin/assistant permission catalog.
 *
 * Super-admins (ADMIN_EMAILS) implicitly hold every permission. Assistants hold
 * the subset stored on their staff_members.permissions row. Routes gate on a
 * specific PermissionKey via requirePermission() in src/lib/admin.ts.
 *
 * `built` marks whether the underlying endpoint exists yet, so the staff editor
 * can show not-yet-shipped capabilities as disabled "coming soon" toggles
 * instead of granting access to something that does nothing.
 */

export type PermissionRisk = "normal" | "destructive" | "money";

export type PermissionDomain =
  | "Affiliates"
  | "Billing"
  | "Licenses"
  | "Users"
  | "Community"
  | "Support"
  | "Scheduling"
  | "Catalogue"
  | "Marketing"
  | "Operations"
  | "Staff";

export type PermissionDef = {
  key: string;
  label: string;
  description: string;
  domain: PermissionDomain;
  risk: PermissionRisk;
  built: boolean;
  /** Super-admin only: never offered to assistants in the editor. */
  adminOnly?: boolean;
};

export const PERMISSIONS: readonly PermissionDef[] = [
  // Affiliates (all built)
  { key: "affiliates.view", label: "View affiliates", description: "See affiliate applications, the reconciliation feed, and stuck affiliates.", domain: "Affiliates", risk: "normal", built: true },
  { key: "affiliates.approve", label: "Approve affiliates", description: "Approve pending applications (creates their branded code and emails them).", domain: "Affiliates", risk: "normal", built: true },
  { key: "affiliates.reject", label: "Reject affiliates", description: "Reject pending applications.", domain: "Affiliates", risk: "normal", built: true },
  { key: "affiliates.link", label: "Link Lemon Squeezy affiliate", description: "Manually link a user to their Lemon Squeezy affiliate ID.", domain: "Affiliates", risk: "normal", built: true },
  { key: "affiliates.codes.manage", label: "Manage affiliate codes", description: "Regenerate or rename an affiliate's branded discount code.", domain: "Affiliates", risk: "normal", built: true },
  { key: "affiliates.terms.manage", label: "Set commission terms", description: "Set a custom commission rate and duration per affiliate. Money-sensitive.", domain: "Affiliates", risk: "money", built: true },
  { key: "affiliates.comps.manage", label: "Set affiliate comp allowance", description: "Let a trusted affiliate hand out limited free Pro workspaces, and set their monthly quota. Money-sensitive.", domain: "Affiliates", risk: "money", built: true },
  { key: "affiliates.tax.view", label: "View & verify tax forms", description: "Review affiliate W-9 / W-8BEN forms, verify or reject them, and reveal a TIN for 1099 prep. Every reveal is audited. Super-admin only.", domain: "Affiliates", risk: "money", built: true, adminOnly: true },
  { key: "affiliates.payout", label: "Pay out affiliates", description: "Disburse owed commissions to affiliates via PayPal. Moves money. Super-admin only.", domain: "Affiliates", risk: "money", built: true, adminOnly: true },

  // Billing
  { key: "billing.view", label: "View billing", description: "Look up any user's subscriptions and orders.", domain: "Billing", risk: "normal", built: false },
  { key: "billing.cancel", label: "Cancel subscription", description: "Cancel a user's subscription via Lemon Squeezy (at period end).", domain: "Billing", risk: "destructive", built: true },
  { key: "billing.comp", label: "Comp / extend subscription", description: "Guided: log intent and open Lemon Squeezy to grant a free period.", domain: "Billing", risk: "destructive", built: true },
  { key: "billing.plan.edit", label: "Change plan", description: "Guided: log intent and open Lemon Squeezy to change the plan/variant.", domain: "Billing", risk: "destructive", built: true },
  { key: "billing.refund", label: "Issue refund", description: "Guided: log intent and open Lemon Squeezy to issue a refund. Moves money.", domain: "Billing", risk: "money", built: true },

  // Licenses
  { key: "licenses.view", label: "View licenses & comps", description: "See license keys, and the Comps page tracking free-code subscriptions and their expiry.", domain: "Licenses", risk: "normal", built: true },
  { key: "licenses.regenerate", label: "Regenerate license", description: "Guided: log intent and open Lemon Squeezy to reissue a license key.", domain: "Licenses", risk: "destructive", built: true },
  { key: "licenses.revoke", label: "Revoke license", description: "Mark a license key revoked (or reactivate it) in our database.", domain: "Licenses", risk: "destructive", built: true },
  { key: "licenses.resend", label: "Resend license", description: "Email a license key to its owner.", domain: "Licenses", risk: "normal", built: true },

  // Users / Auth
  { key: "users.view", label: "View users", description: "Look up a user's profile, subscriptions, affiliate, and licenses by email.", domain: "Users", risk: "normal", built: true },
  { key: "users.resend_auth", label: "Resend welcome / magic link", description: "Re-send a sign-in magic link to a user.", domain: "Users", risk: "normal", built: true },
  { key: "users.impersonate", label: "Impersonate user", description: "Generate a link to sign in as a user for support debugging. High risk.", domain: "Users", risk: "destructive", built: true },
  { key: "users.delete", label: "Delete user", description: "Permanently delete a user account. Irreversible.", domain: "Users", risk: "destructive", built: true },

  // Community
  { key: "community.view", label: "View community Q&A", description: "See questions and answers across all statuses.", domain: "Community", risk: "normal", built: true },
  { key: "community.moderate", label: "Moderate community Q&A", description: "Hide, restore, or change the status of questions and answers.", domain: "Community", risk: "normal", built: true },
  { key: "community.delete", label: "Delete community Q&A", description: "Permanently delete a question or answer.", domain: "Community", risk: "destructive", built: true },

  // Support (the feedback/bug/feature-request ticket queue backed by the
  // feedback Worker's D1. The support-bot triages automatically; these gate
  // the human take-over surface in the admin dashboard.)
  { key: "support.view", label: "View support tickets", description: "See the support ticket queue (bugs, questions, feature requests) and each ticket's reply thread.", domain: "Support", risk: "normal", built: true },
  { key: "support.respond", label: "Respond to & triage tickets", description: "Reply to a customer, change a ticket's status/priority/tags, take over from the bot, mark spam, or resolve.", domain: "Support", risk: "normal", built: true },

  // Scheduling (1:1 support + demo call bookings)
  { key: "scheduling.view", label: "View call bookings", description: "See upcoming and past 1:1 calls with each customer's prep sheet (subscription + support history).", domain: "Scheduling", risk: "normal", built: true },
  { key: "scheduling.manage", label: "Manage calls & availability", description: "Set your bookable hours, cancel or reschedule calls, add manual blocks, and edit scheduling settings.", domain: "Scheduling", risk: "normal", built: true },

  // Catalogue
  { key: "catalogue.view", label: "View catalogue harvest", description: "See harvest status and history.", domain: "Catalogue", risk: "normal", built: true },
  { key: "catalogue.trigger", label: "Trigger catalogue harvest", description: "Kick off a CC / SPCC catalogue harvest.", domain: "Catalogue", risk: "normal", built: true },

  // Marketing
  { key: "activity.manage", label: "Manage recent-activity widget", description: "Configure the social-proof popup (window, count, on/off) and hide specific events.", domain: "Marketing", risk: "normal", built: true },
  { key: "testimonials.moderate", label: "Moderate testimonials", description: "Review, approve, hide, edit, reply to, and feature customer testimonials, and set auto-approval.", domain: "Marketing", risk: "normal", built: true },

  // Operations
  { key: "reports.view", label: "View KPIs & reports", description: "Subscription counts, trial funnel, and conversion metrics on the admin overview and growth dashboard.", domain: "Operations", risk: "normal", built: true },
  { key: "webhooks.view", label: "View webhook log", description: "Recent Lemon Squeezy webhook deliveries and processing errors.", domain: "Operations", risk: "normal", built: true },
  { key: "audit.view", label: "View admin audit log", description: "Read the append-only log of admin and assistant actions. Super-admin only.", domain: "Operations", risk: "normal", built: true, adminOnly: true },

  // Staff (super-admin only)
  { key: "staff.manage", label: "Manage assistants", description: "Invite assistants and set their permissions. Super-admin only.", domain: "Staff", risk: "destructive", built: true, adminOnly: true },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

const KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

/** Keys an assistant is allowed to be granted (excludes super-admin-only ones). */
export const ASSISTANT_GRANTABLE_KEYS: PermissionKey[] = PERMISSIONS.filter(
  (p) => !p.adminOnly,
).map((p) => p.key);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && KEY_SET.has(value);
}

/** Filter an arbitrary list down to valid, assistant-grantable permission keys. */
export function sanitizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return [];
  const grantable = new Set<string>(ASSISTANT_GRANTABLE_KEYS);
  const out = new Set<PermissionKey>();
  for (const v of input) {
    if (typeof v === "string" && grantable.has(v)) out.add(v as PermissionKey);
  }
  return Array.from(out);
}

export const PERMISSION_DOMAINS: PermissionDomain[] = [
  "Affiliates",
  "Billing",
  "Licenses",
  "Users",
  "Community",
  "Support",
  "Scheduling",
  "Catalogue",
  "Marketing",
  "Operations",
  "Staff",
];
