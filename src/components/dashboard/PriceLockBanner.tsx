"use client";

import { useEffect, useRef, useState } from "react";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE } from "@/lib/pricing-constants";

/**
 * Dashboard price lock banner (until Nov 30 2026, 11:59pm Pacific). The
 * version depends on who is looking (/api/me/price-lock-status): paying users
 * are reassured, comped users get the Keep my plan link, everyone else gets
 * the countdown and a trial button. Same look as the site-wide banner
 * (public/js/price-lock-banner.js). Disappears on its own at the deadline.
 */
type AnnualOffer = { planName: string; monthlyCents: number; annualCents: number; saveCents: number; afterCents: number };
type Status = {
  state: "locked" | "comp" | "open" | "none";
  endsAt: string;
  keepUrl?: string;
  annualOffer?: AnnualOffer;
};

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

const money = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

// Solo monthly, today vs after the deadline, straight from the price constants.
const PRICE_ROWS = (["beginner", "power"] as const).map((level) => ({
  name: level === "beginner" ? "Beginner" : "Power User",
  today: LEVEL_PRICE_CENTS[level].solo?.monthly ?? 0,
  next: PRICE_CHANGE.prices[level].solo?.monthly ?? 0,
}));

const BG =
  "radial-gradient(circle at 12% 30%,rgba(251,191,36,.18) 0 2px,transparent 3px)," +
  "radial-gradient(circle at 78% 70%,rgba(249,115,22,.22) 0 2px,transparent 3px)," +
  "radial-gradient(circle at 45% 15%,rgba(255,255,255,.12) 0 1.5px,transparent 2.5px)," +
  "linear-gradient(100deg,#111827 0%,#1c1336 45%,#3b1206 100%)";

function Tile({ value, label }: { value: string; label: string }) {
  // Re-key on value so the flip animation replays on every change.
  return (
    <div className="min-w-[48px] rounded-lg border border-amber-400/50 bg-gradient-to-b from-white/15 to-white/5 px-1.5 pb-1 pt-1.5 text-center shadow-[inset_0_-2px_0_rgba(0,0,0,.25),0_2px_8px_rgba(0,0,0,.25)] sm:min-w-[56px]">
      <span
        key={value}
        className="block text-xl font-extrabold leading-none tabular-nums text-amber-400 motion-safe:animate-[ibpl-tick_.35s_ease-out] sm:text-2xl"
        style={{ textShadow: "0 0 12px rgba(251,191,36,.35)" }}
      >
        {value}
      </span>
      <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-slate-200 sm:text-[10px]">{label}</span>
    </div>
  );
}

export default function PriceLockBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const injected = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/price-lock-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Status | null) => {
        if (alive && data) setStatus(data);
      })
      .catch(() => {});
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    if (!injected.current && !document.getElementById("ibpl-dash-keyframes")) {
      injected.current = true;
      const style = document.createElement("style");
      style.id = "ibpl-dash-keyframes";
      style.textContent =
        "@keyframes ibpl-tick{0%{transform:translateY(-35%);opacity:.2}100%{transform:none;opacity:1}}" +
        "@keyframes ibpl-glow{0%,100%{box-shadow:0 0 0 0 rgba(250,204,21,.55)}50%{box-shadow:0 0 0 7px rgba(250,204,21,0)}}";
      document.head.appendChild(style);
    }
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!status || status.state === "none") return null;
  const end = Date.parse(status.endsAt);
  if (!Number.isFinite(end) || now >= end) return null;

  if (status.state === "locked") {
    const o = status.annualOffer;
    return (
      <div
        role="region"
        aria-label="Price lock"
        className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-xl">
              🔒
            </span>
            <div>
              <p className="font-semibold">You&apos;re locked in at your current price as long as you stay.</p>
              {o ? (
                <p className="mt-0.5">
                  Want a whole year at today&apos;s price? Switch to annual by Nov 30:{" "}
                  <b>{money(o.annualCents)} a year</b> (you save {money(o.saveCents)}). After Nov 30, annual is{" "}
                  {money(o.afterCents)}.
                </p>
              ) : null}
            </div>
          </div>
          {o ? (
            <a
              href="/dashboard/subscription?src=pl-dashboard-annual"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
            >
              Switch to annual
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const comp = status.state === "comp" && status.keepUrl;
  const p = parts(end - now);
  const lastDay = p.d === 0;
  return (
    <div
      role="region"
      aria-label="Price change notice"
      className="relative mb-6 overflow-hidden rounded-2xl border-b-2 border-amber-500 p-4 text-white shadow-lg sm:p-5"
      style={{ background: BG, backgroundSize: "140px 60px,180px 70px,90px 50px,100% 100%" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="text-3xl drop-shadow">
            🎩
          </span>
          <div className="min-w-0">
            <p
              className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${
                lastDay ? "text-red-300 motion-safe:animate-pulse" : "text-amber-400"
              }`}
            >
              {lastDay ? "⏰ Last day: prices go up tonight" : "Prices go up Nov 30"}
            </p>
            <p className="text-base font-extrabold sm:text-lg">
              {comp ? "Add a card by Nov 30 to keep today's price 🔒" : "Lock today's price forever 🔒"}
            </p>
            {comp ? (
              <p className="text-sm text-slate-200">No charge until your free time ends.</p>
            ) : (
              <>
                <p aria-hidden="true" className="mt-0.5 hidden text-[13px] font-semibold text-slate-200 sm:block">
                  {PRICE_ROWS.map((r, i) => (
                    <span key={r.name}>
                      {i > 0 ? " \u00b7 " : ""}
                      {r.name} <b className="font-extrabold text-amber-200">{money(r.today)}</b>/mo now,{" "}
                      <span className="font-medium text-slate-300">then {money(r.next)}</span>
                    </span>
                  ))}
                </p>
                <p className="sr-only">
                  Today: {PRICE_ROWS.map((r) => `${r.name} ${money(r.today)} a month`).join(", ")}. After Nov 30:{" "}
                  {PRICE_ROWS.map((r) => money(r.next)).join(" and ")}.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <Tile value={pad(p.d)} label="Days" />
            <Tile value={pad(p.h)} label="Hours" />
            <Tile value={pad(p.m)} label="Mins" />
            <Tile value={pad(p.s)} label="Secs" />
          </div>
          <span className="sr-only">
            {p.d} days {p.h} hours {p.m} minutes left
          </span>
          <a
            href={comp ? status.keepUrl : "/pricing?src=pl-dashboard"}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-extrabold text-slate-900 transition hover:-translate-y-px hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-safe:animate-[ibpl-glow_2.4s_ease-in-out_infinite]"
          >
            {comp ? "Keep today's price →" : "Start free trial →"}
          </a>
        </div>
      </div>
    </div>
  );
}
