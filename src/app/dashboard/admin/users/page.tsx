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

type Pricing = {
  planLabel: string | null;
  listCents: number | null;
  netCents: number | null;
  appliedCode: string | null;
  discountCents: number | null;
  alreadyDiscounted: boolean;
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
  pricing?: Pricing | null;
  error?: string;
};

type UserNote = {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string | null;
};

// One row of the browsable directory (from /api/admin/users/list). Kept lean:
// the full per-user detail still comes from the lookup tab.
type DirectoryRow = {
  kind: "account" | "lead";
  userId?: string;
  email: string;
  name: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  isAffiliate: boolean;
  affiliateCode: string | null;
  country: string | null;
  hasProfile: boolean;
  subStatus: string | null;
  planName: string | null;
  endsAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelFeedback: string | null;
  leadSource: string | null;
};

type DirectoryResult = {
  users: DirectoryRow[];
  counts: {
    total: number;
    accounts: number;
    leads: number;
    byStatus: Record<string, number>;
  };
  truncated: boolean;
};

// Client-side filter chips. Each predicate runs over a directory row; matching
// the affiliates roster pattern (ROSTER_FILTERS + filteredRoster useMemo).
const DIRECTORY_FILTERS: { key: string; label: string; match: (r: DirectoryRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "active", label: "Active", match: (r) => r.subStatus === "active" },
  { key: "trial", label: "Trial", match: (r) => r.subStatus === "on_trial" },
  {
    key: "cancelled",
    label: "Cancelled",
    match: (r) => r.subStatus === "cancelled" || r.subStatus === "canceled",
  },
  { key: "past_due", label: "Past due", match: (r) => r.subStatus === "past_due" },
  { key: "paused", label: "Paused", match: (r) => r.subStatus === "paused" },
  {
    key: "none",
    label: "No subscription",
    match: (r) => r.kind === "account" && !r.subStatus,
  },
  { key: "lead", label: "Leads (no account)", match: (r) => r.kind === "lead" },
];

type DirectorySort = "newest" | "cancelled" | "email";

// Most recent cancellation first uses the cancel timestamp, falling back to the
// access-ends date so cancelled rows without a logged reason still sort sensibly.
function cancelSortKey(r: DirectoryRow): string {
  return r.cancelledAt ?? r.endsAt ?? "";
}

// Guardrail for price-lowering actions on a referred customer: reducing their
// price shrinks the referring affiliate's commission (commission is 30% of the
// net actually charged), and discounts do not stack. Returns true when there is
// no affiliate to protect, or the operator confirms.
function affiliateImpactOk(referral: Referral | null | undefined): boolean {
  if (!referral) return true;
  const who =
    referral.affiliateName || referral.affiliateEmail || referral.code || "an affiliate";
  return window.confirm(
    `This customer was referred by ${who}. Reducing their price reduces that affiliate's commission, and discounts do not stack. If you honor a deeper discount, use the make-whole tool to compensate the affiliate. Continue?`,
  );
}

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

  // Per-user internal note log. Loaded separately from the lookup (gated by its
  // own permission) so note content never reaches users.view-only operators.
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  // Directory tab state.
  const [tab, setTab] = useState<"directory" | "lookup">("directory");
  const [directory, setDirectory] = useState<DirectoryResult | null>(null);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);
  const [dirSearch, setDirSearch] = useState("");
  const [dirFilter, setDirFilter] = useState("all");
  const [dirSort, setDirSort] = useState<DirectorySort>("newest");

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

  // Load the directory once we know the operator is allowed in.
  useEffect(() => {
    if (!whoLoaded || forbidden) return;
    let cancelled = false;
    (async () => {
      setDirLoading(true);
      setDirError(null);
      try {
        const res = await fetch("/api/admin/users/list", { cache: "no-store" });
        const json = (await res.json()) as DirectoryResult & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setDirError(json.error ?? `Failed to load users (${res.status})`);
          return;
        }
        setDirectory(json);
      } catch {
        if (!cancelled) setDirError("Network error loading users.");
      } finally {
        if (!cancelled) setDirLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whoLoaded, forbidden]);

  const lookup = async (targetEmail?: string) => {
    const q = (targetEmail ?? email).trim();
    if (!q) return;
    if (targetEmail && targetEmail !== email) setEmail(targetEmail);
    setBusy(true);
    setMsg(null);
    setImpersonateLink(null);
    try {
      const res = await fetch("/api/admin/users/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: q }),
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

  // Load the note log for the currently looked-up user. Separate from lookup so
  // it is gated by users.notes.view and can refresh on its own after add/delete.
  const loadNotes = useCallback(
    async (userId: string) => {
      setNotesLoading(true);
      try {
        const res = await fetch(`/api/admin/users/notes?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { notes?: UserNote[] };
        setNotes(res.ok ? json.notes ?? [] : []);
      } catch {
        setNotes([]);
      } finally {
        setNotesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const userId = result?.found ? result.userId : null;
    if (userId && can("users.notes.view")) {
      void loadNotes(userId);
    } else {
      setNotes([]);
    }
    setNoteDraft("");
  }, [result?.userId, result?.found, can, loadNotes]);

  const addNote = async () => {
    const userId = result?.userId;
    const body = noteDraft.trim();
    if (!userId || !body) return;
    setNoteBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, body }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? `Failed to save note (${res.status})`);
        return;
      }
      setNoteDraft("");
      await loadNotes(userId);
    } catch {
      setMsg("Network error saving note.");
    } finally {
      setNoteBusy(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    const userId = result?.userId;
    if (!userId) return;
    try {
      const res = await fetch("/api/admin/users/notes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? `Failed to delete note (${res.status})`);
        return;
      }
      await loadNotes(userId);
    } catch {
      setMsg("Network error deleting note.");
    }
  };

  // Filter + sort the directory client-side (mirrors the affiliates roster).
  const filteredDirectory = useMemo(() => {
    const rows = directory?.users ?? [];
    const q = dirSearch.trim().toLowerCase();
    const predicate =
      DIRECTORY_FILTERS.find((f) => f.key === dirFilter)?.match ?? (() => true);
    const filtered = rows.filter((r) => {
      if (!predicate(r)) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.affiliateCode ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered];
    if (dirSort === "email") {
      sorted.sort((a, b) => a.email.localeCompare(b.email));
    } else if (dirSort === "cancelled") {
      sorted.sort((a, b) => cancelSortKey(b).localeCompare(cancelSortKey(a)));
    } else {
      // newest by account/lead creation date
      sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }
    return sorted;
  }, [directory, dirSearch, dirFilter, dirSort]);

  // Open a directory row in the Lookup tab, prefilled and fetched.
  const openInLookup = useCallback(
    (row: DirectoryRow) => {
      if (!row.userId) return; // lead rows have no account to look up
      setTab("lookup");
      void lookup(row.email);
    },
    // lookup is stable enough for this handler; email state is read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const header = useMemo(
    () => (
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Users
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-600">
          Browse everyone (accounts and email-only leads), filter by cancellation and status, and open any user to run support actions.
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

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "directory", label: "Directory" },
          { key: "lookup", label: "Lookup" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-[#f97316] text-[#f97316]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "directory" ? (
        <DirectorySection
          directory={directory}
          loading={dirLoading}
          error={dirError}
          search={dirSearch}
          setSearch={setDirSearch}
          filter={dirFilter}
          setFilter={setDirFilter}
          sort={dirSort}
          setSort={setDirSort}
          rows={filteredDirectory}
          onOpen={openInLookup}
        />
      ) : null}

      {tab === "lookup" ? (
      <>
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
          onClick={() => void lookup()}
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

            {/* Pricing + discount insight: shows the list price, any discount
                already redeemed, and a no-stacking warning so an operator does
                not grant a second discount (or silently cut an affiliate's
                commission) without knowing. */}
            {result.pricing && (result.pricing.listCents != null || result.pricing.alreadyDiscounted) ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  result.pricing.alreadyDiscounted
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{result.pricing.planLabel ?? "Plan"}</span>
                  {result.pricing.listCents != null ? (
                    <span>List {fmtMoney(result.pricing.listCents, "USD")}</span>
                  ) : null}
                  {result.pricing.netCents != null ? (
                    <span>: last charge {fmtMoney(result.pricing.netCents, "USD")}</span>
                  ) : null}
                  {result.pricing.appliedCode ? (
                    <span>
                      : code <span className="font-mono">{result.pricing.appliedCode}</span>
                      {result.pricing.discountCents != null
                        ? ` (-${fmtMoney(result.pricing.discountCents, "USD")})`
                        : ""}
                    </span>
                  ) : null}
                </div>
                {result.pricing.alreadyDiscounted ? (
                  <p className="mt-1 text-xs">
                    Already discounted or referred. Discounts do not stack (one per account).
                    Confirm the exact rate in Lemon Squeezy before granting another, and use the
                    make-whole tool if you lower a referred customer&apos;s price.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Account actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/dashboard/admin/emails?recipient=${encodeURIComponent(result.profile?.email ?? "")}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Email history
              </a>
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

          {/* Notes: an internal, timestamped note log for this account. */}
          {can("users.notes.view") ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
              <p className="mt-1 text-xs text-slate-500">
                Internal only. Record why a decision was made on this account (never shown to the user).
              </p>

              {can("users.notes.edit") ? (
                <div className="mt-3">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={2}
                    placeholder="e.g. Cancelled Pro Solo Monthly, gave a year of Pro Trio comp. Owe Kay (KAY) the make-whole."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void addNote()}
                      disabled={noteBusy || !noteDraft.trim()}
                      className="rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {noteBusy ? "Saving…" : "Add note"}
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="mt-4 space-y-2">
                {notesLoading ? (
                  <li className="text-sm text-slate-500">Loading notes…</li>
                ) : notes.length === 0 ? (
                  <li className="text-sm text-slate-500">No notes yet.</li>
                ) : (
                  notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap break-words text-slate-800">{n.body}</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span>
                          {n.created_by ?? "unknown"} · {fmtDate(n.created_at)}
                        </span>
                        {can("users.notes.edit") ? (
                          <button
                            type="button"
                            onClick={() => void deleteNote(n.id)}
                            className="text-red-500 hover:text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : null}

          {/* Subscriptions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Subscriptions</h2>

            {/* Comp make-whole nudge: a referred customer on a comp means their
                affiliate stops earning. Point the operator at the tool to make
                the affiliate whole for the comp period. */}
            {result.referral &&
            (result.subscriptions ?? []).some((s) => (s.ls_subscription_id ?? "").startsWith("comp:")) ? (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p>
                  This referred customer is on a comp, so their affiliate
                  {result.referral.affiliateName ? ` (${result.referral.affiliateName})` : ""} stops
                  earning commission. Record a comp make-whole to keep them whole for the comp period.
                </p>
                <a
                  href={`/dashboard/admin/affiliates?tab=credit&customer=${encodeURIComponent(
                    result.profile?.email ?? "",
                  )}&code=${encodeURIComponent(result.referral.code ?? "")}`}
                  className="mt-1 inline-block font-semibold underline"
                >
                  Open comp make-whole
                </a>
              </div>
            ) : null}

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
                      {(s.ls_subscription_id ?? "").startsWith("comp:") ? (
                        // In-house comp: nothing lives in Lemon Squeezy, so the LS
                        // guided buttons do not apply. Send the admin to the Comps
                        // page (source of truth) which owns Extend + Cancel now.
                        <a href={`/dashboard/admin/comps?q=${encodeURIComponent(result.profile?.email ?? "")}`} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Manage comp (in-house)</a>
                      ) : (
                        <>
                          {can("billing.cancel") ? (
                            <button type="button" disabled={isSubscriptionInactive(s.status)} onClick={() => { if (window.confirm("Cancel this subscription via Lemon Squeezy?")) void act("/api/admin/billing/cancel", { lsSubscriptionId: s.ls_subscription_id }, "Cancelled."); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">{isSubscriptionInactive(s.status) ? "Cancelled" : "Cancel"}</button>
                          ) : null}
                          {can("billing.comp") ? (
                            <button type="button" onClick={() => { if (!affiliateImpactOk(result.referral)) return; void act("/api/admin/billing/guided", { action: "comp", lsSubscriptionId: s.ls_subscription_id }, "Logged."); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Comp / extend</button>
                          ) : null}
                          {can("billing.plan.edit") ? (
                            <button type="button" onClick={() => { if (!affiliateImpactOk(result.referral)) return; void act("/api/admin/billing/guided", { action: "plan", lsSubscriptionId: s.ls_subscription_id }, "Logged."); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Change plan</button>
                          ) : null}
                        </>
                      )}
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
      </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directory tab: browsable, filterable list of every user + email-only lead.
// ---------------------------------------------------------------------------

function directoryStatusLabel(row: DirectoryRow): string {
  if (row.kind === "lead") return "lead";
  return row.subStatus ?? "no subscription";
}

function DirectorySection({
  directory,
  loading,
  error,
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  rows,
  onOpen,
}: {
  directory: DirectoryResult | null;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  sort: DirectorySort;
  setSort: (v: DirectorySort) => void;
  rows: DirectoryRow[];
  onOpen: (row: DirectoryRow) => void;
}) {
  const counts = directory?.counts;
  const cancelledCount =
    (counts?.byStatus?.cancelled ?? 0) + (counts?.byStatus?.canceled ?? 0);

  return (
    <div className="space-y-4">
      {/* Counts summary */}
      {counts ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>
            <span className="font-semibold text-slate-900">{counts.accounts}</span> accounts
          </span>
          <span>
            <span className="font-semibold text-slate-900">{cancelledCount}</span> cancelled
          </span>
          <span>
            <span className="font-semibold text-slate-900">{counts.leads}</span> leads
          </span>
          {directory?.truncated ? (
            <span className="text-amber-700">
              List capped at {counts.accounts} accounts: refine with search.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Search + sort */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[240px] text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Search email, name or code
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as DirectorySort)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="cancelled">Recently cancelled</option>
            <option value="email">Email (A-Z)</option>
          </select>
        </label>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {DIRECTORY_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.key
                ? "border-[#f97316] bg-[#f97316] text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Cancelled</th>
                <th className="px-3 py-2 font-semibold">Affiliate</th>
                <th className="px-3 py-2 font-semibold">Joined</th>
                <th className="px-3 py-2 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No users match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const clickable = Boolean(r.userId);
                  return (
                    <tr
                      key={r.userId ?? `lead:${r.email}`}
                      onClick={() => onOpen(r)}
                      className={`border-b border-slate-100 last:border-0 ${
                        clickable ? "cursor-pointer hover:bg-slate-50" : "opacity-90"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{r.email}</span>
                          {r.kind === "lead" ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              lead
                            </span>
                          ) : !r.hasProfile ? (
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                              magic-link only
                            </span>
                          ) : null}
                        </div>
                        {r.name ? (
                          <div className="text-xs text-slate-500">{r.name}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${statusBadgeClass(
                            r.subStatus,
                          )}`}
                        >
                          {directoryStatusLabel(r)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.planName ?? (r.leadSource ? `via ${r.leadSource}` : "-")}
                      </td>
                      <td className="px-3 py-2">
                        {r.cancelledAt || r.endsAt ? (
                          <div>
                            <div className="text-slate-700">
                              {r.endsAt ? `ends ${fmtDate(r.endsAt)}` : fmtDate(r.cancelledAt)}
                            </div>
                            {r.cancelReason ? (
                              <div
                                className="max-w-[220px] truncate text-xs text-slate-500"
                                title={
                                  r.cancelFeedback
                                    ? `${r.cancelReason}: ${r.cancelFeedback}`
                                    : r.cancelReason
                                }
                              >
                                {r.cancelReason}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.isAffiliate ? r.affiliateCode ?? "yes" : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(r.lastSignInAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
