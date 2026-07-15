"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Profile = {
  id?: string;
  email?: string;
  display_name?: string | null;
  is_affiliate?: boolean;
  ls_affiliate_id?: string | null;
  affiliate_code?: string | null;
  ls_customer_id?: string | null;
};

type Subscription = {
  id: string;
  ls_subscription_id: string;
  status: string;
  plan_name: string | null;
  renews_at: string | null;
  ends_at: string | null;
};

type Order = {
  ls_order_id: string;
  status: string;
  total: number | null;
  currency: string | null;
  created_at: string;
};

type License = {
  ls_license_key_id: string;
  key: string;
  status: string;
  activation_limit: number | null;
};

type Referral = {
  code: string | null;
  affiliateUserId: string | null;
  affiliateEmail: string | null;
  affiliateName: string | null;
  attributionStatus: string | null;
  attributedAt: string | null;
};

type LookupResult = {
  found: boolean;
  userId?: string;
  profile?: Profile | null;
  subscriptions?: Subscription[];
  orders?: Order[];
  licenses?: License[];
  staff?: { role?: string; permissions?: string[]; is_active?: boolean } | null;
  referral?: Referral | null;
  error?: string;
};

function referralText(referral: Referral | null | undefined): string {
  if (!referral) return "none (organic)";
  const who =
    referral.affiliateName || referral.affiliateEmail
      ? ` by ${referral.affiliateName ?? referral.affiliateEmail}${
          referral.affiliateName && referral.affiliateEmail ? ` (${referral.affiliateEmail})` : ""
        }`
      : "";
  const code = referral.code ? `code ${referral.code}` : "no code recorded";
  const status = referral.attributionStatus === "pending" ? ", attribution pending" : "";
  return `${code}${who}${status}`;
}

function fmtMoney(total: number | null, currency: string | null): string {
  if (total == null) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(total / 100);
  } catch {
    return `${(total / 100).toFixed(2)} ${currency ?? ""}`;
  }
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Color-codes a status chip so cancelled/expired reads clearly different from
// active. Used by the subscription, order, and license badges.
function statusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (["active", "on_trial", "paid", "valid"].includes(s)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["cancelled", "canceled", "expired", "unpaid", "revoked", "refunded"].includes(s)) {
    return "bg-red-100 text-red-800";
  }
  if (["paused", "past_due", "pending"].includes(s)) {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-slate-100 text-slate-700";
}

// A cancelled/expired subscription has nothing left to cancel.
function isSubscriptionInactive(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return ["cancelled", "canceled", "expired"].includes(s);
}

export default function AdminUsersPage() {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [whoLoaded, setWhoLoaded] = useState(false);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [impersonateLink, setImpersonateLink] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/whoami", { cache: "no-store" });
        const json = (await res.json()) as {
          isStaff?: boolean;
          role?: string | null;
          permissions?: string[];
        };
        if (cancelled) return;
        if (!json.isStaff) {
          setForbidden(true);
        } else {
          setIsAdmin(json.role === "admin");
          setPerms(new Set(json.permissions ?? []));
        }
      } catch {
        setForbidden(true);
      } finally {
        if (!cancelled) setWhoLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const can = useCallback(
    (perm: string) => isAdmin || perms.has(perm),
    [isAdmin, perms],
  );

  const lookup = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    setImpersonateLink(null);
    try {
      const res = await fetch("/api/admin/users/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json()) as LookupResult;
      if (!res.ok) {
        setMsg(json.error ?? `Failed (${res.status})`);
        setResult(null);
        return;
      }
      setResult(json);
      if (!json.found) setMsg("No user found for that email.");
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  };

  // Generic action runner against an admin endpoint.
  const act = async (
    path: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) => {
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        deepLink?: string;
        actionLink?: string;
      };
      if (!res.ok) {
        setMsg(json.error ?? `Failed (${res.status})`);
        return;
      }
      if (json.actionLink) setImpersonateLink(json.actionLink);
      if (json.deepLink) window.open(json.deepLink, "_blank", "noopener");
      setMsg(json.message ?? successMsg);
      await lookup();
    } catch {
      setMsg("Network error.");
    }
  };

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Users
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">User lookup &amp; fixes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Find a user by email to see their account and run support actions you have permission for.
        </p>
      </header>
    ),
    [],
  );

  if (whoLoaded && forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">No access</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          You don&apos;t have permission to view users.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[260px] text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            User email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup();
            }}
            placeholder="user@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={lookup}
          disabled={busy}
          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
        >
          {busy ? "Searching…" : "Look up"}
        </button>
      </div>

      {msg ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {msg}
        </div>
      ) : null}

      {impersonateLink ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Impersonation link (treat as a password)</p>
          <p className="mt-1 break-all font-mono text-xs">{impersonateLink}</p>
          <a
            href={impersonateLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block font-semibold underline"
          >
            Open as this user
          </a>
        </div>
      ) : null}

      {result?.found ? (
        <div className="space-y-6">
          {/* Profile */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Email: </span>{result.profile?.email ?? "-"}</div>
              <div><span className="text-slate-500">Name: </span>{result.profile?.display_name ?? "-"}</div>
              <div><span className="text-slate-500">User ID: </span><span className="font-mono text-xs">{result.userId}</span></div>
              <div><span className="text-slate-500">Affiliate: </span>{result.profile?.is_affiliate ? `yes (${result.profile?.affiliate_code ?? "no code"})` : "no"}</div>
              <div><span className="text-slate-500">Referred: </span>{referralText(result.referral)}</div>
              {result.staff ? (
                <div><span className="text-slate-500">Staff: </span>{result.staff.role} ({result.staff.is_active ? "active" : "disabled"})</div>
              ) : null}
            </div>

            {/* Account actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {can("users.resend_auth") ? (
                <button
                  type="button"
                  onClick={() => act("/api/admin/users/resend-auth", { email: result.profile?.email }, "Sign-in link sent.")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Resend sign-in link
                </button>
              ) : null}
              {can("users.impersonate") ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Generate a link to sign in AS this user? This is logged.")) {
                      void act("/api/admin/users/impersonate", { email: result.profile?.email }, "Impersonation link generated.");
                    }
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  Impersonate
                </button>
              ) : null}
              {can("users.delete") ? (
                <button
                  type="button"
                  onClick={() => {
                    const typed = window.prompt(
                      `Permanently delete this user? Type their email to confirm:\n${result.profile?.email ?? ""}`,
                    );
                    if (typed) {
                      void act("/api/admin/users/delete", { userId: result.userId, confirmEmail: typed }, "User deleted.");
                    }
                  }}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Delete user
                </button>
              ) : null}
            </div>
          </section>

          {/* Subscriptions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>
            {(result.subscriptions ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {result.subscriptions!.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <span className="font-medium">{s.plan_name ?? "Subscription"}</span>{" "}
                        <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadgeClass(s.status)}`}>{s.status}</span>
                        {s.ends_at ? (
                          <span className="ml-2 text-xs text-slate-500">Access until {fmtDate(s.ends_at)}</span>
                        ) : null}
                      </div>
                      <span className="font-mono text-xs text-slate-400">{s.ls_subscription_id}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {can("billing.cancel") ? (
                        <button type="button" disabled={isSubscriptionInactive(s.status)} onClick={() => { if (window.confirm("Cancel this subscription via Lemon Squeezy?")) void act("/api/admin/billing/cancel", { lsSubscriptionId: s.ls_subscription_id }, "Cancelled."); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">{isSubscriptionInactive(s.status) ? "Cancelled" : "Cancel"}</button>
                      ) : null}
                      {can("billing.comp") ? (
                        <button type="button" onClick={() => void act("/api/admin/billing/guided", { action: "comp", lsSubscriptionId: s.ls_subscription_id }, "Logged.")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Comp / extend</button>
                      ) : null}
                      {can("billing.plan.edit") ? (
                        <button type="button" onClick={() => void act("/api/admin/billing/guided", { action: "plan", lsSubscriptionId: s.ls_subscription_id }, "Logged.")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Change plan</button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Orders */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Orders</h2>
            {(result.orders ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.orders!.map((o) => (
                  <li key={o.ls_order_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                    <span>{fmtMoney(o.total, o.currency)} · <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadgeClass(o.status)}`}>{o.status}</span></span>
                    {can("billing.refund") ? (
                      <button type="button" onClick={() => void act("/api/admin/billing/guided", { action: "refund", lsOrderId: o.ls_order_id }, "Logged.")} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Refund</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Licenses */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">License keys</h2>
            {(result.licenses ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.licenses!.map((l) => (
                  <li key={l.ls_license_key_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs break-all">{l.key}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadgeClass(l.status)}`}>{l.status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {can("licenses.resend") ? (
                        <button type="button" onClick={() => void act("/api/admin/licenses/resend", { lsLicenseKeyId: l.ls_license_key_id }, "License emailed.")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Resend</button>
                      ) : null}
                      {can("licenses.revoke") ? (
                        <button type="button" onClick={() => { const reactivate = l.status === "revoked"; if (window.confirm(reactivate ? "Reactivate this license?" : "Revoke this license?")) void act("/api/admin/licenses/revoke", { lsLicenseKeyId: l.ls_license_key_id, reactivate }, "Updated."); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{l.status === "revoked" ? "Reactivate" : "Revoke"}</button>
                      ) : null}
                      {can("licenses.regenerate") ? (
                        <button type="button" onClick={() => void act("/api/admin/licenses/regenerate", { lsLicenseKeyId: l.ls_license_key_id }, "Logged.")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Regenerate</button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
