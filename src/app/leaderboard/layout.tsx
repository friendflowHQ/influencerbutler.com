import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

// Shared site chrome for the public /leaderboard page. Mirrors the /tools
// layout so the board feels native to the rest of the marketing site: the
// page.tsx supplies only the board body.
export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
