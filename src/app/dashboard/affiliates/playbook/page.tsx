"use client";

// Affiliate Competitor Playbook page: a standalone home for the competitor
// comparison resource that used to live inline on the affiliate dashboard.
// Fetches the affiliate's branded code (same endpoint the dashboard uses) so
// the copy-paste links carry ?code= attribution; renders immediately and lets
// the code populate the links once it arrives (code is optional downstream).

import Link from "next/link";
import { useEffect, useState } from "react";
import CompetitorPlaybook from "../CompetitorPlaybook";

export default function AffiliatePlaybookPage() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/affiliates/me-selfhosted", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { brandedCode?: string | null };
        if (!cancelled && json.brandedCode) setCode(json.brandedCode);
      } catch {
        // ignore - the playbook links just fall back to non-attributed URLs
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <CompetitorPlaybook code={code ?? undefined} />

      <Link
        href="/dashboard/affiliates"
        className="inline-flex items-center text-sm font-semibold text-[#f97316] hover:text-[#ea580c]"
      >
        Back to your affiliate dashboard
      </Link>
    </div>
  );
}
