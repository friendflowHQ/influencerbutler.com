"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useKeyboardShortcutsContext } from "@/contexts/KeyboardShortcutsContext";

// Sidebar is cramped, so the single button points at the /download chooser page
// where the user picks Windows or Mac, rather than stacking platform buttons.
const DOWNLOAD_URL = "/download";

type SidebarProps = {
  email: string;
  profileName?: string | null;
  websiteHref?: string;
};

type NavChild = {
  href: string;
  label: string;
  /** Same-page hash links use a plain anchor so the browser fires hashchange. */
  hash?: boolean;
};
type NavItem = { href: string; label: string; children?: NavChild[] };
type NavGroup = { title: string | null; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/profile", label: "Profile" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/dashboard/earnings", label: "Amazon earnings" },
      { href: "/dashboard/subscription", label: "Subscription" },
      { href: "/dashboard/billing", label: "Billing" },
    ],
  },
  {
    title: "Grow",
    items: [
      {
        href: "/dashboard/affiliates",
        label: "Affiliates",
        children: [
          { href: "/dashboard/affiliates#guest-passes", label: "Guest Passes", hash: true },
          { href: "/dashboard/affiliates#leaderboard", label: "Leaderboard", hash: true },
          { href: "/dashboard/affiliates/planner", label: "Content Planner" },
          { href: "/dashboard/affiliates/playbook", label: "Competitor Playbook" },
        ],
      },
      { href: "/dashboard/foyer", label: "Foyer Subscribers" },
      { href: "/dashboard/foyer/sales", label: "Foyer Sales" },
      { href: "/dashboard/events", label: "Upcoming Events" },
      { href: "/dashboard/extension", label: "Extension" },
      { href: "/dashboard/api-keys", label: "API Keys" },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/dashboard/ai-concierge", label: "AI Assistant" },
      { href: "/dashboard/book", label: "Book a Call" },
      { href: "/dashboard/feedback", label: "Leave a Review" },
      { href: "/help", label: "Help & Tutorials" },
      { href: "/help/community", label: "Community Q&A" },
    ],
  },
];

export default function Sidebar({ email, profileName, websiteHref = "/" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hasLicenseKey, setHasLicenseKey] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<"admin" | "assistant" | null>(null);
  const [adminPerms, setAdminPerms] = useState<string[]>([]);
  const [pendingTestimonials, setPendingTestimonials] = useState(0);
  const { setHelpOpen } = useKeyboardShortcutsContext();
  const asideRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Mobile drawer: Escape closes it, Tab stays inside it, and focus returns to
  // the hamburger button when it closes.
  useEffect(() => {
    if (!isMobileOpen) return;
    const aside = asideRef.current;
    const focusables = () =>
      Array.from(
        aside?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      ).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const button = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [isMobileOpen]);

  useEffect(() => {
    const supabase = createClient();
    const checkLicense = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const profilePromise = supabase
          .from("profiles")
          .select("display_name,avatar_url,avatar_updated_at")
          .eq("id", user.id)
          .maybeSingle();

        // License key gates the "Download app" link. Resolve it via the
        // service-role API (bypasses RLS) instead of an anon read of the
        // subscriptions table, which has no SELECT policy and returns nothing.
        void fetch("/api/me/subscription-details")
          .then((res) => (res.ok ? res.json() : null))
          .then((payload: { hasLicenseKey?: boolean } | null) => {
            if (payload?.hasLicenseKey) {
              setHasLicenseKey(true);
            }
          })
          .catch(() => {
            // ignore - download link just won't show
          });

        const { data: profile } = await profilePromise;
        if (profile) {
          const row = profile as {
            display_name?: string | null;
            avatar_url?: string | null;
            avatar_updated_at?: string | null;
          };
          if (row.display_name && row.display_name.trim().length > 0) {
            setProfileDisplayName(row.display_name);
          }
          if (row.avatar_url) {
            const v = row.avatar_updated_at
              ? encodeURIComponent(row.avatar_updated_at)
              : Date.now().toString();
            const sep = row.avatar_url.includes("?") ? "&" : "?";
            setProfileAvatarUrl(`${row.avatar_url}${sep}v=${v}`);
          }
        }
      } catch {
        // ignore - download link / avatar just won't show
      }
    };
    void checkLicense();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/whoami", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          isStaff?: boolean;
          role?: "admin" | "assistant" | null;
          permissions?: string[];
        };
        if (!cancelled && json.isStaff) {
          setAdminRole(json.role ?? null);
          setAdminPerms(json.permissions ?? []);
          // Badge on the Testimonials nav link. Staff-only, so regular users
          // never make this call. Route returns { count: 0 } without the
          // testimonials.moderate permission.
          void fetch("/api/admin/testimonials/pending-count", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((payload: { count?: number } | null) => {
              if (!cancelled && typeof payload?.count === "number") {
                setPendingTestimonials(payload.count);
              }
            })
            .catch(() => {
              // ignore - badge just won't show
            });
        }
      } catch {
        // not staff / network error: no admin nav
      }
    };
    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  const adminNavItems = useMemo(() => {
    if (!adminRole) return [];
    const perms = new Set(adminPerms);
    const isAdmin = adminRole === "admin";
    // `built` gates links to pages that exist; flip on as pages ship.
    const items = [
      { href: "/dashboard/admin", label: "Overview", perm: "reports.view", built: true },
      { href: "/dashboard/admin/growth", label: "Growth", perm: "reports.view", built: true },
      { href: "/dashboard/admin/finance", label: "Finance", perm: "finance.view", built: true },
      { href: "/dashboard/admin/stores", label: "Creator stores", perm: "finance.view", built: true },
      { href: "/dashboard/admin/emails", label: "Emails", perm: "reports.view", built: true },
      { href: "/dashboard/admin/bundle", label: "Bundle", perm: "marketing.send", built: true },
      { href: "/dashboard/admin/blog", label: "Blog", perm: "blog.manage", built: true },
      { href: "/dashboard/admin/affiliates", label: "Affiliates", perm: "affiliates.view", built: true },
      { href: "/dashboard/admin/community", label: "Community", perm: "community.view", built: true },
      { href: "/dashboard/admin/support", label: "Support", perm: "support.view", built: true },
      { href: "/dashboard/admin/extension-feedback", label: "Extension feedback", perm: "support.view", built: true },
      { href: "/dashboard/admin/scheduling", label: "Scheduling", perm: "scheduling.view", built: true },
      { href: "/dashboard/admin/events", label: "Events", perm: "events.manage", built: true },
      { href: "/dashboard/admin/catalogue-harvest", label: "Catalogue", perm: "catalogue.view", built: true },
      { href: "/dashboard/admin/activity", label: "Activity widget", perm: "activity.manage", built: true },
      { href: "/dashboard/admin/testimonials", label: "Testimonials", perm: "testimonials.moderate", built: true },
      { href: "/dashboard/admin/cancellations", label: "Cancellations", perm: "reports.view", built: true },
      { href: "/dashboard/admin/users", label: "Users", perm: "users.view", built: true },
      { href: "/dashboard/admin/comps", label: "Comps", perm: "licenses.view", built: true },
      { href: "/dashboard/admin/invites", label: "Invites", perm: "licenses.view", built: true },
      { href: "/dashboard/admin/webhooks", label: "Webhooks", perm: "webhooks.view", built: true },
      { href: "/dashboard/admin/audit", label: "Audit log", perm: "audit.view", built: true },
      { href: "/dashboard/admin/staff", label: "Assistants", perm: "staff.manage", built: true },
      { href: "/dashboard/admin/ai-sessions", label: "AI Concierge sessions", perm: "ai_sessions.view", built: true },
    ];
    return items.filter((i) => i.built && (isAdmin || perms.has(i.perm)));
  }, [adminRole, adminPerms]);

  const userDisplay = useMemo(() => {
    if (profileDisplayName && profileDisplayName.trim().length > 0) return profileDisplayName;
    if (profileName && profileName.trim().length > 0) return profileName;
    return email;
  }, [profileDisplayName, profileName, email]);

  const showSecondaryEmail = Boolean(profileDisplayName || profileName);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = createClient() as unknown as { auth: { signOut: () => Promise<unknown> } };
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <button
        ref={menuButtonRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={isMobileOpen}
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"
      >
        <span className="sr-only">Open navigation menu</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close menu backdrop"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      ) : null}

      <aside
        ref={asideRef}
        aria-label="Dashboard menu"
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto border-r border-slate-200 bg-white p-6 shadow-sm transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Image
                src="/assets/influencer-butler-logo.png"
                alt="Influencer Butler logo"
                width={26}
                height={26}
                className="rounded"
                priority
              />
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Influencer Butler</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-8 w-8 flex-none overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                {profileAvatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={profileAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">
                    {(userDisplay || "?").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900 truncate">{userDisplay}</p>
            </div>
            {showSecondaryEmail ? <p className="mt-1 text-xs text-slate-500 truncate">{email}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-4" aria-label="Dashboard navigation">
          {navGroups.map((group) => (
            <div
              key={group.title ?? "top"}
              role="group"
              aria-label={group.title ?? "Main"}
              className="flex flex-col gap-1"
            >
              {group.title ? (
                <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {group.title}
                </p>
              ) : null}
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                // Show a parent's children only while inside that section, so the
                // cramped sidebar stays clean elsewhere.
                const showChildren = Boolean(item.children) && pathname.startsWith(item.href);
                return (
                  <div key={item.href} className="flex flex-col gap-1">
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={[
                        "rounded-lg px-3 py-2.5 text-sm font-medium transition",
                        isActive
                          ? "bg-orange-700 text-white shadow-sm"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                    {showChildren ? (
                      <div className="ml-3 flex flex-col gap-1 border-l border-slate-200 pl-3">
                        {item.children!.map((child) => {
                          const isChildActive = !child.hash && pathname === child.href;
                          const cls = [
                            "rounded-lg px-3 py-2 text-sm font-medium transition",
                            isChildActive
                              ? "bg-orange-700 text-white shadow-sm"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                          ].join(" ");
                          return child.hash ? (
                            <a
                              key={child.href}
                              href={child.href}
                              onClick={() => setIsMobileOpen(false)}
                              className={cls}
                            >
                              {child.label}
                            </a>
                          ) : (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setIsMobileOpen(false)}
                              aria-current={isChildActive ? "page" : undefined}
                              className={cls}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {adminNavItems.length > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {adminRole === "admin" ? "Admin" : "Assistant"}
            </p>
            <nav className="mt-2 flex flex-col gap-1" aria-label="Admin navigation">
              {adminNavItems.map((item) => {
                const isActive = pathname === item.href;
                const badge =
                  item.href === "/dashboard/admin/testimonials" && pendingTestimonials > 0
                    ? pendingTestimonials
                    : null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={[
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    {badge !== null ? (
                      <span
                        className={[
                          "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                          isActive ? "bg-white text-indigo-700" : "bg-rose-500 text-white",
                        ].join(" ")}
                        aria-label={`${badge} awaiting review`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}

        {hasLicenseKey ? (
          <a
            href={DOWNLOAD_URL}
            onClick={() => setIsMobileOpen(false)}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#f97316] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Download app
          </a>
        ) : null}

        <Link
          href={websiteHref}
          onClick={() => setIsMobileOpen(false)}
          className="mt-4 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
        >
          Back to Website
        </Link>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="mt-6 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500">?</kbd>
          Keyboard shortcuts
        </button>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="mt-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316] disabled:opacity-60"
        >
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </aside>
    </>
  );
}
