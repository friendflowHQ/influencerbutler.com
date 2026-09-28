import { redirect } from "next/navigation";
import { resolveActor } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side gate for the whole /dashboard/admin surface. The admin pages are
 * client components, so without this they would render (empty) for any logged-in
 * user and rely entirely on each API returning 403. This redirects non-staff
 * before any admin UI loads, so a single missing requirePermission on one route
 * is no longer a full exposure. resolveActor() returns non-null only for a
 * super-admin (ADMIN_EMAILS) or an active staff member; everyone else bounces to
 * the normal dashboard.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActor();
  if (!actor) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
