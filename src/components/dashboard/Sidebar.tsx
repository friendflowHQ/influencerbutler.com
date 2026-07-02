"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/affiliates", label: "Affiliates" },
  { href: "/help", label: "Help & Tutorials" },
  { href: "/help/community", label: "Community Q&A" },
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
  const { setHelpOpen } = useKeyboardShortcutsContext();

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
      { href: "/dashboard/admin/affiliates", label: "Affiliates", perm: "affiliates.view", built: true },
      { href: "/dashboard/admin/community", label: "Community", perm: "community.view", built: true },
      { href: "/dashboard/admin/catalogue-harvest", label: "Catalogue", perm: "catalogue.view", built: true },
      { href: "/dashboard/admin/activity", label: "Activity widget", perm: "activity.manage", built: true },
      { href: "/dashboard/admin/testimonials", label: "Testimonials", perm: "testimonials.moderate", built: true },
      { href: "/dashboard/admin/users", label: "Users", perm: "users.view", built: true },
      { href: "/dashboard/admin/webhooks", label: "Webhooks", perm: "webhooks.view", built: true },
      { href: "/dashboard/admin/audit", label: "Audit log", perm: "audit.view", built: true },
      { href: "/dashboard/admin/staff", label: "Assistants", perm: "staff.manage", built: true },
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
        type="button"
        aria-label="Open menu"
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
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-6 shadow-sm transition-transform lg:static lg:translate-x-0 lg:shadow-none",
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

        <nav className="mt-8 flex flex-1 flex-col gap-2" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={[
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {adminNavItems.length > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {adminRole === "admin" ? "Admin" : "Assistant"}
            </p>
            <nav className="mt-2 flex flex-col gap-1" aria-label="Admin navigation">
              {adminNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700",
                    ].join(" ")}
                  >
                    {item.label}
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
