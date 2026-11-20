"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Promote-tab media kit: ready-made graphics an affiliate can download and post.
 * The same files appear in the Content Planner; this puts them where the link is.
 */

const KIT: { label: string; path: string; note: string }[] = [
  {
    label: "Butler vs. extensions comparison",
    path: "/assets/affiliate-competitor-butler-vs-extensions.png",
    note: "The comparison angle.",
  },
  {
    label: "Before / after stress (vertical)",
    path: "/assets/before_and_after_stress_influencer_butler_vertical.png",
    note: "Reels and Stories.",
  },
  {
    label: "Before / after stress (Facebook)",
    path: "/assets/before_and_after_stress_influencer_butler_facebook.png",
    note: "Facebook feed posts.",
  },
  {
    label: "Grab every ASIN (flagship)",
    path: "/assets/before_after_flagship_feature_1.png",
    note: "Auto-accept and CC Check posts.",
  },
  {
    label: "Logo",
    path: "/assets/influencer-butler-logo.png",
    note: "For thumbnails and link-in-bio pages.",
  },
];

export default function MediaKit() {
  return (
    <section
      aria-labelledby="aff-kit-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="aff-kit-title" className="text-sm font-semibold text-slate-900">
          Media kit
        </h2>
        <Link
          href="/dashboard/affiliates/planner#graphics"
          className="text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          More in the planner
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Download a graphic and post it with your link. Please keep the images unedited.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KIT.map((a) => (
          <li key={a.path} className="rounded-xl border border-slate-200 p-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-50">
              <Image src={a.path} alt="" fill className="object-contain" sizes="160px" />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-900">{a.label}</p>
            <p className="text-xs text-slate-600">{a.note}</p>
            <a
              href={a.path}
              download
              aria-label={`Download ${a.label}`}
              className="mt-1 inline-block text-xs font-semibold text-orange-700 hover:text-orange-800"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
