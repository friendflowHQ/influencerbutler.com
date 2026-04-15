"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortalLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient() as unknown as {
      auth: { signOut: () => Promise<unknown> };
    };
    await supabase.auth.signOut();
    router.push("/affiliates");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316] disabled:opacity-60"
    >
      {loading ? "Logging out..." : "Log out"}
    </button>
  );
}
