import type { Metadata } from "next";
import { headers } from "next/headers";
import ExtensionWelcomeForm from "./ExtensionWelcomeForm";
import { logExtensionInstallActivity, readGeo } from "@/lib/recent-activity";

export const metadata: Metadata = {
  title: "Welcome to Influencer Butler",
  robots: { index: false, follow: false },
};

// Opened in a new tab the first time the Chrome extension is installed. The
// extension is anonymous, so this is where we (optionally) capture an email to
// send setup tips and, ~10 days on, the review + feedback nudge.
export default async function ExtensionWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string | string[] }>;
}) {
  const params = await searchParams;
  const src = Array.isArray(params.src) ? params.src[0] : params.src;

  // The extension auto-opens this tab with ?src=install on a fresh install, so
  // this fires roughly once per install and feeds the marketing "someone
  // installed the free extension" social-proof card. Geo only (no identity),
  // read from the installer's own request. Best-effort: never block or break the
  // welcome page over an analytics write. A manual refresh could double-count;
  // admins can hide stray rows from the activity curation page.
  if (src === "install") {
    try {
      const geo = readGeo((await headers()) as unknown as Headers);
      await logExtensionInstallActivity({ geo });
    } catch {
      /* ignore - analytics must never break the page */
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16">
      <ExtensionWelcomeForm />
    </main>
  );
}
