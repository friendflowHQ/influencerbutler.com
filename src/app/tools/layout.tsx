import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

// Shared chrome for every /tools page. The individual page.tsx files supply
// only their body content; the header/footer are wired once here.
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
