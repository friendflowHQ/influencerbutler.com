"use client";

import { useMemo, useState } from "react";

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

export default function CreditReferralTab({ affiliates }: { affiliates: AffiliateOption[] }) {
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

      {options.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No affiliates loaded yet. Open the Roster tab first.
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
