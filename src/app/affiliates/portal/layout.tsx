import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalLogoutButton from "./PortalLogoutButton";

export default async function AffiliatePortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/affiliates/portal");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/affiliates" className="flex items-center gap-2">
            <Image
              src="/assets/influencer-butler-logo.png"
              alt="Influencer Butler logo"
              width={32}
              height={32}
              className="rounded"
              priority
            />
            <div className="leading-tight">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Influencer Butler
              </p>
              <p className="text-sm font-semibold text-slate-900">Affiliate Portal</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Customer dashboard
            </Link>
            <PortalLogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
