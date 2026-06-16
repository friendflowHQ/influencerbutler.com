"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SocialHandles = Record<string, string | null | undefined>;

type PendingApplication = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  website: string | null;
  social_handles: SocialHandles | null;
  audience_size: string | null;
  niche: string | null;
  promotion_strategy: string;
  created_at: string;
  status: string;
};

type ListResponse = {
  admin?: { email: string };
  pending?: PendingApplication[];
  error?: string;
};

type StuckAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  appliedAt: string | null;
};

type LsAffiliate = {
  id: string;
  email: string | null;
  name: string | null;
  status: string;
  linkedToUserId: string | null;
  emailMatchesUserId: string | null;
};

type ReconcileResponse = {
  admin?: { email: string };
  stuck?: StuckAffiliate[];
  lsAffiliates?: LsAffiliate[];
  error?: string;
};

type RowState =
  | { kind: "idle" }
  | { kind: "working"; action: "approve" | "reject" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type LinkRowState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminAffiliatesPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingApplication[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Reconciliation (manual LS linking) state.
  const [stuck, setStuck] = useState<StuckAffiliate[]>([]);
  const [lsAffiliates, setLsAffiliates] = useState<LsAffiliate[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(true);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [linkSel, setLinkSel] = useState<Record<string, string>>({});
  const [linkRow, setLinkRow] = useState<Record<string, LinkRowState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/affiliates/admin-list", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setAdminEmail(json.admin?.email ?? null);
      setPending(json.pending ?? []);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReconcile = useCallback(async () => {
    setReconcileLoading(true);
    setReconcileError(null);
    try {
      const res = await fetch("/api/affiliates/admin-reconcile", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as ReconcileResponse;
      if (!res.ok) {
        setReconcileError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setStuck(json.stuck ?? []);
      setLsAffiliates(json.lsAffiliates ?? []);
    } catch (err) {
      console.error(err);
      setReconcileError("Network error loading linking data.");
    } finally {
      setReconcileLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadReconcile();
  }, [load, loadReconcile]);

  const setRow = (userId: string, state: RowState) =>
    setRowState((prev) => ({ ...prev, [userId]: state }));

  const setLink = (userId: string, state: LinkRowState) =>
    setLinkRow((prev) => ({ ...prev, [userId]: state }));

  const suggestedLsId = (aff: StuckAffiliate): string =>
    lsAffiliates.find((l) => l.emailMatchesUserId === aff.userId && !l.linkedToUserId)?.id ?? "";

  const effectiveSel = (aff: StuckAffiliate): string =>
    linkSel[aff.userId] ?? suggestedLsId(aff);

  const onLink = async (aff: StuckAffiliate) => {
    const lsAffiliateId = effectiveSel(aff).trim();
    if (!lsAffiliateId) {
      setLink(aff.userId, { kind: "error", message: "Pick a Lemon Squeezy affiliate first." });
      return;
    }
    if (
      !window.confirm(
        `Link ${aff.fullName ?? aff.email ?? aff.userId} to Lemon Squeezy affiliate ${lsAffiliateId}?\n\nThis unlocks their dashboard and starts crediting commission on their code.`,
      )
    ) {
      return;
    }
    setLink(aff.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: aff.userId, lsAffiliateId }),
      });
      const json = (await res.json()) as {
        error?: string;
        lsStatus?: string;
        lsEmail?: string | null;
      };
      if (!res.ok) {
        setLink(aff.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      const note = json.lsStatus && json.lsStatus !== "active"
        ? ` (LS status: ${json.lsStatus} - they earn once LS marks them active).`
        : ".";
      setLink(aff.userId, { kind: "success", message: `Linked${note}` });
      setTimeout(() => {
        void loadReconcile();
      }, 1500);
    } catch (err) {
      console.error(err);
      setLink(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  const onApprove = async (app: PendingApplication) => {
    if (
      !window.confirm(
        `Approve ${app.full_name} (${app.email})?\n\nThis approves the application, creates their branded discount code in Lemon Squeezy, and emails them with instructions to finalize setup at LS's affiliate portal.`,
      )
    ) {
      return;
    }
    setRow(app.user_id, { kind: "working", action: "approve" });
    try {
      const res = await fetch("/api/affiliates/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: app.user_id }),
      });
      const json = (await res.json()) as {
        error?: string;
        lsAffiliateId?: string | null;
        emailSent?: boolean;
        brandedCode?: string | null;
      };
      if (!res.ok) {
        setRow(app.user_id, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      const parts: string[] = ["Approved."];
      if (json.brandedCode) parts.push(`Code: ${json.brandedCode}.`);
      if (json.lsAffiliateId) {
        parts.push(`LS ID ${json.lsAffiliateId}.`);
      } else {
        parts.push("Awaiting their LS portal signup.");
      }
      parts.push(json.emailSent ? "Email sent." : "Email not sent (Resend not configured).");
      setRow(app.user_id, { kind: "success", message: parts.join(" ") });
      // Refresh list so the approved row disappears.
      setTimeout(() => {
        void load();
      }, 1500);
    } catch (err) {
      console.error(err);
      setRow(app.user_id, { kind: "error", message: "Network error." });
    }
  };

  const onReject = async (app: PendingApplication) => {
    const reason = window.prompt(`Reject ${app.full_name}? (Optional reason)`, "");
    if (reason === null) return;
    setRow(app.user_id, { kind: "working", action: "reject" });
    try {
      const res = await fetch("/api/affiliates/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: app.user_id, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRow(app.user_id, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setRow(app.user_id, { kind: "success", message: "Rejected." });
      setTimeout(() => {
        void load();
      }, 1000);
    } catch (err) {
      console.error(err);
      setRow(app.user_id, { kind: "error", message: "Network error." });
    }
  };

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Affiliates
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Pending applications
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {adminEmail ? `Signed in as ${adminEmail}.` : null} Approving creates a Lemon Squeezy
          affiliate, stores the ID on the user&apos;s profile, and emails them their referral link.
        </p>
      </header>
    ),
    [adminEmail],
  );

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin only</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          Your account isn&apos;t in the admin allowlist. If you should have access, add your email
          to the <code className="rounded bg-amber-100 px-1 py-0.5">ADMIN_EMAILS</code> environment
          variable.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {pending.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No pending applications. ✨
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((app) => {
            const state = rowState[app.user_id] ?? { kind: "idle" };
            const working = state.kind === "working";
            return (
              <li
                key={app.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-slate-900 break-words">{app.full_name}</p>
                    <p className="text-sm text-slate-600 break-all">{app.email}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Submitted {formatDate(app.created_at)} · user_id {app.user_id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onReject(app)}
                      disabled={working}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                    >
                      {state.kind === "working" && state.action === "reject"
                        ? "Rejecting…"
                        : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(app)}
                      disabled={working}
                      className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {state.kind === "working" && state.action === "approve"
                        ? "Approving…"
                        : "Approve"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <Detail label="Website / channel" value={app.website} />
                  <Detail label="Audience" value={app.audience_size} />
                  <Detail label="Niche" value={app.niche} />
                  <Detail label="Socials" value={formatSocials(app.social_handles)} />
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700">
                    Promotion plan
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    {app.promotion_strategy}
                  </p>
                </details>

                {state.kind === "success" ? (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {state.message}
                  </p>
                ) : null}
                {state.kind === "error" ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {state.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Admin · Affiliate linking
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Link stuck affiliates to Lemon Squeezy
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            These users are approved on our side but have no Lemon Squeezy affiliate ID, so their
            dashboard stays locked and their code earns no commission. This happens when their LS
            signup email differs from their dashboard email. Pick the matching LS affiliate and link
            them. An &quot;email match&quot; tag means the emails already line up.
          </p>
        </div>

        {reconcileLoading ? (
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ) : reconcileError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {reconcileError}
          </div>
        ) : stuck.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Every approved affiliate is linked to Lemon Squeezy. ✨
          </div>
        ) : (
          <ul className="space-y-4">
            {stuck.map((aff) => {
              const state = linkRow[aff.userId] ?? { kind: "idle" };
              const working = state.kind === "working";
              const selected = effectiveSel(aff);
              const available = lsAffiliates.filter((l) => !l.linkedToUserId);
              return (
                <li
                  key={aff.userId}
                  className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900 break-words">
                        {aff.fullName ?? "(no name)"}
                      </p>
                      <p className="text-sm text-slate-600 break-all">{aff.email ?? "(no email)"}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {aff.affiliateCode ? `Code ${aff.affiliateCode} · ` : ""}
                        {aff.appliedAt ? `Applied ${formatDate(aff.appliedAt)} · ` : ""}
                        user_id {aff.userId.slice(0, 8)}…
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="flex-1 min-w-[260px] text-sm">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Lemon Squeezy affiliate
                      </span>
                      <select
                        value={selected}
                        onChange={(e) =>
                          setLinkSel((prev) => ({ ...prev, [aff.userId]: e.target.value }))
                        }
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-60"
                      >
                        <option value="">Select an LS affiliate…</option>
                        {available.map((l) => (
                          <option key={l.id} value={l.id}>
                            {(l.name ?? l.email ?? l.id)} · {l.status}
                            {l.emailMatchesUserId === aff.userId ? " · email match" : ""} · {l.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => onLink(aff)}
                      disabled={working || !selected}
                      className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {working ? "Linking…" : "Link"}
                    </button>
                  </div>

                  {available.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      No unlinked Lemon Squeezy affiliates found in the store yet. They may still be
                      pending review on LS&apos;s side, which we can&apos;t speed up.
                    </p>
                  ) : null}

                  {state.kind === "success" ? (
                    <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {state.message}
                    </p>
                  ) : null}
                  {state.kind === "error" ? (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {state.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value?.trim() || "-"}</p>
    </div>
  );
}

function formatSocials(socials: SocialHandles | null): string | null {
  if (!socials) return null;
  const entries = Object.entries(socials).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}
