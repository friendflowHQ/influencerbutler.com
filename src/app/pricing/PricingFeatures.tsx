import Link from "next/link";
import { loadLandingFeatures } from "@/lib/landing-features";

export default async function PricingFeatures() {
  const { sectionLabel, heading, subtitle, cards } = await loadLandingFeatures();
  if (cards.length === 0) return null;

  return (
    <section
      id="features"
      className="scroll-mt-24 border-t border-slate-200 bg-white"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f97316]">
            {sectionLabel}
          </p>
          {heading ? (
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {heading}
            </h2>
          ) : null}
          {subtitle ? (
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
              {subtitle}
            </p>
          ) : null}
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={`${card.href}-${card.title}`}>
              <Link
                href={card.href}
                className="group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#f97316]/40 hover:shadow-md"
              >
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#fff7ed] text-[#f97316]"
                  dangerouslySetInnerHTML={{ __html: card.iconSvg }}
                />
                <h3 className="mt-4 pr-16 text-base font-semibold text-slate-900">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {card.description}
                </p>
                {card.badge ? (
                  <span
                    className={`absolute right-4 top-4 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      card.badge.flagship
                        ? "bg-[#f97316] text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {card.badge.text}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
