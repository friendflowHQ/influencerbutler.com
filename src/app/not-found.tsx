import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f97316]">Influencer Butler</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">404</h1>
        <p className="mt-3 text-base text-slate-700">We couldn&apos;t find the page you requested.</p>
        <p className="mt-1 text-sm text-slate-500">The link may be broken, or the page may have moved.</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
