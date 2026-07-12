"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import SelfHostedAffiliateDashboard from "@/app/dashboard/affiliates/SelfHostedAffiliateDashboard";

/**
 * Admin "view as affiliate" page. Renders the real affiliate dashboard in
 * read-only mode for the affiliate named in the route, sourced from the
 * admin-permission-gated endpoints (a non-admin gets a 403 from those, which the
 * dashboard surfaces as a load error). Reached by clicking a name in the roster.
 */
export default function AdminAffiliateViewPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? "";

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/affiliates"
        className="inline-flex items-center text-sm font-medium text-[#f97316] transition hover:text-[#ea580c]"
      >
        ← Back to roster
      </Link>

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Admin preview - read only.</strong> This is exactly what this affiliate sees in their
        own dashboard. Nothing here is editable.
      </div>

      <SelfHostedAffiliateDashboard
        readOnly
        displayName=""
        dataUrl={`/api/affiliates/admin-affiliate-view?userId=${encodeURIComponent(userId)}`}
        clicksUrl={`/api/affiliates/admin-affiliate-clicks?userId=${encodeURIComponent(userId)}`}
      />
    </div>
  );
}
