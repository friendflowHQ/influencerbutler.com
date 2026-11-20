"use client";

// Bottom tab bar for staff on phones: the four pages checked most, one tap
// away, plus a "Search" button that opens the command palette. Hidden on large
// screens (the sidebar covers it) and for non-staff. Only mounts on admin
// routes.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_MOBILE_BAR_HREFS, visibleAdminNav } from "@/lib/admin-nav";

export default function AdminMobileBar() {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<{ role: "admin" | "assistant" | null; perms: string[] } | null>(null);
  const onAdmin = pathname?.startsWith("/dashboard/admin") ?? false;

  useEffect(() => {
    if (!onAdmin || identity) return;
    void fetch("/api/admin/whoami", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { isStaff?: boolean; role?: "admin" | "assistant" | null; permissions?: string[] } | null) => {
        if (j?.isStaff) setIdentity({ role: j.role ?? null, perms: j.permissions ?? [] });
      })
      .catch(() => {});
  }, [onAdmin, identity]);

  if (!onAdmin || !identity) return null;
  const items = visibleAdminNav(identity.role, identity.perms).filter((i) => ADMIN_MOBILE_BAR_HREFS.includes(i.href));
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Quick admin navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white lg:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-14 flex-1 items-center justify-center px-1 text-xs font-semibold",
              active ? "text-indigo-700" : "text-slate-700",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        className="flex min-h-14 flex-1 items-center justify-center px-1 text-xs font-semibold text-slate-700"
      >
        Search
      </button>
    </nav>
  );
}
