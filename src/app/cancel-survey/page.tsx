import type { Metadata } from "next";
import CancelSurveyForm from "./CancelSurveyForm";

export const metadata: Metadata = {
  title: "Cancellation survey - Influencer Butler",
  robots: { index: false, follow: false },
};

export default async function CancelSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16">
      <CancelSurveyForm token={token ?? ""} />
    </main>
  );
}
