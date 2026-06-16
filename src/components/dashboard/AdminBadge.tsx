"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Renders an "Admin" or "Assistant" pill in the dashboard header, only for
 * staff accounts. Role + permissions are server-only, so we ask
 * /api/admin/whoami. Non-staff render nothing. The pill links to the first
 * admin page the actor can actually access.
 */

type WhoAmI = {
  isAdmin?: boolean;
  isStaff?: boolean;
  role?: "admin" | "assistant" | null;
  permissions?: string[];
};

// First match wins: maps a permission the actor holds to its landing page.
const LANDING: { perm: string; href: string }[] = [
  { perm: "affiliates.view", href: "/dashboard/admin/affiliates" },
  { perm: "community.view", href: "/dashboard/admin/community" },
  { perm: "catalogue.view", href: "/dashboard/admin/catalogue-harvest" },
  { perm: "users.view", href: "/dashboard/admin/users" },
  { perm: "staff.manage", href: "/dashboard/admin/staff" },
];

function resolveHref(role: WhoAmI["role"], permissions: string[]): string {
  if (role === "admin") return "/dashboard/admin/affiliates";
  const perms = new Set(permissions);
  const match = LANDING.find((l) => perms.has(l.perm));
  return match?.href ?? "/dashboard";
}

export default function AdminBadge() {
  const [info, setInfo] = useState<WhoAmI | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/admin/whoami", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as WhoAmI;
        if (!cancelled && json.isStaff) setInfo(json);
      } catch {
        // ignore - just don't show the pill
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  const isAdmin = info.role === "admin";
  const label = isAdmin ? "Admin" : "Assistant";
  const href = resolveHref(info.role, info.permissions ?? []);
  const colorClass = isAdmin
    ? "bg-indigo-600 hover:bg-indigo-700"
    : "bg-teal-600 hover:bg-teal-700";

  return (
    <Link
      href={href}
      title={
        isAdmin
          ? "You're signed in as an admin. Open the admin area."
          : "You're signed in as an assistant. Open your admin tools."
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-sm transition ${colorClass}`}
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        />
      </svg>
      {label}
    </Link>
  );
}
