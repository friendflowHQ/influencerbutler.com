import type { Metadata } from "next";
import ManageBooking from "./ManageBooking";

// The signed token lives in the URL, so keep the page out of search results and
// out of Referer headers sent to anything the page links to.
export const metadata: Metadata = {
  title: "Manage your call",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  return (
    <main id="main-content" className="min-h-screen bg-slate-50 px-4 py-10">
      <ManageBooking id={id} token={t ?? ""} />
    </main>
  );
}
