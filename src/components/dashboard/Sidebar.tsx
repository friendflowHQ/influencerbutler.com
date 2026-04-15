"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useKeyboardShortcutsContext } from "@/contexts/KeyboardShortcutsContext";

type SidebarProps = {
  email: string;
  profileName?: string | null;
  websiteHref?: string;
};

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/console", label: "Console" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/billing", label: "Billing" },
];

export default function Sidebar({ email, profileName, websiteHref = "/" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { setHelpOpen } = useKeyboardShortcutsContext();

  const userDisplay = useMemo(() => {
    if (profileName && profileName.trim().length > 0) return profileName;
    return email;
  }, [profileName, email]);

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
            <p className="mt-2 text-sm font-semibold text-slate-900 truncate">{userDisplay}</p>
            {profileName ? <p className="text-xs text-slate-500 truncate">{email}</p> : null}
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
