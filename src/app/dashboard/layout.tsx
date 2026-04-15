import Image from "next/image";
import Sidebar from "@/components/dashboard/Sidebar";
import ShortcutHelpOverlay from "@/components/dashboard/ShortcutHelpOverlay";
import AffiliateUpsellBanner from "@/components/dashboard/AffiliateUpsellBanner";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Auth is enforced by middleware via cookie check. Profile/email will be
  // loaded client-side by the sidebar itself to avoid server-side Supabase
  // calls that fail on Vercel due to DNS resolution issues.
  const email = "Account";
  const profileName: string | null = null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <KeyboardShortcutsProvider>
        <Sidebar email={email} profileName={profileName} websiteHref="/" />
        <main className="flex-1 px-4 pb-10 pt-20 lg:px-10 lg:py-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            <Image
              src="/assets/influencer-butler-logo.png"
              alt="Influencer Butler logo"
              width={18}
              height={18}
              className="rounded"
              priority
            />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Influencer Butler</span>
          </div>
          <AffiliateUpsellBanner />
          {children}
        </main>
        <ShortcutHelpOverlay />
      </KeyboardShortcutsProvider>
    </div>
  );
}
