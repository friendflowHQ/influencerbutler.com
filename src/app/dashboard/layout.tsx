import { redirect } from "next/navigation";
import Image from "next/image";
import Sidebar from "@/components/dashboard/Sidebar";
import ShortcutHelpOverlay from "@/components/dashboard/ShortcutHelpOverlay";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { createClient } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name?: string | null;
  email?: string | null;
};

type SessionUser = {
  id?: string;
  email?: string | null;
};

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{ data: { session: { user?: SessionUser } | null } }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: ProfileRecord | null }>;
      };
    };
  };
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use getSession() (cookie-local, no network call) instead of getUser()
  // so a transient Supabase fetch failure from the Vercel runtime doesn't
  // bounce an authenticated user back to /login. Middleware already
  // verified the presence of the auth cookie.
  const supabase = (await createClient()) as unknown as SupabaseLike;

  let sessionUser: SessionUser | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    sessionUser = session?.user ?? null;
  } catch (error) {
    console.error("dashboard layout: auth.getSession threw", error);
  }

  if (!sessionUser?.id) {
    redirect("/login?next=/dashboard");
  }

  let profile: ProfileRecord | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", sessionUser.id)
      .maybeSingle();
    profile = data;
  } catch (error) {
    console.error("dashboard layout: profile fetch failed", error);
  }

  const email = sessionUser.email ?? profile?.email ?? "Account";
  const profileName = profile?.full_name ?? null;

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
          {children}
        </main>
        <ShortcutHelpOverlay />
      </KeyboardShortcutsProvider>
    </div>
  );
}
