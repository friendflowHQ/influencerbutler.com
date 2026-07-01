"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type CodeHealthStatus =
  | "ok"
  | "missing-code"
  | "missing-discount-id"
  | "discount-not-in-ls";

type UnhealthyCode = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  health: CodeHealthStatus;
};

type ReconcileResponse = {
  admin?: { email: string };
  stuck?: StuckAffiliate[];
  lsAffiliates?: LsAffiliate[];
  unhealthyCodes?: UnhealthyCode[];
  error?: string;
};

type OwedOrder = {
  lsOrderId: string;
  totalCents: number;
  currency: string | null;
  createdAt: string | null;
};

type OwedAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  lsAffiliateId: string;
  orderCount: number;
  grossCents: number;
  owedCents: number;
  orders: OwedOrder[];
};

type OwedResponse = {
  admin?: { email: string };
  commissionPercent?: number;
  verifyAgainstLs?: boolean;
  affiliates?: OwedAffiliate[];
  error?: string;
};

type RosterAppStatus = "pending" | "approved" | "rejected" | "none";

type RosterRow = {
  userId: string;
  name: string | null;
  email: string | null;
  affiliateCode: string | null;
  appStatus: RosterAppStatus;
  isAffiliate: boolean;
  lsLinked: boolean;
  lsStatus: string | null;
  totalEarningsCents: number | null;
  paidCents: number | null;
  unpaidEarningsCents: number | null;
  appliedAt: string | null;
  reviewedAt: string | null;
};

type RosterResponse = {
  admin?: { email: string };
  lsAvailable?: boolean;
  affiliates?: RosterRow[];
  error?: string;
};

type TabKey = "roster" | "applications" | "reconcile" | "owed";

type RosterFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "linked"
  | "unlinked";

const ROSTER_FILTERS: { key: RosterFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "linked", label: "Linked" },
  { key: "unlinked", label: "Unlinked" },
];

const CODE_HEALTH_LABEL: Record<CodeHealthStatus, string> = {
  ok: "OK",
  "missing-code": "No branded code was ever created",
  "missing-discount-id": "Code exists locally but no LS discount id is stored",
  "discount-not-in-ls": "Stored discount no longer exists in Lemon Squeezy",
};

function formatCents(cents: number, currency: string | null): string {
  const amount = (cents / 100).toFixed(2);
  return currency ? `${amount} ${currency}` : `$${amount}`;
}

function formatUsd(cents: number | null): string {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

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

function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState<TabKey>("roster");

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingApplication[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Roster (all affiliates) state.
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLsAvailable, setRosterLsAvailable] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RosterFilter>("all");

  // Reconciliation (manual LS linking) state.
  const [stuck, setStuck] = useState<StuckAffiliate[]>([]);
  const [lsAffiliates, setLsAffiliates] = useState<LsAffiliate[]>([]);
  const [unhealthy, setUnhealthy] = useState<UnhealthyCode[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(true);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [linkSel, setLinkSel] = useState<Record<string, string>>({});
  const [linkRow, setLinkRow] = useState<Record<string, LinkRowState>>({});
  const [codeRow, setCodeRow] = useState<Record<string, LinkRowState>>({});

  // Owed-commissions (pre-activation gap reconciliation) state.
  const [owed, setOwed] = useState<OwedAffiliate[]>([]);
  const [commissionPercent, setCommissionPercent] = useState(30);
  const [owedLoading, setOwedLoading] = useState(true);
  const [owedError, setOwedError] = useState<string | null>(null);
  const [owedRow, setOwedRow] = useState<Record<string, LinkRowState>>({});

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

  const loadRoster = useCallback(async () => {
    setRosterLoading(true);
    setRosterError(null);
    try {
      const res = await fetch("/api/affiliates/admin-roster", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as RosterResponse;
      if (!res.ok) {
        setRosterError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setRoster(json.affiliates ?? []);
      setRosterLsAvailable(json.lsAvailable !== false);
      if (json.admin?.email) setAdminEmail(json.admin.email);
    } catch (err) {
      console.error(err);
      setRosterError("Network error loading the roster.");
    } finally {
      setRosterLoading(false);
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
      setUnhealthy(json.unhealthyCodes ?? []);
    } catch (err) {
      console.error(err);
      setReconcileError("Network error loading linking data.");
    } finally {
      setReconcileLoading(false);
    }
  }, []);

  const loadOwed = useCallback(async () => {
    setOwedLoading(true);
    setOwedError(null);
    try {
      const res = await fetch("/api/affiliates/admin-owed", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as OwedResponse;
      if (!res.ok) {
        setOwedError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setOwed(json.affiliates ?? []);
      if (typeof json.commissionPercent === "number") {
        setCommissionPercent(json.commissionPercent);
      }
    } catch (err) {
      console.error(err);
      setOwedError("Network error loading owed commissions.");
    } finally {
      setOwedLoading(false);
    }
  }, []);

  // Roster + applications load eagerly (applications powers the tab badge and is
  // a cheap DB read). Reconcile and owed each hit Lemon Squeezy, so they load
  // lazily the first time their tab is opened.
  useEffect(() => {
    void load();
    void loadRoster();
  }, [load, loadRoster]);

  const reconcileLoaded = useRef(false);
  const owedLoaded = useRef(false);
  useEffect(() => {
    if (tab === "reconcile" && !reconcileLoaded.current) {
      reconcileLoaded.current = true;
      void loadReconcile();
    }
    if (tab === "owed" && !owedLoaded.current) {
      owedLoaded.current = true;
      void loadOwed();
    }
  }, [tab, loadReconcile, loadOwed]);

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
        void loadRoster();
      }, 1500);
    } catch (err) {
      console.error(err);
      setLink(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  const setCode = (userId: string, state: LinkRowState) =>
    setCodeRow((prev) => ({ ...prev, [userId]: state }));

  const setOwedState = (userId: string, state: LinkRowState) =>
    setOwedRow((prev) => ({ ...prev, [userId]: state }));

  const onRegenerate = async (uc: UnhealthyCode) => {
    if (
      !window.confirm(
        `Recreate the branded discount code for ${uc.fullName ?? uc.email ?? uc.userId}?\n\nThis creates a fresh discount in Lemon Squeezy and stores it on their profile. The code string may change (e.g. ALEX -> ALEX2).`,
      )
    ) {
      return;
    }
    setCode(uc.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-regenerate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uc.userId }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setCode(uc.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setCode(uc.userId, { kind: "success", message: `Created code ${json.code}.` });
      setTimeout(() => {
        void loadReconcile();
        void loadRoster();
      }, 1500);
    } catch (err) {
      console.error(err);
      setCode(uc.userId, { kind: "error", message: "Network error." });
    }
  };

  const onMarkPaid = async (aff: OwedAffiliate) => {
    if (
      !window.confirm(
        `Mark ${formatCents(aff.owedCents, aff.orders[0]?.currency ?? null)} as paid to ${aff.fullName ?? aff.email ?? aff.userId}?\n\nDo this ONLY after you have issued the bonus in the Lemon Squeezy dashboard. Sanity-check these ${aff.orderCount} orders against LS first - an older or partial refund may not be reflected here. This stamps the orders reconciled so they drop off the report.`,
      )
    ) {
      return;
    }
    setOwedState(aff.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-owed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: aff.userId,
          orderIds: aff.orders.map((o) => o.lsOrderId),
          amountCents: aff.owedCents,
        }),
      });
      const json = (await res.json()) as { error?: string; reconciledCount?: number };
      if (!res.ok) {
        setOwedState(aff.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setOwedState(aff.userId, {
        kind: "success",
        message: `Marked ${json.reconciledCount ?? 0} orders reconciled.`,
      });
      setTimeout(() => {
        void loadOwed();
      }, 1500);
    } catch (err) {
      console.error(err);
      setOwedState(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  // Approve/reject work off a user id + display label so they can be triggered
  // from either the Applications cards or the Roster table.
  const approveUser = async (userId: string, label: string) => {
    if (
      !window.confirm(
        `Approve ${label}?\n\nThis approves the application, creates their branded discount code in Lemon Squeezy, and emails them with instructions to finalize setup at LS's affiliate portal.`,
      )
    ) {
      return;
    }
    setRow(userId, { kind: "working", action: "approve" });
    try {
      const res = await fetch("/api/affiliates/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = (await res.json()) as {
        error?: string;
        lsAffiliateId?: string | null;
        emailSent?: boolean;
        brandedCode?: string | null;
      };
      if (!res.ok) {
        setRow(userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
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
      setRow(userId, { kind: "success", message: parts.join(" ") });
      setTimeout(() => {
        void load();
        void loadRoster();
      }, 1500);
    } catch (err) {
      console.error(err);
      setRow(userId, { kind: "error", message: "Network error." });
    }
  };

  const rejectUser = async (userId: string, label: string) => {
    const reason = window.prompt(`Reject ${label}? (Optional reason)`, "");
    if (reason === null) return;
    setRow(userId, { kind: "working", action: "reject" });
    try {
      const res = await fetch("/api/affiliates/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRow(userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setRow(userId, { kind: "success", message: "Rejected." });
      setTimeout(() => {
        void load();
        void loadRoster();
      }, 1000);
    } catch (err) {
      console.error(err);
      setRow(userId, { kind: "error", message: "Network error." });
    }
  };

  const onApprove = (app: PendingApplication) =>
    approveUser(app.user_id, `${app.full_name} (${app.email})`);
  const onReject = (app: PendingApplication) => rejectUser(app.user_id, app.full_name);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((r) => {
      if (statusFilter === "pending" && r.appStatus !== "pending") return false;
      if (statusFilter === "approved" && r.appStatus !== "approved") return false;
      if (statusFilter === "rejected" && r.appStatus !== "rejected") return false;
      if (statusFilter === "linked" && !r.lsLinked) return false;
      if (statusFilter === "unlinked" && r.lsLinked) return false;
      if (!q) return true;
      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.affiliateCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [roster, search, statusFilter]);

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Affiliates
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Affiliate dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {adminEmail ? `Signed in as ${adminEmail}. ` : null}
          Review the roster, approve applications, link Lemon Squeezy accounts, and back-pay
          gap-window commissions from one place.
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

  const tabs: { key: TabKey; label: string; count: number | null }[] = [
    { key: "roster", label: "Roster", count: roster.length || null },
    { key: "applications", label: "Applications", count: pending.length || null },
    { key: "reconcile", label: "Reconcile", count: null },
    { key: "owed", label: "Owed", count: null },
  ];

  return (
    <div className="space-y-6">
      {header}

      <nav className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[#f97316] text-[#f97316]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {t.count !== null ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    active ? "bg-orange-100 text-[#c2410c]" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {tab === "roster" ? (
        <RosterTab
          loading={rosterLoading}
          error={rosterError}
          lsAvailable={rosterLsAvailable}
          rows={filteredRoster}
          totalCount={roster.length}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          rowState={rowState}
          onApprove={(r) => approveUser(r.userId, `${r.name ?? r.email ?? r.userId}`)}
          onReject={(r) => rejectUser(r.userId, r.name ?? r.email ?? r.userId)}
        />
      ) : null}

      {tab === "applications" ? (
        loading ? (
          <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ) : fetchError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {fetchError}
          </div>
        ) : pending.length === 0 ? (
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
        )
      ) : null}

      {tab === "reconcile" ? (
        <div className="space-y-10">
          <section className="space-y-4">
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

          <section className="space-y-4 border-t border-slate-200 pt-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
                Admin · Code health
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                Affiliates with a broken branded code
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Branded-code creation at approval is non-fatal, so an affiliate can end up with no
                working code in Lemon Squeezy. These need a fresh code before they promote.
              </p>
            </div>

            {reconcileLoading ? (
              <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ) : unhealthy.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                Every affiliate&apos;s branded code checks out. ✨
              </div>
            ) : (
              <ul className="space-y-4">
                {unhealthy.map((uc) => {
                  const state = codeRow[uc.userId] ?? { kind: "idle" };
                  const working = state.kind === "working";
                  return (
                    <li
                      key={uc.userId}
                      className="rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-slate-900 break-words">
                            {uc.fullName ?? "(no name)"}
                          </p>
                          <p className="text-sm text-slate-600 break-all">{uc.email ?? "(no email)"}</p>
                          <p className="mt-1 text-xs text-red-700">
                            {uc.affiliateCode ? `Code ${uc.affiliateCode}: ` : ""}
                            {CODE_HEALTH_LABEL[uc.health]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRegenerate(uc)}
                          disabled={working}
                          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                        >
                          {working ? "Creating…" : "Regenerate code"}
                        </button>
                      </div>

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
      ) : null}

      {tab === "owed" ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
              Admin · Owed commissions
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Back-pay referrals from the pre-activation gap
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Orders referred with an affiliate&apos;s code BEFORE Lemon Squeezy activated them earn no
              commission in LS (LS can&apos;t back-date one). They are captured here at{" "}
              {commissionPercent}% of order value once the affiliate is linked. Pay each owed amount as
              a one-time bonus in the Lemon Squeezy dashboard, then click &quot;Mark paid&quot; so it
              drops off this list. Refunds are tracked, but sanity-check against LS first: an older
              refund or a partial refund may not be reflected here.
            </p>
          </div>

          {owedLoading ? (
            <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ) : owedError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {owedError}
            </div>
          ) : owed.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              No owed gap-window commissions. ✨
            </div>
          ) : (
            <ul className="space-y-4">
              {owed.map((aff) => {
                const state = owedRow[aff.userId] ?? { kind: "idle" };
                const working = state.kind === "working";
                const currency = aff.orders[0]?.currency ?? null;
                return (
                  <li
                    key={aff.userId}
                    className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900 break-words">
                          {aff.fullName ?? "(no name)"}
                        </p>
                        <p className="text-sm text-slate-600 break-all">{aff.email ?? "(no email)"}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {aff.affiliateCode ? `Code ${aff.affiliateCode} · ` : ""}
                          {aff.orderCount} order{aff.orderCount === 1 ? "" : "s"} ·{" "}
                          {formatCents(aff.grossCents, currency)} gross · user_id{" "}
                          {aff.userId.slice(0, 8)}…
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="text-lg font-bold text-indigo-700">
                          {formatCents(aff.owedCents, currency)} owed
                        </p>
                        <button
                          type="button"
                          onClick={() => onMarkPaid(aff)}
                          disabled={working}
                          className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                        >
                          {working ? "Saving…" : "Mark paid"}
                        </button>
                      </div>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700">
                        {aff.orderCount} captured order{aff.orderCount === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-2 space-y-1 rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                        {aff.orders.map((o) => (
                          <li key={o.lsOrderId} className="flex flex-wrap justify-between gap-2">
                            <span className="break-all">Order {o.lsOrderId}</span>
                            <span>
                              {formatCents(o.totalCents, o.currency)}
                              {o.createdAt ? ` · ${formatDate(o.createdAt)}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
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
        </section>
      ) : null}
    </div>
  );
}

function RosterTab({
  loading,
  error,
  lsAvailable,
  rows,
  totalCount,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  rowState,
  onApprove,
  onReject,
}: {
  loading: boolean;
  error: string | null;
  lsAvailable: boolean;
  rows: RosterRow[];
  totalCount: number;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: RosterFilter;
  setStatusFilter: (value: RosterFilter) => void;
  rowState: Record<string, RowState>;
  onApprove: (row: RosterRow) => void;
  onReject: (row: RosterRow) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or code…"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {ROSTER_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {!lsAvailable && !loading ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Lemon Squeezy earnings are unavailable right now, so money columns show &quot;-&quot;.
          Everything else is up to date.
        </div>
      ) : null}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No affiliates yet.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No affiliates match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Affiliate</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total earned</th>
                <th className="px-4 py-3 text-right">Paid out</th>
                <th className="px-4 py-3 text-right">Owed</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const state = rowState[r.userId] ?? { kind: "idle" };
                const working = state.kind === "working";
                return (
                  <tr key={r.userId} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 break-words">
                        {r.name ?? "(no name)"}
                      </p>
                      <p className="text-xs text-slate-500 break-all">{r.email ?? "(no email)"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.affiliateCode ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                          {r.affiliateCode}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadges row={r} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {formatUsd(r.totalEarningsCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatUsd(r.paidCents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.unpaidEarningsCents && r.unpaidEarningsCents > 0 ? (
                        <span className="font-medium text-indigo-700">
                          {formatUsd(r.unpaidEarningsCents)}
                        </span>
                      ) : (
                        <span className="text-slate-600">{formatUsd(r.unpaidEarningsCents)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateShort(r.appliedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {r.appStatus === "pending" ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => onApprove(r)}
                              disabled={working}
                              className="rounded-md bg-[#f97316] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                            >
                              {state.kind === "working" && state.action === "approve"
                                ? "…"
                                : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onReject(r)}
                              disabled={working}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                            >
                              {state.kind === "working" && state.action === "reject"
                                ? "…"
                                : "Reject"}
                            </button>
                          </div>
                          {state.kind === "success" ? (
                            <span className="text-xs text-emerald-700">{state.message}</span>
                          ) : null}
                          {state.kind === "error" ? (
                            <span className="text-xs text-red-700">{state.message}</span>
                          ) : null}
                        </div>
                      ) : state.kind === "success" ? (
                        <span className="text-xs text-emerald-700">{state.message}</span>
                      ) : state.kind === "error" ? (
                        <span className="text-xs text-red-700">{state.message}</span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Paid out is derived as total earned minus unpaid balance from Lemon Squeezy. LS does not
        expose an exact last-payout date, so amounts are shown instead of a date.
      </p>
    </div>
  );
}

function StatusBadges({ row }: { row: RosterRow }) {
  const badges: { label: string; className: string }[] = [];

  if (row.appStatus === "pending") {
    badges.push({ label: "Pending", className: "bg-amber-100 text-amber-800" });
  } else if (row.appStatus === "approved") {
    badges.push({ label: "Approved", className: "bg-emerald-100 text-emerald-800" });
  } else if (row.appStatus === "rejected") {
    badges.push({ label: "Rejected", className: "bg-red-100 text-red-800" });
  } else if (row.isAffiliate) {
    badges.push({ label: "Affiliate", className: "bg-emerald-100 text-emerald-800" });
  }

  if (row.appStatus !== "rejected") {
    if (row.lsLinked) {
      const active = (row.lsStatus ?? "").toLowerCase() === "active";
      badges.push({
        label: active ? "LS active" : `LS ${row.lsStatus ?? "linked"}`,
        className: active ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600",
      });
    } else if (row.appStatus === "approved" || row.isAffiliate) {
      badges.push({ label: "Not linked", className: "bg-amber-100 text-amber-800" });
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.className}`}
        >
          {b.label}
        </span>
      ))}
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
