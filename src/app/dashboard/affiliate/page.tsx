import Image from "next/image";

export default function AffiliatePage() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[#f97316]/20 bg-gradient-to-r from-white to-orange-50 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler logo"
            width={40}
            height={40}
            className="rounded-md"
            priority
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Influencer Butler</p>
            <p className="text-sm text-slate-600">Partner Program</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Affiliate Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Affiliate links, referrals, and payouts will appear here soon.
        </p>
      </div>
    </section>
  );
}
