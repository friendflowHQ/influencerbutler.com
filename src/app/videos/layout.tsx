import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

// Shared chrome for the public walkthrough-video pages. The page files supply
// only their body content; header, footer and the main landmark live here.
export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
