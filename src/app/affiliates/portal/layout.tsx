import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AffiliatePortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The portal has been consolidated into /dashboard/affiliates. Every entry
  // point here redirects to the new location so existing links keep working.
  redirect("/dashboard/affiliates");
  return <>{children}</>;
}
