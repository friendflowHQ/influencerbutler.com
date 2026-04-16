import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <Image
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler"
            width={32}
            height={32}
            className="rounded"
            priority
          />
          <span className="text-sm font-semibold tracking-tight">Influencer Butler</span>
        </Link>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
