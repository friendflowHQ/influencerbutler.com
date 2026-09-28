import type { Metadata } from "next";
import ExtensionFeedbackForm from "./ExtensionFeedbackForm";

export const metadata: Metadata = {
  title: "Quick feedback - Influencer Butler",
  robots: { index: false, follow: false },
};

export default async function ExtensionFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t } = await searchParams;
  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16">
      <ExtensionFeedbackForm email={e ?? ""} token={t ?? ""} />
    </main>
  );
}
