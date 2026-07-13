"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Gift a free workspace" card for trusted affiliates. Lets them hand a prospect
 * a single-seat Pro workspace for a short window (capped at 2 months) so they
 * have wiggle room to convert them. Self-fetches /api/affiliates/comps for the
 * affiliate's monthly allowance and the comps they have already issued; the card
 * only renders when the dashboard says the affiliate is comp-enabled.
 *
 * Attribution: the prospect's email includes the affiliate's branded checkout
 * link, so if they upgrade through it the affiliate earns their normal referral
 * commission - the same way all referral credit works.
 */

type Unit = "day" | "month";

type IssuedGrant = {
  recipientEmail: string | null;
  code: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  state: "active" | "expiring" | "expired" | "cancelled";
};

type CompsData = {
  enabled: boolean;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  maxDays: number;
  maxMonths: number;
  updatedAt: string | null;
  grants: IssuedGrant[];
};

// localStorage key: the allowance timestamp the affiliate has already seen. When
// an admin changes their quota, updatedAt changes and the banner returns.
const SEEN_KEY = "ib-comp-allowance-seen";

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATE_BADGE: Record<IssuedGrant["state"], { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  expiring: { label: "Expiring soon", className: "bg-amber-100 text-amber-800" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Ended", className: "bg-slate-100 text-slate-600" },
};

export default function CompProspectCard() {
  const [data, setData] = useState<CompsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("14");
  const [unit, setUnit] = useState<Unit>("day");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSeenAt(window.localStorage.getItem(SEEN_KEY));
    } catch {
      // localStorage unavailable (private mode); the banner just always shows.
    }
  }, []);

  const dismissBanner = () => {
    const stamp = data?.updatedAt ?? "";
    try {
      window.localStorage.setItem(SEEN_KEY, stamp);
    } catch {
      // ignore
    }
    setSeenAt(stamp);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliates/comps", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(`Could not load your comps (${res.status}).`);
        return;
      }
      const json = (await res.json()) as CompsData;
      setData(json);
      setLoadError(null);
    } catch (err) {
      console.error("comps load failed", err);
      setLoadError("Network error. Please refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliates/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email.trim(), recipientName: name.trim(), unit, amount }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; recipientEmail?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not send the comp. Please try again.");
        return;
      }
      setSuccess(`Sent. ${json.recipientEmail ?? email.trim()} now has free Pro.`);
      setEmail("");
      setName("");
      await load();
    } catch (err) {
      console.error("comp issue failed", err);
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
        {loadError}
      </section>
    );
  }

  if (!data) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  }

  const maxAmount = unit === "day" ? data.maxDays : data.maxMonths;
  const outOfComps = data.remaining <= 0;
  const showBanner = Boolean(data.updatedAt) && data.updatedAt !== seenAt;

  return (
    <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-5 shadow-sm">
      {showBanner ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#f97316]/40 bg-white/70 p-3">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-[#c2410c]">VIP privilege updated.</span> Your butler
            set your allowance to {data.quota} guest pass{data.quota === 1 ? "" : "es"} per month.
            Use them to convert your warmest prospects.
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f97316]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#c2410c]">
            VIP
          </span>
          <h2 className="text-lg font-semibold text-slate-900">VIP Guest Passes</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            outOfComps ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {data.remaining} of {data.quota} left this month
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Hand a prospect a single-seat Pro workspace for up to {data.maxMonths} months so they can try
        the real thing, on the house. Every pass carries your referral link, so if your guest upgrades
        you earn your commission. It cancels itself automatically when the free time is up.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Prospect email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their name"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            How long
          </label>
          <input
            type="number"
            min={1}
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Unit
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          >
            <option value="day">Days</option>
            <option value="month">Months</option>
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Maximum {data.maxMonths} months ({data.maxDays} days), single seat. The prospect gets an
        email with their key and your upgrade link.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || outOfComps}
          className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {saving ? "Sending..." : "Send guest pass"}
        </button>
        {outOfComps ? (
          <span className="text-xs text-slate-500">
            You have used this month&apos;s comps. Your allowance resets on the 1st.
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-2 text-sm text-emerald-700">{success}</p> : null}

      <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Ideas for using a pass
        </p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-800">The fence-sitter:</span> someone who keeps
            asking &quot;does it actually work?&quot; Hand them two weeks and let the product answer.
          </li>
          <li>
            <span className="font-medium text-slate-800">The warm DM:</span> a creator you have been
            chatting with who has not pulled the trigger. A pass is a gracious nudge.
          </li>
          <li>
            <span className="font-medium text-slate-800">The thank-you:</span> a podcast host or
            collab partner. Gift a month; they experience Pro and remember who sent them.
          </li>
          <li>
            <span className="font-medium text-slate-800">The comeback:</span> a trial that fizzled or
            a lead who went cold. A short pass can reopen the conversation.
          </li>
          <li>
            <span className="font-medium text-slate-800">The room:</span> speaking at an event? A
            pass for the standouts turns a handshake into a signup.
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Use them wisely: passes are limited, so aim them at people genuinely likely to stay. A gift
          that converts pays you.
        </p>
      </div>

      {data.grants.length > 0 ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Passes you have sent
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {data.grants.map((g, i) => {
              const badge = STATE_BADGE[g.state];
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-mono text-slate-800">{g.recipientEmail ?? "-"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {g.state === "cancelled" || g.state === "expired"
                        ? `ended ${formatDate(g.expiresAt)}`
                        : g.daysRemaining != null
                          ? `${g.daysRemaining}d left`
                          : `expires ${formatDate(g.expiresAt)}`}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
