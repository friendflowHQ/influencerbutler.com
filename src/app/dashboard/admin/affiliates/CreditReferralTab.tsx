"use client";

import { useEffect, useMemo, useState } from "react";

export type AffiliateOption = {
  userId: string;
  name: string | null;
  email: string | null;
  affiliateCode: string | null;
};

type FormState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "success"; message: string; detail?: string | null }
  | { kind: "error"; message: string; detail?: string | null };

function AffiliatePicker({
  affiliates,
  value,
  onChange,
  id,
}: {
  affiliates: AffiliateOption[];
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Affiliate to credit
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
      >
        <option value="">Select an affiliate…</option>
        {affiliates.map((a) => (
          <option key={a.userId} value={a.userId}>
            {(a.name ?? a.email ?? a.userId) + (a.affiliateCode ? ` (${a.affiliateCode})` : " (no code)")}
          </option>
        ))}
      </select>
    </div>
  );
}

function dollarsToCents(v: string): number | null {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type MakeWholeResult = {
  adjustmentId: string | null;
  makeWhole: { amountCents: number; perBillingCents: number; billings: number } | null;
  affiliate: { code: string | null; ratePercent: number } | null;
  lsDeepLink: string;
  instructions: string;
  migrationPending: boolean;
};

/**
 * Records a deeper loyalty discount for a referred customer and the affiliate
 * make-whole in one step, then (after the operator sends PayPal) marks the
 * make-whole paid so it reconciles into 1099 / Xero. The actual LS price change
 * and PayPal transfer stay manual; this card records + reconciles them.
 */
function LoyaltyMakeWholeCard() {
  const [email, setEmail] = useState("");
  const [subId, setSubId] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [result, setResult] = useState<MakeWholeResult | null>(null);
  const [paid, setPaid] = useState(false);
  const [payState, setPayState] = useState<FormState>({ kind: "idle" });

  const submit = async () => {
    const referredPriceCents = dollarsToCents(currentPrice);
    const newPriceCents = dollarsToCents(newPrice);
    if (referredPriceCents == null || newPriceCents == null) {
      setState({ kind: "error", message: "Enter valid current and new prices." });
      return;
    }
    setState({ kind: "working" });
    setResult(null);
    setPaid(false);
    setPayState({ kind: "idle" });
    try {
      const res = await fetch("/api/admin/billing/loyalty-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          lsSubscriptionId: subId.trim() || null,
          referredPriceCents,
          newPriceCents,
          note: note.trim() || null,
        }),
      });
      const json = (await res.json()) as MakeWholeResult & { error?: string };
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setResult(json);
      const mw = json.makeWhole;
      const detail = [
        mw && mw.amountCents > 0
          ? `Make-whole owed: ${fmtCents(mw.amountCents)} (${json.affiliate?.ratePercent ?? 0}% x ${mw.billings} billing${mw.billings === 1 ? "" : "s"})`
          : "No affiliate make-whole owed.",
        json.instructions,
      ].join("\n");
      setState({
        kind: "success",
        message: json.migrationPending
          ? "Recorded, but the discount tables are not applied in prod yet (apply the 20260820 migration)."
          : "Recorded. Apply the price in Lemon Squeezy, then mark the make-whole paid below.",
        detail,
      });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: "Network error." });
    }
  };

  const markPaid = async () => {
    if (!result?.adjustmentId) return;
    setPayState({ kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-makewhole-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustmentId: result.adjustmentId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; alreadyPaid?: boolean };
      if (!res.ok) {
        setPayState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setPaid(true);
      setPayState({
        kind: "success",
        message: json.alreadyPaid ? "Already recorded as paid." : "Make-whole recorded as paid.",
      });
    } catch (err) {
      console.error(err);
      setPayState({ kind: "error", message: "Network error." });
    }
  };

  const disabled =
    state.kind === "working" ||
    (!email.trim() && !subId.trim()) ||
    !currentPrice.trim() ||
    !newPrice.trim();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Loyalty discount + affiliate make-whole</h3>
      <p className="mt-1 text-sm text-slate-600">
        Honor a deeper discount for a referred customer without shorting the affiliate. Records the
        discount and the commission difference the affiliate is owed at the price they referred at.
        You still lower the price in Lemon Squeezy and send the PayPal yourself; this tracks and
        reconciles both.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lmw-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Customer email
          </label>
          <input
            id="lmw-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">Or use a subscription id below.</p>
        </div>
        <div>
          <label htmlFor="lmw-sub" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            LS subscription id (optional)
          </label>
          <input
            id="lmw-sub"
            type="text"
            value={subId}
            onChange={(e) => setSubId(e.target.value)}
            placeholder="2423265"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="lmw-cur" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Current price (what they pay now)
          </label>
          <input
            id="lmw-cur"
            inputMode="decimal"
            value={currentPrice}
            onChange={(e) => setCurrentPrice(e.target.value)}
            placeholder="331.50"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">The net the affiliate referred them at.</p>
        </div>
        <div>
          <label htmlFor="lmw-new" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            New price (target)
          </label>
          <input
            id="lmw-new"
            inputMode="decimal"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="273.00"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lmw-note" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Note (shown to the affiliate)
          </label>
          <input
            id="lmw-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Goodwill discount for a support issue."
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {state.kind === "working" ? "Recording…" : "Record discount + make-whole"}
        </button>
      </div>

      {state.kind === "success" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">{state.message}</p>
          {state.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-emerald-900">
              {state.detail}
            </pre>
          ) : null}
          {result?.lsDeepLink ? (
            <a href={result.lsDeepLink} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold underline">
              Open the subscription in Lemon Squeezy
            </a>
          ) : null}
          {result?.adjustmentId && result.makeWhole && result.makeWhole.amountCents > 0 ? (
            <div className="mt-3 border-t border-emerald-200 pt-3">
              <p className="text-xs">
                After you PayPal the affiliate {fmtCents(result.makeWhole.amountCents)}, record it so it
                counts toward their 1099 / Xero:
              </p>
              <button
                type="button"
                onClick={markPaid}
                disabled={payState.kind === "working" || paid}
                className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
              >
                {paid ? "Marked paid" : payState.kind === "working" ? "Recording…" : "Mark make-whole paid (PayPal sent)"}
              </button>
              {payState.kind === "error" ? (
                <p className="mt-2 text-xs text-red-700">{payState.message}</p>
              ) : null}
              {payState.kind === "success" ? (
                <p className="mt-2 text-xs text-emerald-700">{payState.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

type CompMakeWholeResult = {
  recorded: boolean;
  schedule: "monthly" | "lump";
  installments: number;
  perInstallmentCents: number;
  voidedPrevious: number;
  adjustmentId: string | null;
  affiliate: { code: string | null; ratePercent: number } | null;
  monthsAlreadyPaid: number;
  payableMonths: number;
  windowMonths: number;
  makeWhole: { amountCents: number; perBillingCents: number; billings: number } | null;
  message: string;
  migrationPending?: boolean;
};

/**
 * Compensate a referring affiliate when their referred customer is comped (paid
 * sub cancelled -> free 100%-off comp). Records what the affiliate is owed for
 * the comp period, bounded to their remaining commission window, then (after the
 * operator sends PayPal) marks it paid so it reconciles into 1099 / Xero. Works
 * without a live subscription and takes the affiliate explicitly, because a
 * referred customer is often still "attribution pending".
 */
function CompMakeWholeCard({
  initialCustomer,
  initialCode,
}: {
  initialCustomer?: string;
  initialCode?: string;
}) {
  const [email, setEmail] = useState(initialCustomer ?? "");
  const [code, setCode] = useState(initialCode ?? "");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [compMonths, setCompMonths] = useState("12");
  const [scheduleMonthly, setScheduleMonthly] = useState(true);
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [result, setResult] = useState<CompMakeWholeResult | null>(null);
  const [paid, setPaid] = useState(false);
  const [payState, setPayState] = useState<FormState>({ kind: "idle" });
  // Number of months the customer already paid (deducted from the make-whole).
  const [monthsAlreadyPaid, setMonthsAlreadyPaid] = useState<number | null>(null);

  // When deep-linked with a customer, prefill the monthly price (their latest
  // real paid charge) and comp length (their comp grant) so the operator just
  // confirms and records. Best-effort: a failed suggest leaves the fields blank.
  useEffect(() => {
    const customer = (initialCustomer ?? "").trim();
    if (!customer) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/billing/comp-makewhole?email=${encodeURIComponent(customer)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          found?: boolean;
          referredMonthlyCents?: number | null;
          compMonths?: number | null;
          monthsAlreadyPaid?: number | null;
        };
        if (cancelled || !json.found) return;
        if (typeof json.referredMonthlyCents === "number" && json.referredMonthlyCents > 0) {
          setMonthlyPrice((json.referredMonthlyCents / 100).toFixed(2));
        }
        if (typeof json.compMonths === "number" && json.compMonths > 0) {
          setCompMonths(String(json.compMonths));
        }
        if (typeof json.monthsAlreadyPaid === "number") {
          setMonthsAlreadyPaid(json.monthsAlreadyPaid);
        }
      } catch {
        // best-effort prefill only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCustomer]);

  const submit = async () => {
    const referredMonthlyCents = dollarsToCents(monthlyPrice);
    const months = Number.parseInt(compMonths, 10);
    if (referredMonthlyCents == null || referredMonthlyCents <= 0) {
      setState({ kind: "error", message: "Enter the referred monthly price." });
      return;
    }
    if (!Number.isFinite(months) || months <= 0) {
      setState({ kind: "error", message: "Enter the comp length in months." });
      return;
    }
    setState({ kind: "working" });
    setResult(null);
    setPaid(false);
    setPayState({ kind: "idle" });
    try {
      const res = await fetch("/api/admin/billing/comp-makewhole", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          affiliateCode: code.trim() || null,
          referredMonthlyCents,
          compMonths: months,
          schedule: scheduleMonthly ? "monthly" : "lump",
          note: note.trim() || null,
        }),
      });
      const json = (await res.json()) as CompMakeWholeResult & { error?: string };
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setResult(json);
      const mw = json.makeWhole;
      const owedLine = !json.recorded
        ? "Nothing owed."
        : json.schedule === "monthly"
          ? `Make-whole: ${json.installments} monthly installment${json.installments === 1 ? "" : "s"} of ${fmtCents(json.perInstallmentCents)} (total ${fmtCents(mw?.amountCents ?? 0)}). First is due now; the rest appear in the affiliate's Owed one per month.`
          : `Make-whole owed: ${fmtCents(mw?.amountCents ?? 0)} lump (${json.affiliate?.ratePercent ?? 0}% x ${fmtCents(mw?.perBillingCents ?? 0)}/mo x ${json.payableMonths} month${json.payableMonths === 1 ? "" : "s"}).`;
      const detail = [
        owedLine,
        `Already credited: ${json.monthsAlreadyPaid} of a ${json.windowMonths}-month window.`,
        json.voidedPrevious > 0
          ? `Replaced ${json.voidedPrevious} earlier unpaid comp make-whole record${json.voidedPrevious === 1 ? "" : "s"} for this customer.`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      setState({
        kind: "success",
        message: json.message,
        detail,
      });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: "Network error." });
    }
  };

  const markPaid = async () => {
    if (!result?.adjustmentId) return;
    setPayState({ kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-makewhole-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustmentId: result.adjustmentId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; alreadyPaid?: boolean };
      if (!res.ok) {
        setPayState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setPaid(true);
      setPayState({
        kind: "success",
        message: json.alreadyPaid ? "Already recorded as paid." : "Make-whole recorded as paid.",
      });
    } catch (err) {
      console.error(err);
      setPayState({ kind: "error", message: "Network error." });
    }
  };

  const disabled = state.kind === "working" || !email.trim() || !monthlyPrice.trim() || !compMonths.trim();

  // Preview of months we'll actually pay for: the comp length minus months
  // already paid, capped at the default 12-month window. Approximate (the server
  // uses the affiliate's real window/rate); the recorded result is exact.
  const monthsNum = Number.parseInt(compMonths, 10);
  const payablePreview =
    monthsAlreadyPaid != null && Number.isFinite(monthsNum)
      ? Math.max(0, Math.min(monthsNum, 12 - monthsAlreadyPaid))
      : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Comp make-whole (referred customer)</h3>
      <p className="mt-1 text-sm text-slate-600">
        When you comp a referred customer (cancel their paid sub, grant a free comp), their affiliate
        stops earning. Record what the affiliate is owed for the comp period here. It&apos;s bounded to
        the affiliate&apos;s remaining commission window, so months they already earned on real paid
        orders are not double-paid. Send the PayPal yourself; this tracks and reconciles it.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cmw-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Customer email
          </label>
          <input
            id="cmw-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="cmw-code" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Affiliate code
          </label>
          <input
            id="cmw-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KAY"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">Needed when attribution is still pending.</p>
        </div>
        <div>
          <label htmlFor="cmw-price" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Referred monthly price
          </label>
          <input
            id="cmw-price"
            inputMode="decimal"
            value={monthlyPrice}
            onChange={(e) => setMonthlyPrice(e.target.value)}
            placeholder="23.00"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">What they paid per month before the comp.</p>
        </div>
        <div>
          <label htmlFor="cmw-months" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Comp length (months)
          </label>
          <input
            id="cmw-months"
            type="number"
            min={1}
            value={compMonths}
            onChange={(e) => setCompMonths(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            The full comp you granted. Months already paid are deducted automatically.
          </p>
          {monthsAlreadyPaid != null ? (
            <p className="mt-1 text-xs text-slate-500">
              {monthsAlreadyPaid} month{monthsAlreadyPaid === 1 ? "" : "s"} already paid
              {payablePreview != null ? ` -> ~${payablePreview} month${payablePreview === 1 ? "" : "s"} payable` : ""}.
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Payout schedule
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setScheduleMonthly(true)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                scheduleMonthly
                  ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Monthly installments
            </button>
            <button
              type="button"
              onClick={() => setScheduleMonthly(false)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                !scheduleMonthly
                  ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              One lump
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {scheduleMonthly
              ? "Pays the affiliate as they would have earned it: one entry per remaining month, each showing in their Owed on its own month."
              : "Records the whole amount as a single owed entry, payable now."}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cmw-note" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Note (shown to the affiliate)
          </label>
          <input
            id="cmw-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Customer moved to a comp; keeping your commission whole."
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {state.kind === "working" ? "Recording…" : "Record comp make-whole"}
        </button>
      </div>

      {state.kind === "success" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">{state.message}</p>
          {state.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-emerald-900">
              {state.detail}
            </pre>
          ) : null}
          {result?.recorded && result.schedule === "lump" && result.adjustmentId && result.makeWhole && result.makeWhole.amountCents > 0 ? (
            <div className="mt-3 border-t border-emerald-200 pt-3">
              <p className="text-xs">
                After you PayPal the affiliate {fmtCents(result.makeWhole.amountCents)}, record it so it
                counts toward their 1099 / Xero:
              </p>
              <button
                type="button"
                onClick={markPaid}
                disabled={payState.kind === "working" || paid}
                className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
              >
                {paid ? "Marked paid" : payState.kind === "working" ? "Recording…" : "Mark make-whole paid (PayPal sent)"}
              </button>
              {payState.kind === "error" ? (
                <p className="mt-2 text-xs text-red-700">{payState.message}</p>
              ) : null}
              {payState.kind === "success" ? (
                <p className="mt-2 text-xs text-emerald-700">{payState.message}</p>
              ) : null}
            </div>
          ) : null}
          {result?.recorded && result.schedule === "monthly" ? (
            <div className="mt-3 border-t border-emerald-200 pt-3 text-xs">
              <p>
                Each month, this affiliate&apos;s {fmtCents(result.perInstallmentCents)} installment shows up
                on the <span className="font-semibold">Payouts</span> tab. Pay it via PayPal and mark it paid
                there, the same as any other owed commission.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function CompCard({ affiliates }: { affiliates: AffiliateOption[] }) {
  const [affiliate, setAffiliate] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("14");
  const [unit, setUnit] = useState<"day" | "month">("day");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const selected = affiliates.find((a) => a.userId === affiliate) ?? null;
  const noCode = selected !== null && !selected.affiliateCode;

  const submit = async () => {
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-issue-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliate,
          recipientEmail: email,
          recipientName: name || null,
          unit,
          amount: Number.parseInt(amount, 10),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        key?: string;
        expiresAt?: string | null;
        convertLink?: string | null;
        emailSent?: boolean;
        warning?: string | null;
      };
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      const expires = json.expiresAt
        ? new Date(json.expiresAt).toLocaleDateString("en-US", { dateStyle: "medium" })
        : "no expiry";
      const emailNote = json.emailSent
        ? "The prospect was emailed their key and upgrade link."
        : "Email delivery is off here, so send the key below to the prospect yourself.";
      const detailParts = [
        json.key ? `Key: ${json.key}` : null,
        `Expires: ${expires}`,
        json.convertLink ? `Upgrade link: ${json.convertLink}` : null,
        json.warning ?? null,
      ].filter(Boolean) as string[];
      setState({
        kind: "success",
        message: `Comp issued. ${emailNote}`,
        detail: detailParts.join("\n"),
      });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: "Network error." });
    }
  };

  const disabled =
    state.kind === "working" || !affiliate || !email.trim() || !amount.trim();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Extend a prospect on an affiliate&apos;s behalf</h3>
      <p className="mt-1 text-sm text-slate-600">
        Grants the prospect a free Pro Solo comp (single seat) and emails them the affiliate&apos;s
        branded upgrade link, so when they convert the affiliate is credited. Use this when a
        customer forgot to click the affiliate&apos;s link before trying the app.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AffiliatePicker id="comp-aff" affiliates={affiliates} value={affiliate} onChange={setAffiliate} />
        <div>
          <label htmlFor="comp-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Prospect email
          </label>
          <input
            id="comp-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prospect@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="comp-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Prospect name (optional)
          </label>
          <input
            id="comp-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Roxy"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Free window
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "day" | "month")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
            >
              <option value="day">days</option>
              <option value="month">months</option>
            </select>
          </div>
        </div>
      </div>

      {noCode ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This affiliate has no branded code, so the comp email will have no upgrade link. Generate
          their code on the Roster tab first for the credit to flow automatically.
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
        >
          {state.kind === "working" ? "Issuing…" : "Issue comp"}
        </button>
      </div>

      {state.kind === "success" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">{state.message}</p>
          {state.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-emerald-900">
              {state.detail}
            </pre>
          ) : null}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

function AttributeCard({ affiliates }: { affiliates: AffiliateOption[] }) {
  const [affiliate, setAffiliate] = useState("");
  const [mode, setMode] = useState<"order" | "email">("email");
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [force, setForce] = useState(false);
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const submit = async () => {
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-attribute-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliate,
          orderId: mode === "order" ? orderId : null,
          recipientEmail: mode === "email" ? email : null,
          force,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        stampedCount?: number;
        stamped?: string[];
        skipped?: { orderId: string; reason: string }[];
      };
      if (!res.ok) {
        setState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      const skippedNote =
        json.skipped && json.skipped.length > 0
          ? "\nSkipped:\n" + json.skipped.map((s) => `  ${s.orderId}: ${s.reason}`).join("\n")
          : "";
      setState({
        kind: json.stampedCount ? "success" : "error",
        message: json.stampedCount
          ? `Attributed ${json.stampedCount} order${json.stampedCount === 1 ? "" : "s"} to the affiliate. It will now appear in their Owed report.`
          : "No orders were attributed.",
        detail: (json.stamped && json.stamped.length ? "Stamped:\n" + json.stamped.map((o) => `  ${o}`).join("\n") : "") + skippedNote,
      });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: "Network error." });
    }
  };

  const disabled =
    state.kind === "working" ||
    !affiliate ||
    (mode === "order" ? !orderId.trim() : !email.trim());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Attribute an existing order (backstop)</h3>
      <p className="mt-1 text-sm text-slate-600">
        For a customer who already paid WITHOUT the affiliate&apos;s link. Stamps their paid
        order(s) with the affiliate so it lands in the affiliate&apos;s Owed report and PayPal
        payout. Won&apos;t overwrite an order already attributed to a different affiliate unless you
        tick force.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AffiliatePicker id="attr-aff" affiliates={affiliates} value={affiliate} onChange={setAffiliate} />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Match by
          </label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("email")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                mode === "email"
                  ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Customer email
            </button>
            <button
              type="button"
              onClick={() => setMode("order")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                mode === "order"
                  ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              Order id
            </button>
          </div>
        </div>
        {mode === "email" ? (
          <div>
            <label htmlFor="attr-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Customer email
            </label>
            <input
              id="attr-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Stamps all their un-attributed paid orders.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="attr-order" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Order id (ls_order_id)
            </label>
            <input
              id="attr-order"
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
            />
          </div>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Force: overwrite an order already attributed to a different affiliate
      </label>

      <div className="mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
        >
          {state.kind === "working" ? "Attributing…" : "Attribute order"}
        </button>
      </div>

      {state.kind === "success" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">{state.message}</p>
          {state.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-emerald-900">
              {state.detail}
            </pre>
          ) : null}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{state.message}</p>
          {state.detail ? (
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-red-900">
              {state.detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function CreditReferralTab({
  affiliates,
  initialCustomer,
  initialCode,
}: {
  affiliates: AffiliateOption[];
  initialCustomer?: string;
  initialCode?: string;
}) {
  // Only affiliates make sense as a credit target. Sort by name for the picker.
  const options = useMemo(
    () =>
      [...affiliates].sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
      ),
    [affiliates],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Credit an affiliate
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Credit an affiliate for a referral
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          When a customer meant to use an affiliate&apos;s link but didn&apos;t, credit the
          affiliate here: extend the prospect on the affiliate&apos;s behalf (proactive), or
          attribute an order they already paid for (backstop).
        </p>
      </div>

      <CompMakeWholeCard initialCustomer={initialCustomer} initialCode={initialCode} />

      <LoyaltyMakeWholeCard />

      {options.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No affiliates loaded yet. Open the Roster tab first to use the comp / attribute tools.
        </div>
      ) : (
        <>
          <CompCard affiliates={options} />
          <AttributeCard affiliates={options} />
        </>
      )}
    </div>
  );
}
