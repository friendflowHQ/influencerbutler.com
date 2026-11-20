// Single source of truth for the admin navigation. Used by the sidebar, the
// command palette (Ctrl/Cmd+K) and the mobile bottom bar, so a new admin page
// only needs to be added here.

export type AdminNavGroup = "Revenue" | "Audience" | "Marketing" | "Support" | "System";

export type AdminNavItem = {
  href: string;
  label: string;
  perm: string;
  group: AdminNavGroup;
  /** Extra words the command palette matches on. */
  keywords?: string;
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = ["Revenue", "Audience", "Marketing", "Support", "System"];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/dashboard/admin", label: "Overview", perm: "reports.view", group: "Revenue", keywords: "home dashboard waiting" },
  { href: "/dashboard/admin/growth", label: "Growth", perm: "reports.view", group: "Revenue", keywords: "goals mrr subscribers traffic" },
  { href: "/dashboard/admin/finance", label: "Finance", perm: "finance.view", group: "Revenue", keywords: "payouts taxes expenses revenue" },
  { href: "/dashboard/admin/stores", label: "Creator stores", perm: "finance.view", group: "Revenue", keywords: "storefront" },
  { href: "/dashboard/admin/cancellations", label: "Cancellations", perm: "reports.view", group: "Revenue", keywords: "churn winback" },
  { href: "/dashboard/admin/users", label: "Users", perm: "users.view", group: "Audience", keywords: "customers accounts find" },
  { href: "/dashboard/admin/comps", label: "Comps", perm: "licenses.view", group: "Audience", keywords: "free grants" },
  { href: "/dashboard/admin/invites", label: "Invites", perm: "licenses.view", group: "Audience", keywords: "codes" },
  { href: "/dashboard/admin/affiliates", label: "Affiliates", perm: "affiliates.view", group: "Audience", keywords: "referrals commission" },
  { href: "/dashboard/admin/community", label: "Community", perm: "community.view", group: "Audience", keywords: "posts" },
  { href: "/dashboard/admin/events", label: "Events", perm: "events.manage", group: "Audience", keywords: "calls rsvp" },
  { href: "/dashboard/admin/emails", label: "Emails", perm: "reports.view", group: "Marketing", keywords: "sequences campaigns" },
  { href: "/dashboard/admin/bundle", label: "Bundle", perm: "marketing.send", group: "Marketing", keywords: "freebie" },
  { href: "/dashboard/admin/blog", label: "Blog", perm: "blog.manage", group: "Marketing", keywords: "posts articles" },
  { href: "/dashboard/admin/activity", label: "Activity widget", perm: "activity.manage", group: "Marketing", keywords: "social proof" },
  { href: "/dashboard/admin/testimonials", label: "Testimonials", perm: "testimonials.moderate", group: "Marketing", keywords: "reviews" },
  { href: "/dashboard/admin/support", label: "Support", perm: "support.view", group: "Support", keywords: "tickets inbox" },
  { href: "/dashboard/admin/extension-feedback", label: "Extension feedback", perm: "support.view", group: "Support", keywords: "chrome" },
  { href: "/dashboard/admin/scheduling", label: "Scheduling", perm: "scheduling.view", group: "Support", keywords: "calls bookings" },
  { href: "/dashboard/admin/ai-sessions", label: "AI Concierge sessions", perm: "ai_sessions.view", group: "Support", keywords: "chat bot" },
  { href: "/dashboard/admin/catalogue-harvest", label: "Catalogue", perm: "catalogue.view", group: "System", keywords: "sales products" },
  { href: "/dashboard/admin/webhooks", label: "Webhooks", perm: "webhooks.view", group: "System", keywords: "errors" },
  { href: "/dashboard/admin/audit", label: "Audit log", perm: "audit.view", group: "System", keywords: "actions history" },
  { href: "/dashboard/admin/staff", label: "Assistants", perm: "staff.manage", group: "System", keywords: "team permissions" },
];

/** Items the signed-in staff member may see. Super-admins see everything. */
export function visibleAdminNav(role: "admin" | "assistant" | null, perms: string[]): AdminNavItem[] {
  if (!role) return [];
  const set = new Set(perms);
  return ADMIN_NAV_ITEMS.filter((i) => role === "admin" || set.has(i.perm));
}

/** The handful of pages shown in the mobile bottom bar. */
export const ADMIN_MOBILE_BAR_HREFS = [
  "/dashboard/admin",
  "/dashboard/admin/growth",
  "/dashboard/admin/support",
  "/dashboard/admin/users",
];
