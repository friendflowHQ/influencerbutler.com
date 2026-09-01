import type { Metadata } from "next";
import ExtensionWelcomeForm from "./ExtensionWelcomeForm";

export const metadata: Metadata = {
  title: "Welcome to Influencer Butler",
  robots: { index: false, follow: false },
};

// Opened in a new tab the first time the Chrome extension is installed. The
// extension is anonymous, so this is where we (optionally) capture an email to
// send setup tips and, ~10 days on, the review + feedback nudge.
export default function ExtensionWelcomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16">
      <ExtensionWelcomeForm />
    </main>
  );
}
