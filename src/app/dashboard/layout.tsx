import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import ShortcutHelpOverlay from "@/components/dashboard/ShortcutHelpOverlay";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { createClient } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name?: string | null;
  email?: string | null;
};

type AuthUser = {
  id: string;
  email?: string | null;
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser as AuthUser | null;

  if (!user) {
    redirect("/login");
  }

  const profileQueryClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: ProfileRecord | null }>;
        };
      };
    };
  };

  const { data: profile } = await profileQueryClient
    .from("profiles")
    .select("full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? profile?.email ?? "Account";
  const profileName = profile?.full_name ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <KeyboardShortcutsProvider>
        <Sidebar email={email} profileName={profileName} websiteHref="/" />
        <main className="flex-1 px-4 pb-10 pt-20 lg:px-10 lg:py-10">{children}</main>
        <ShortcutHelpOverlay />
      </KeyboardShortcutsProvider>
    </div>
  );
}
