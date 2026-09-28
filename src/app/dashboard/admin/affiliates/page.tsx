"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MonthlyEarningsChart, { type MonthlyBucket } from "./MonthlyEarningsChart";
import CreditReferralTab, { type AffiliateOption } from "./CreditReferralTab";
import TaxTasksBanner from "./TaxTasksBanner";

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
  payableCents?: number;
  clearingCents?: number;
  orders: OwedOrder[];
};

type OwedResponse = {
  admin?: { email: string };
  commissionPercent?: number;
  verifyAgainstLs?: boolean;
  affiliates?: OwedAffiliate[];
  error?: string;
};

// Attribution gap: referred conversions whose ORDER was never attributed, so the
// affiliate is owed but the Owed tab cannot see it until the order is stamped.
type GapAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  ratePercent: number;
  orderCount: number;
  grossCents: number;
  owedCents: number;
  orders: OwedOrder[];
};

type GapResponse = {
  admin?: { email: string };
  verifyBeforePaying?: boolean;
  affiliates?: GapAffiliate[];
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
  commissionPercent: number | null;
  commissionDurationMonths: number | null;
  affiliateCompMonthlyQuota: number | null;
  lsActivatedAt: string | null;
  subscriptionStatus: string | null;
  subscriptionActive: boolean;
};

type RosterResponse = {
  admin?: { email: string };
  lsAvailable?: boolean;
  affiliates?: RosterRow[];
  error?: string;
};

type TabKey =
  | "roster"
  | "applications"
  | "reconcile"
  | "credit"
  | "owed"
  | "payouts"
  | "analytics";

type AffiliateMonthly = {
  userId: string;
  fullName: string | null;
  email: string | null;
  affiliateCode: string | null;
  ratePercent: number;
  months: MonthlyBucket[];
};

type EarningsResponse = {
  admin?: { email: string };
  months?: string[];
  totals?: MonthlyBucket[];
  byAffiliate?: AffiliateMonthly[];
  lsTotalEarningsCents?: number | null;
  error?: string;
};

type PayoutLine = {
  lsOrderId: string;
  createdAt: string | null;
  currency: string | null;
  totalCents: number;
  lsPaidCents: number;
  owedCents: number;
  attributionStatus: string | null;
};

type PayoutAffiliate = {
  userId: string;
  email: string | null;
  fullName: string | null;
  affiliateCode: string | null;
  lsAffiliateId: string | null;
  ratePercent: number;
  durationMonths: number | null;
  orderCount: number;
  grossCents: number;
  lsPaidCents: number;
  owedCents: number;
  lines: PayoutLine[];
  ls: { totalEarningsCents: number; unpaidEarningsCents: number } | null;
};

type PayoutsResponse = {
  admin?: { email: string };
  period?: string;
  lsAvailable?: boolean;
  affiliates?: PayoutAffiliate[];
  error?: string;
};

type RosterFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "linked"
  | "unlinked"
  | "sub-active"
  | "sub-inactive";

const ROSTER_FILTERS: { key: RosterFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "linked", label: "Linked" },
  { key: "unlinked", label: "Unlinked" },
  { key: "sub-active", label: "Active sub" },
  { key: "sub-inactive", label: "No sub" },
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

// PayPal goods-and-services fee (US commercial): ~2.99% of the amount received.
// To have the recipient NET `cents`, the sender pads the payment to
// cents / (1 - rate). This is ONLY for MANUAL PayPal sends: the automated
// Payouts API (the "Disburse via PayPal" button) charges the sender a separate
// capped fee and the recipient already gets the full amount, so never gross up
// there.
const PAYPAL_GS_FEE_RATE = 0.0299;
function grossUpForPayPalGs(cents: number): number {
  if (cents <= 0) return 0;
  return Math.round(cents / (1 - PAYPAL_GS_FEE_RATE));
}

// The affiliate's shareable link: the branded code auto-applies at checkout and
// attributes the referral. Mirrors brandedShareLink in the affiliate dashboard -
// a clean homepage URL (no "/pricing"); the ?code= is captured on the homepage
// by /js/affiliate-touch.js.
const AFFILIATE_SHARE_ORIGIN = "https://www.influencerbutler.com";
function affiliateShareLink(code: string): string {
  return `${AFFILIATE_SHARE_ORIGIN}/?code=${encodeURIComponent(code)}`;
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

const TAB_KEYS: TabKey[] = [
  "roster",
  "applications",
  "reconcile",
  "credit",
  "owed",
  "payouts",
  "analytics",
];

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState<TabKey>("roster");
  // Deep-link prefill: the Users page links here as ?tab=credit&customer=&code=
  // to jump straight to the comp make-whole tool with the customer + affiliate
  // filled in. Read once on mount from the URL (no useSearchParams -> no Suspense
  // boundary needed for this client page).
  const [creditCustomer, setCreditCustomer] = useState<string | undefined>(undefined);
  const [creditCode, setCreditCode] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t && (TAB_KEYS as string[]).includes(t)) setTab(t as TabKey);
      setCreditCustomer(params.get("customer") ?? undefined);
      setCreditCode(params.get("code") ?? undefined);
    } catch {
      // no-op: URL parsing is best-effort prefill only.
    }
  }, []);

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

  // Code-health state: affiliates whose branded discount code needs regenerating.
  const [unhealthy, setUnhealthy] = useState<UnhealthyCode[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(true);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [codeRow, setCodeRow] = useState<Record<string, LinkRowState>>({});

  // Owed-commissions (pre-activation gap reconciliation) state.
  const [owed, setOwed] = useState<OwedAffiliate[]>([]);
  const [commissionPercent, setCommissionPercent] = useState(30);
  const [owedLoading, setOwedLoading] = useState(true);
  const [owedError, setOwedError] = useState<string | null>(null);
  const [owedRow, setOwedRow] = useState<Record<string, LinkRowState>>({});

  // Attribution-gap state (referred conversions whose orders were never stamped).
  const [gap, setGap] = useState<GapAffiliate[]>([]);
  const [gapLoading, setGapLoading] = useState(true);
  const [gapError, setGapError] = useState<string | null>(null);
  const [gapRow, setGapRow] = useState<Record<string, LinkRowState>>({});
  const [gapAllState, setGapAllState] = useState<LinkRowState>({ kind: "idle" });

  // Auto-pay arming toggle (stored server-side in app_config; env var can force it).
  const [autopayArmed, setAutopayArmed] = useState(false);
  const [autopayEnvForced, setAutopayEnvForced] = useState(false);
  const [autopayCapCents, setAutopayCapCents] = useState(20000);
  const [autopayLoaded, setAutopayLoaded] = useState(false);
  const [autopaySaving, setAutopaySaving] = useState(false);

  // Per-row state for the roster "Generate new code" action.
  const [genRow, setGenRow] = useState<Record<string, LinkRowState>>({});

  // Per-row state for the roster "Email resources" action (single affiliate).
  const [emailRow, setEmailRow] = useState<Record<string, LinkRowState>>({});

  // One-time "email all affiliates the dashboard + resources guide" action.
  const [broadcast, setBroadcast] = useState<LinkRowState>({ kind: "idle" });

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

  const loadGap = useCallback(async () => {
    setGapLoading(true);
    setGapError(null);
    try {
      const res = await fetch("/api/affiliates/admin-attribution-gap", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as GapResponse;
      if (!res.ok) {
        setGapError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setGap(json.affiliates ?? []);
    } catch (err) {
      console.error(err);
      setGapError("Network error loading the attribution gap.");
    } finally {
      setGapLoading(false);
    }
  }, []);

  const loadAutopayConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliates/admin-autopay-config", { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as {
        armed?: boolean;
        envForced?: boolean;
        capCents?: number;
      };
      if (res.ok) {
        setAutopayArmed(json.armed === true);
        setAutopayEnvForced(json.envForced === true);
        if (typeof json.capCents === "number") setAutopayCapCents(json.capCents);
        setAutopayLoaded(true);
      }
    } catch (err) {
      console.error("autopay config load failed", err);
    }
  }, []);

  const onToggleAutopay = async (next: boolean) => {
    if (autopayEnvForced) return; // locked on by env var
    if (
      next &&
      !window.confirm(
        "Arm auto-pay? On the 1st of each month the system will pay every eligible affiliate (verified tax form + PayPal, over $10) their cleared commission automatically via PayPal. Amounts over the cap still wait for your manual Disburse. You can turn this off anytime.",
      )
    ) {
      return;
    }
    setAutopaySaving(true);
    try {
      const res = await fetch("/api/affiliates/admin-autopay-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ armed: next }),
      });
      const json = (await res.json()) as { armed?: boolean; error?: string };
      if (res.ok) setAutopayArmed(json.armed === true);
      else console.error("autopay toggle failed", json.error);
    } catch (err) {
      console.error("autopay toggle failed", err);
    } finally {
      setAutopaySaving(false);
    }
  };

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
      void loadGap();
      void loadAutopayConfig();
    }
  }, [tab, loadReconcile, loadOwed, loadGap, loadAutopayConfig]);

  const setRow = (userId: string, state: RowState) =>
    setRowState((prev) => ({ ...prev, [userId]: state }));

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

  const setGen = (userId: string, state: LinkRowState) =>
    setGenRow((prev) => ({ ...prev, [userId]: state }));

  // Roster-level "generate a fresh numbered code" (e.g. KAY -> KAY2). Reuses the
  // same generator as approval: the affiliate's first name plus the next unused
  // number. Replacing an existing code means links shared with the OLD code stop
  // attributing, so we warn first.
  const onGenerateCode = async (row: RosterRow) => {
    const label = row.name ?? row.email ?? row.userId;
    const warn = row.affiliateCode
      ? `Generate a new code for ${label}?\n\nThis mints a fresh code (their name plus the next unused number, e.g. ${row.affiliateCode} -> ${row.affiliateCode}2) and replaces their current code ${row.affiliateCode}. Any link already shared with the old code stops tracking.`
      : `Generate a code for ${label}?\n\nThis mints a branded code from their name (plus a number if taken) and unlocks their share link.`;
    if (!window.confirm(warn)) return;
    setGen(row.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-regenerate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setGen(row.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setGen(row.userId, { kind: "success", message: `New code ${json.code}.` });
      setTimeout(() => void loadRoster(), 1500);
    } catch (err) {
      console.error(err);
      setGen(row.userId, { kind: "error", message: "Network error." });
    }
  };

  // Roster-level "set this exact code" (e.g. JACKIE -> AIPTOOLKIT) for
  // affiliates who ask for a specific string instead of their name. Mints the
  // exact code in Lemon Squeezy (no numbered fallback) and retires the old
  // discount, so the same replacement warning applies.
  const onSetCustomCode = async (row: RosterRow) => {
    const label = row.name ?? row.email ?? row.userId;
    const replaceNote = row.affiliateCode
      ? `\n\nThis replaces ${row.affiliateCode}; any link already shared with the old code stops tracking.`
      : "";
    const input = window.prompt(
      `Set a custom code for ${label}.\n\nLetters and numbers only, 2-32 characters (Lemon Squeezy rejects hyphens and spaces).${replaceNote}`,
      row.affiliateCode ?? "",
    );
    if (input === null) return;
    const code = input.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,32}$/.test(code)) {
      setGen(row.userId, {
        kind: "error",
        message: "Codes must be 2-32 letters and numbers only.",
      });
      return;
    }
    if (code === row.affiliateCode) {
      setGen(row.userId, { kind: "error", message: `${code} is already their code.` });
      return;
    }
    setGen(row.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-regenerate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, customCode: code }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setGen(row.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setGen(row.userId, { kind: "success", message: `New code ${json.code}.` });
      setTimeout(() => void loadRoster(), 1500);
    } catch (err) {
      console.error(err);
      setGen(row.userId, { kind: "error", message: "Network error." });
    }
  };

  const setEmail = (userId: string, state: LinkRowState) =>
    setEmailRow((prev) => ({ ...prev, [userId]: state }));

  // Send the dashboard + resources guide to a single affiliate (same content as
  // the roster-wide broadcast, but scoped to one row). Handy for resends or for
  // an affiliate who missed the original.
  const onEmailResources = async (row: RosterRow) => {
    const label = row.name ?? row.email ?? row.userId;
    if (!window.confirm(`Email the dashboard & resources guide to ${label}?`)) return;
    setEmail(row.userId, { kind: "working" });
    try {
      const res = await fetch(
        `/api/affiliates/admin-broadcast-resources?userId=${encodeURIComponent(row.userId)}`,
        { method: "POST" },
      );
      const json = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok || !json.sent) {
        setEmail(row.userId, {
          kind: "error",
          message: json.error ?? (json.failed ? "Send failed." : `Failed (${res.status})`),
        });
        return;
      }
      setEmail(row.userId, { kind: "success", message: "Sent." });
    } catch (err) {
      console.error(err);
      setEmail(row.userId, { kind: "error", message: "Network error." });
    }
  };

  // Record an out-of-band payment (admin already sent money via PayPal's UI, a
  // bank transfer, etc.). Records ONLY the cleared "payable now" slice via the
  // same money-safe reconcile as the PayPal payout, so amortized annual orders
  // stay partially owed and are never double-counted next month.
  const onRecordManualPayout = async (aff: OwedAffiliate) => {
    const payable = aff.payableCents ?? 0;
    const currency = aff.orders[0]?.currency ?? null;
    const payableLabel = formatCents(payable, currency);
    const name = aff.fullName ?? aff.email ?? aff.userId;
    // The prompt doubles as the confirm (Cancel returns null). Default to the
    // exact cleared slice; the admin bumps it to whatever they actually sent so
    // the gross-up (PayPal fee) is booked to Finance. No money is sent.
    const entered = window.prompt(
      `Record a manual payout to ${name}.\n\nThe cleared commission of ${payableLabel} is booked to the affiliate (annual orders keep vesting). Enter the TOTAL you actually sent via PayPal - anything above ${payableLabel} is recorded as a PayPal fee in Finance. The default below already covers the ~2.99% goods-and-services fee. No money is sent now.`,
      (grossUpForPayPalGs(payable) / 100).toFixed(2),
    );
    if (entered === null) return;
    const totalSentCents = Math.round(parseFloat(entered.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(totalSentCents) || totalSentCents <= 0) {
      setOwedState(aff.userId, { kind: "error", message: "Enter a valid dollar amount." });
      return;
    }
    if (totalSentCents < payable) {
      setOwedState(aff.userId, {
        kind: "error",
        message: `That's less than the ${payableLabel} cleared commission. Enter at least ${payableLabel}.`,
      });
      return;
    }
    setOwedState(aff.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-record-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: aff.userId, totalSentCents }),
      });
      const json = (await res.json()) as {
        error?: string;
        grossCents?: number;
        feeCents?: number;
        feeRecorded?: boolean;
        code?: string;
      };
      if (!res.ok) {
        const friendly =
          json.code === "below_minimum"
            ? "Nothing is cleared and past the 14-day hold yet, so there's nothing to record."
            : json.code === "already_recorded"
              ? "A manual payout for this affiliate is already recorded this month."
              : json.error ?? `Failed (${res.status})`;
        setOwedState(aff.userId, { kind: "error", message: friendly });
        return;
      }
      const fee = json.feeCents ?? 0;
      const feeNote =
        fee > 0
          ? json.feeRecorded
            ? ` + ${formatCents(fee, currency)} PayPal fee booked to Finance`
            : ` (add the ${formatCents(fee, currency)} PayPal fee in Finance manually)`
          : "";
      setOwedState(aff.userId, {
        kind: "success",
        message: `Recorded ${formatCents(json.grossCents ?? payable, currency)} paid${feeNote}.`,
      });
      setTimeout(() => {
        void loadOwed();
      }, 1500);
    } catch (err) {
      console.error(err);
      setOwedState(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  // Break-glass: force-reconcile the FULL owed across ALL orders at once. Rarely
  // correct under amortized/clearing commissions (it hides commission that has
  // not vested yet); kept only for legacy whole-bonus situations paid in full.
  const onMarkPaid = async (aff: OwedAffiliate) => {
    if (
      !window.confirm(
        `Force-reconcile the FULL ${formatCents(aff.owedCents, aff.orders[0]?.currency ?? null)} owed to ${aff.fullName ?? aff.email ?? aff.userId} and drop all ${aff.orderCount} orders off the report?\n\nWARNING: this marks the ENTIRE owed balance paid, including commission that has not vested or cleared yet. If you only paid the "payable now" slice, use "Record manual payout" instead. Do this ONLY if you truly paid the full balance out-of-band. Sanity-check these orders against Lemon Squeezy first - an older or partial refund may not be reflected here.`,
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

  // Programmatic PayPal payout. Recomputes owed from the engine server-side,
  // requires a verified tax form + PayPal email, and reconciles the orders only
  // once PayPal confirms the payout succeeded (webhook / poller).
  const onDisburse = async (aff: OwedAffiliate) => {
    const payable = aff.payableCents ?? aff.owedCents;
    if (
      !window.confirm(
        `Send ${formatCents(payable, aff.orders[0]?.currency ?? null)} to ${aff.fullName ?? aff.email ?? aff.userId} via PayPal now?\n\nThis pays only the cleared, recognized commission (annual plans are paid a month at a time; anything inside the 14-day hold waits). Their tax form must be verified and a PayPal email on file. The exact amount is recomputed at send. Orders are marked paid only once PayPal confirms success.`,
      )
    ) {
      return;
    }
    setOwedState(aff.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: aff.userId }),
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
        payoutBatchId?: string;
      };
      if (!res.ok) {
        const friendly =
          json.code === "no_paypal"
            ? "This affiliate hasn't added a PayPal email yet."
            : json.code === "tax_unverified"
              ? "This affiliate's tax form isn't verified yet."
              : json.code === "below_minimum"
                ? "Owed is below the $10 payout minimum."
                : json.code === "already_disbursed"
                  ? "A payout for this affiliate already exists."
                  : json.error ?? `Failed (${res.status})`;
        setOwedState(aff.userId, { kind: "error", message: friendly });
        return;
      }
      setOwedState(aff.userId, {
        kind: "success",
        message: "PayPal payout sent and processing. Orders reconcile once PayPal confirms it.",
      });
      setTimeout(() => {
        void loadOwed();
      }, 2500);
    } catch (err) {
      console.error(err);
      setOwedState(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  const setGapRowState = (userId: string, state: LinkRowState) =>
    setGapRow((prev) => ({ ...prev, [userId]: state }));

  // Attribute one affiliate's gap orders: stamps them attribution_status='pending'
  // so they appear in the Owed report and become payable. Refreshes both the gap
  // and the owed lists on success.
  const onAttributeGap = async (aff: GapAffiliate) => {
    if (
      !window.confirm(
        `Attribute ${aff.orderCount} order${aff.orderCount === 1 ? "" : "s"} (${formatCents(
          aff.grossCents,
          aff.orders[0]?.currency ?? null,
        )} gross) to ${aff.fullName ?? aff.email ?? aff.userId}?\n\nThese are paid orders from customers this affiliate referred, whose orders were never attributed. This credits them ${formatCents(
          aff.owedCents,
          aff.orders[0]?.currency ?? null,
        )} and moves the orders into the Owed report so you can pay them.`,
      )
    ) {
      return;
    }
    setGapRowState(aff.userId, { kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-attribution-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: aff.userId }),
      });
      const json = (await res.json()) as { error?: string; stampedCount?: number };
      if (!res.ok) {
        setGapRowState(aff.userId, { kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setGapRowState(aff.userId, {
        kind: "success",
        message: `Attributed ${json.stampedCount ?? 0} orders. They now show in the Owed report.`,
      });
      setTimeout(() => {
        void loadGap();
        void loadOwed();
        void loadRoster();
      }, 1500);
    } catch (err) {
      console.error(err);
      setGapRowState(aff.userId, { kind: "error", message: "Network error." });
    }
  };

  // Attribute EVERY detected gap order across all affiliates in one action.
  const onAttributeGapAll = async () => {
    const totalOrders = gap.reduce((s, a) => s + a.orderCount, 0);
    const totalOwed = gap.reduce((s, a) => s + a.owedCents, 0);
    if (
      !window.confirm(
        `Attribute all ${totalOrders} gap order${totalOrders === 1 ? "" : "s"} across ${
          gap.length
        } affiliate${gap.length === 1 ? "" : "s"}?\n\nThis credits roughly ${formatUsd(
          totalOwed,
        )} in total and moves every order into the Owed report. You still pay each affiliate from the Owed / Payouts tabs.`,
      )
    ) {
      return;
    }
    setGapAllState({ kind: "working" });
    try {
      const res = await fetch("/api/affiliates/admin-attribution-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = (await res.json()) as { error?: string; stampedCount?: number };
      if (!res.ok) {
        setGapAllState({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      setGapAllState({
        kind: "success",
        message: `Attributed ${json.stampedCount ?? 0} orders. They now show in the Owed report.`,
      });
      setTimeout(() => {
        void loadGap();
        void loadOwed();
        void loadRoster();
      }, 1500);
    } catch (err) {
      console.error(err);
      setGapAllState({ kind: "error", message: "Network error." });
    }
  };

  // Per-affiliate commission terms (rate + duration) edits from the Roster tab.
  const [termsRow, setTermsRow] = useState<Record<string, LinkRowState>>({});
  const onSaveTerms = async (
    userId: string,
    commissionPercent: number | null,
    commissionDurationMonths: number | null,
  ): Promise<boolean> => {
    setTermsRow((prev) => ({ ...prev, [userId]: { kind: "working" } }));
    try {
      const res = await fetch("/api/affiliates/admin-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, commissionPercent, commissionDurationMonths }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTermsRow((prev) => ({
          ...prev,
          [userId]: { kind: "error", message: json.error ?? `Failed (${res.status})` },
        }));
        return false;
      }
      setTermsRow((prev) => ({ ...prev, [userId]: { kind: "success", message: "Saved." } }));
      // Reflect the new terms in the roster without a full refetch.
      setRoster((prev) =>
        prev.map((r) =>
          r.userId === userId
            ? { ...r, commissionPercent, commissionDurationMonths }
            : r,
        ),
      );
      return true;
    } catch (err) {
      console.error(err);
      setTermsRow((prev) => ({ ...prev, [userId]: { kind: "error", message: "Network error." } }));
      return false;
    }
  };

  // Per-affiliate comp allowance (how many free Pro workspaces they may hand out
  // per month; null/0 = cannot comp). Edited inline from the Roster Terms cell.
  const [compRow, setCompRow] = useState<Record<string, LinkRowState>>({});
  const onSaveCompAllowance = async (
    userId: string,
    monthlyQuota: number | null,
  ): Promise<boolean> => {
    setCompRow((prev) => ({ ...prev, [userId]: { kind: "working" } }));
    try {
      const res = await fetch("/api/affiliates/admin-comp-allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, monthlyQuota }),
      });
      const json = (await res.json()) as { error?: string; monthlyQuota?: number | null };
      if (!res.ok) {
        setCompRow((prev) => ({
          ...prev,
          [userId]: { kind: "error", message: json.error ?? `Failed (${res.status})` },
        }));
        return false;
      }
      const savedQuota = json.monthlyQuota ?? null;
      setCompRow((prev) => ({ ...prev, [userId]: { kind: "success", message: "Saved." } }));
      setRoster((prev) =>
        prev.map((r) =>
          r.userId === userId ? { ...r, affiliateCompMonthlyQuota: savedQuota } : r,
        ),
      );
      return true;
    } catch (err) {
      console.error(err);
      setCompRow((prev) => ({ ...prev, [userId]: { kind: "error", message: "Network error." } }));
      return false;
    }
  };

  // Approve/reject work off a user id + display label so they can be triggered
  // from either the Applications cards or the Roster table.
  const approveUser = async (userId: string, label: string) => {
    if (
      !window.confirm(
        `Approve ${label}?\n\nThis approves the application, creates their branded discount code, and emails them their ready-to-share link. They are live immediately.`,
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
        parts.push("Live now.");
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
      if (statusFilter === "sub-active" && !r.subscriptionActive) return false;
      if (statusFilter === "sub-inactive" && r.subscriptionActive) return false;
      if (!q) return true;
      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.affiliateCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [roster, search, statusFilter]);

  // Affiliates that can be credited: any roster row that is a live affiliate or
  // an approved application. Feeds the "Credit affiliate" tab picker.
  const creditableAffiliates = useMemo<AffiliateOption[]>(
    () =>
      roster
        .filter((r) => r.isAffiliate || r.appStatus === "approved")
        .map((r) => ({
          userId: r.userId,
          name: r.name,
          email: r.email,
          affiliateCode: r.affiliateCode,
        })),
    [roster],
  );

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
          Review the roster, approve applications, manage commission terms, and pay out
          affiliates from one place.
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
    { key: "reconcile", label: "Fix codes", count: null },
    { key: "credit", label: "Credit affiliate", count: null },
    { key: "owed", label: "Owed", count: null },
    { key: "payouts", label: "Payouts", count: null },
    { key: "analytics", label: "Analytics", count: null },
  ];

  // Preview the recipient count, confirm, then send the resources email to every
  // current affiliate. New affiliates already get this in their approval email.
  const onBroadcastResources = async () => {
    setBroadcast({ kind: "working" });
    try {
      const dryRes = await fetch("/api/affiliates/admin-broadcast-resources?dry=1", {
        method: "POST",
      });
      const dry = (await dryRes.json()) as { total?: number; lastSent?: string | null; error?: string };
      if (!dryRes.ok) {
        setBroadcast({ kind: "error", message: dry.error ?? `Failed (${dryRes.status})` });
        return;
      }
      const lastNote = dry.lastSent
        ? `\n\nHeads up: last sent ${new Date(dry.lastSent).toLocaleString()}.`
        : "";
      if (
        !window.confirm(
          `Email the dashboard & resources guide to ${dry.total ?? 0} affiliate(s)?\n\nThis sends to every current affiliate.${lastNote}`,
        )
      ) {
        setBroadcast({ kind: "idle" });
        return;
      }
      const res = await fetch("/api/affiliates/admin-broadcast-resources", { method: "POST" });
      const json = (await res.json()) as { total?: number; sent?: number; failed?: number; error?: string };
      if (!res.ok) {
        setBroadcast({ kind: "error", message: json.error ?? `Failed (${res.status})` });
        return;
      }
      const failedNote = json.failed ? `, ${json.failed} failed` : "";
      setBroadcast({ kind: "success", message: `Sent ${json.sent ?? 0}/${json.total ?? 0}${failedNote}.` });
    } catch (err) {
      console.error(err);
      setBroadcast({ kind: "error", message: "Network error." });
    }
  };

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBroadcastResources}
          disabled={broadcast.kind === "working"}
          className="rounded-lg border border-[#f97316] bg-orange-50 px-3 py-2 text-sm font-semibold text-[#c2410c] transition hover:bg-orange-100 disabled:opacity-60"
        >
          {broadcast.kind === "working" ? "Sending…" : "Email affiliates: dashboard & resources"}
        </button>
        {broadcast.kind === "success" ? (
          <span className="text-sm text-emerald-700">{broadcast.message}</span>
        ) : null}
        {broadcast.kind === "error" ? (
          <span className="text-sm text-red-700">{broadcast.message}</span>
        ) : null}
      </div>

      <TaxTasksBanner onChanged={loadRoster} />

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
          termsRow={termsRow}
          compRow={compRow}
          genRow={genRow}
          emailRow={emailRow}
          onSaveTerms={onSaveTerms}
          onSaveCompAllowance={onSaveCompAllowance}
          onApprove={(r) => approveUser(r.userId, `${r.name ?? r.email ?? r.userId}`)}
          onReject={(r) => rejectUser(r.userId, r.name ?? r.email ?? r.userId)}
          onGenerateCode={onGenerateCode}
          onSetCustomCode={onSetCustomCode}
          onEmailResources={onEmailResources}
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
        <div className="space-y-6">
          <section className="space-y-4">
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
            ) : reconcileError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                {reconcileError}
              </div>
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

      {tab === "credit" ? (
        <CreditReferralTab
          affiliates={creditableAffiliates}
          initialCustomer={creditCustomer}
          initialCode={creditCode}
        />
      ) : null}

      {tab === "owed" ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
              Admin · Owed commissions
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Owed affiliate commissions
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Commissions we owe affiliates on their referred orders (default {commissionPercent}% of
              order value, or the affiliate&apos;s custom rate). Click{" "}
              <strong>Disburse via PayPal</strong> to pay directly: the exact amount is recomputed at
              send, and it requires a verified tax form and a PayPal email on file. Orders are marked
              reconciled only once PayPal confirms the payout succeeded. If you already paid an
              affiliate out-of-band, use <strong>Record manual payout</strong> to log the cleared
              &quot;payable now&quot; slice (annual orders keep vesting). <strong>Force-reconcile all
              orders</strong> is a break-glass that marks the entire owed balance paid: rarely what
              you want.
            </p>
          </div>

          {/* Auto-pay arming: pay eligible affiliates automatically each month. */}
          {autopayLoaded ? (
            <div
              className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${
                autopayArmed ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Monthly auto-pay{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        autopayArmed
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {autopayArmed ? "Armed" : "Shadow (preview only)"}
                    </span>
                  </p>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    When armed, on the 1st of each month the system pays every eligible affiliate
                    (verified tax form + PayPal, over $10) their cleared commission via PayPal, and
                    emails you a summary. Amounts over{" "}
                    <strong>{formatUsd(autopayCapCents)}</strong> still wait for your manual Disburse.
                    In shadow mode it emails you a preview but sends no money.
                    {autopayEnvForced
                      ? " (Locked on by an environment variable.)"
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autopayArmed}
                  disabled={autopaySaving || autopayEnvForced}
                  onClick={() => onToggleAutopay(!autopayArmed)}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                    autopayArmed ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  title={autopayEnvForced ? "Locked on by an environment variable" : "Toggle auto-pay"}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      autopayArmed ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          ) : null}

          {/* Attribution gap: referred conversions whose orders were never stamped. */}
          <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Attribution gap
                </p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                  Referred conversions not yet attributed
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  These are paid customers an affiliate referred (from their signup link) whose orders
                  were never stamped, so they do not yet appear above. Attribute them to credit the
                  affiliate their {""}
                  full rate and move the orders into the Owed report. Verify before paying: an old or
                  partial refund may not be reflected here.
                </p>
              </div>
              {gap.length > 0 ? (
                <button
                  type="button"
                  onClick={onAttributeGapAll}
                  disabled={gapAllState.kind === "working"}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                >
                  {gapAllState.kind === "working" ? "Working…" : "Attribute all"}
                </button>
              ) : null}
            </div>

            {gapAllState.kind === "success" ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {gapAllState.message}
              </p>
            ) : null}
            {gapAllState.kind === "error" ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {gapAllState.message}
              </p>
            ) : null}

            {gapLoading ? (
              <div className="mt-4 h-16 animate-pulse rounded-xl border border-amber-200 bg-white/70" />
            ) : gapError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {gapError}
              </div>
            ) : gap.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4 text-center text-sm text-slate-500">
                No unattributed referred conversions. Every referred paid order is accounted for. ✨
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {gap.map((aff) => {
                  const state = gapRow[aff.userId] ?? { kind: "idle" };
                  const working = state.kind === "working";
                  const currency = aff.orders[0]?.currency ?? null;
                  return (
                    <li
                      key={aff.userId}
                      className="rounded-xl border border-amber-200 bg-white/80 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 break-words">
                            {aff.fullName ?? "(no name)"}
                          </p>
                          <p className="text-xs text-slate-500 break-all">
                            {aff.email ?? "(no email)"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {aff.affiliateCode ? `Code ${aff.affiliateCode} · ` : ""}
                            {aff.orderCount} order{aff.orderCount === 1 ? "" : "s"} ·{" "}
                            {formatCents(aff.grossCents, currency)} gross · {aff.ratePercent}% rate
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className="text-base font-bold text-amber-700">
                            {formatCents(aff.owedCents, currency)} would be owed
                          </p>
                          <button
                            type="button"
                            onClick={() => onAttributeGap(aff)}
                            disabled={working}
                            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                          >
                            {working ? "Working…" : "Attribute"}
                          </button>
                        </div>
                      </div>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700">
                          {aff.orderCount} unattributed order{aff.orderCount === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-2 space-y-1 rounded-lg bg-amber-50/70 p-3 text-xs text-slate-600">
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
                        {typeof aff.payableCents === "number" ? (
                          <p className="-mt-1 text-xs text-slate-500">
                            {formatCents(aff.payableCents, currency)} payable now
                            {aff.clearingCents && aff.clearingCents > 0
                              ? ` · ${formatCents(aff.clearingCents, currency)} clearing`
                              : ""}
                          </p>
                        ) : null}
                        {aff.payableCents && aff.payableCents > 0 ? (
                          <p className="-mt-1 text-[11px] text-slate-400">
                            Paying by hand? Send{" "}
                            {formatCents(grossUpForPayPalGs(aff.payableCents), currency)} via PayPal
                            goods &amp; services so they net{" "}
                            {formatCents(aff.payableCents, currency)}.
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDisburse(aff)}
                          disabled={working}
                          className="rounded-lg bg-[#0070ba] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#005a96] disabled:opacity-60"
                        >
                          {working ? "Working…" : "Disburse via PayPal"}
                        </button>
                        {aff.payableCents && aff.payableCents > 0 ? (
                          <button
                            type="button"
                            onClick={() => onRecordManualPayout(aff)}
                            disabled={working}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            Record manual payout
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onMarkPaid(aff)}
                          disabled={working}
                          className="text-[11px] font-medium text-slate-400 underline decoration-dotted underline-offset-2 transition hover:text-red-600 disabled:opacity-60"
                        >
                          Force-reconcile all orders
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

      {tab === "payouts" ? <PayoutsTab onForbidden={() => setForbidden(true)} /> : null}

      {tab === "analytics" ? <AnalyticsTab onForbidden={() => setForbidden(true)} /> : null}
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
  termsRow,
  compRow,
  genRow,
  emailRow,
  onSaveTerms,
  onSaveCompAllowance,
  onApprove,
  onReject,
  onGenerateCode,
  onSetCustomCode,
  onEmailResources,
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
  termsRow: Record<string, LinkRowState>;
  compRow: Record<string, LinkRowState>;
  genRow: Record<string, LinkRowState>;
  emailRow: Record<string, LinkRowState>;
  onSaveTerms: (
    userId: string,
    commissionPercent: number | null,
    commissionDurationMonths: number | null,
  ) => Promise<boolean>;
  onSaveCompAllowance: (userId: string, monthlyQuota: number | null) => Promise<boolean>;
  onApprove: (row: RosterRow) => void;
  onReject: (row: RosterRow) => void;
  onGenerateCode: (row: RosterRow) => void;
  onSetCustomCode: (row: RosterRow) => void;
  onEmailResources: (row: RosterRow) => void;
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
          Lemon Squeezy link status is unavailable right now, so the Linked/Unlinked badges may be
          stale. Earnings are computed from our own orders and are unaffected.
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
                <th className="px-4 py-3">Code &amp; link</th>
                <th className="px-4 py-3">Terms</th>
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
                const gen = genRow[r.userId] ?? { kind: "idle" };
                const email = emailRow[r.userId] ?? { kind: "idle" };
                return (
                  <tr key={r.userId} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {r.isAffiliate || r.appStatus === "approved" ? (
                        <Link
                          href={`/dashboard/admin/affiliates/${r.userId}`}
                          title="View this affiliate's dashboard (read-only)"
                          className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-[#c2410c] hover:decoration-[#f97316] break-words"
                        >
                          {r.name ?? "(no name)"}
                        </Link>
                      ) : (
                        <p className="font-semibold text-slate-900 break-words">
                          {r.name ?? "(no name)"}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 break-all">{r.email ?? "(no email)"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <CodeCell code={r.affiliateCode} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <TermsCell row={r} state={termsRow[r.userId] ?? { kind: "idle" }} onSave={onSaveTerms} />
                        <CompAllowanceCell
                          row={r}
                          state={compRow[r.userId] ?? { kind: "idle" }}
                          onSave={onSaveCompAllowance}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadges row={r} />
                      {r.lsActivatedAt ? (
                        <p className="mt-1 text-[11px] text-slate-400 whitespace-nowrap">
                          LS active since {formatDateShort(r.lsActivatedAt)}
                        </p>
                      ) : null}
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
                      ) : (
                        <div className="flex max-w-[16rem] flex-col gap-1">
                          {r.appStatus !== "rejected" && (r.appStatus === "approved" || r.isAffiliate) ? (
                            <button
                              type="button"
                              onClick={() => onGenerateCode(r)}
                              disabled={gen.kind === "working"}
                              className="w-fit whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-[#f97316] hover:bg-orange-50 hover:text-[#c2410c] disabled:opacity-60"
                            >
                              {gen.kind === "working"
                                ? "Generating…"
                                : r.affiliateCode
                                  ? "New code"
                                  : "Generate code"}
                            </button>
                          ) : null}
                          {r.appStatus !== "rejected" && (r.appStatus === "approved" || r.isAffiliate) ? (
                            <button
                              type="button"
                              onClick={() => onSetCustomCode(r)}
                              disabled={gen.kind === "working"}
                              className="w-fit whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-[#f97316] hover:bg-orange-50 hover:text-[#c2410c] disabled:opacity-60"
                            >
                              Set custom code
                            </button>
                          ) : null}
                          {gen.kind === "success" ? (
                            <span className="text-xs text-emerald-700">{gen.message}</span>
                          ) : gen.kind === "error" ? (
                            <span className="text-xs text-red-700">{gen.message}</span>
                          ) : null}
                          {(r.appStatus === "approved" || r.isAffiliate) && r.email ? (
                            <button
                              type="button"
                              onClick={() => onEmailResources(r)}
                              disabled={email.kind === "working"}
                              className="w-fit whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-[#f97316] hover:bg-orange-50 hover:text-[#c2410c] disabled:opacity-60"
                            >
                              {email.kind === "working" ? "Emailing…" : "Email resources"}
                            </button>
                          ) : null}
                          {email.kind === "success" ? (
                            <span className="text-xs text-emerald-700">{email.message}</span>
                          ) : email.kind === "error" ? (
                            <span className="text-xs text-red-700">{email.message}</span>
                          ) : null}
                          {state.kind === "success" ? (
                            <span className="text-xs text-emerald-700">{state.message}</span>
                          ) : state.kind === "error" ? (
                            <span className="text-xs text-red-700">{state.message}</span>
                          ) : null}
                        </div>
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
        Earnings are computed from our own referred orders (self-hosted program), not Lemon Squeezy.
        Total earned is the full promised rate on every referred order; Owed is what is still
        outstanding (plus any make-whole adjustments); Paid out is total earned minus owed. See the
        Owed and Payouts tabs to pay, and the Attribution gap section under Owed for referred
        conversions whose orders were never attributed.
      </p>
    </div>
  );
}

// Shows an affiliate's branded code plus their full share link, each with a
// one-click copy. Falls back to a dash when they have no code yet (the roster
// Actions column offers "Generate code" in that case).
function CodeCell({ code }: { code: string | null }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  if (!code) return <span className="text-xs text-slate-400">-</span>;
  const link = affiliateShareLink(code);
  const copy = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error("copy failed", err);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{code}</span>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="text-[11px] font-medium text-slate-500 transition hover:text-[#c2410c]"
        >
          {copied === "code" ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => copy(link, "link")}
        title={link}
        className="max-w-[220px] truncate text-left text-[11px] text-slate-500 transition hover:text-[#c2410c]"
      >
        {copied === "link" ? "Link copied!" : link.replace(/^https:\/\//, "")}
      </button>
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

  // Self-hosted affiliates never link to LS, so there is no "Not linked" state
  // to flag: approval alone means they can promote. Only show the legacy badge
  // for transition-era affiliates who actually linked via Lemon Squeezy.
  if (row.appStatus !== "rejected" && row.lsLinked) {
    const active = (row.lsStatus ?? "").toLowerCase() === "active";
    badges.push({
      label: active ? "LS active" : `LS ${row.lsStatus ?? "linked"}`,
      className: active ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600",
    });
  }

  // The affiliate's own subscription to the product (paid = "active"), separate
  // from the Lemon Squeezy affiliate-account badge above. On-trial does not
  // count as active but is worth surfacing for context.
  if (row.subscriptionActive) {
    badges.push({
      label: `Sub: ${row.subscriptionStatus ?? "active"}`,
      className: "bg-emerald-100 text-emerald-800",
    });
  } else if ((row.subscriptionStatus ?? "").toLowerCase() === "on_trial") {
    badges.push({ label: "Sub: trial", className: "bg-slate-100 text-slate-600" });
  } else {
    badges.push({ label: "No sub", className: "bg-slate-100 text-slate-500" });
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

function termsSummary(percent: number | null, months: number | null): string {
  if (percent === null || percent === 30) return "30% (default)";
  return `${percent}% · ${months === null ? "Lifetime" : `${months} mo`}`;
}

/**
 * Inline editor for one affiliate's commission rate + duration. Shows the
 * current terms as a badge; expands to a compact form on Edit. Leaving the
 * percent blank and saving clears the custom rate (back to the 30% default).
 */
function TermsCell({
  row,
  state,
  onSave,
}: {
  row: RosterRow;
  state: LinkRowState;
  onSave: (
    userId: string,
    commissionPercent: number | null,
    commissionDurationMonths: number | null,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [percent, setPercent] = useState<string>(
    row.commissionPercent !== null ? String(row.commissionPercent) : "",
  );
  const [durationMode, setDurationMode] = useState<"lifetime" | "months">(
    row.commissionDurationMonths === null ? "lifetime" : "months",
  );
  const [months, setMonths] = useState<string>(
    row.commissionDurationMonths !== null ? String(row.commissionDurationMonths) : "12",
  );

  const working = state.kind === "working";
  const custom = row.commissionPercent !== null && row.commissionPercent !== 30;

  const startEdit = () => {
    setPercent(row.commissionPercent !== null ? String(row.commissionPercent) : "");
    setDurationMode(row.commissionDurationMonths === null ? "lifetime" : "months");
    setMonths(row.commissionDurationMonths !== null ? String(row.commissionDurationMonths) : "12");
    setEditing(true);
  };

  const save = async () => {
    const trimmed = percent.trim();
    const pctNum = trimmed === "" ? null : Number(trimmed);
    if (pctNum !== null && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) {
      window.alert("Rate must be a number between 0 and 100 (or blank for the 30% default).");
      return;
    }
    let durationMonths: number | null = null;
    if (pctNum !== null && durationMode === "months") {
      const m = Number(months.trim());
      if (!Number.isFinite(m) || m <= 0) {
        window.alert("Duration months must be a positive number.");
        return;
      }
      durationMonths = Math.round(m);
    }
    const ok = await onSave(row.userId, pctNum === null ? null : Math.round(pctNum), durationMonths);
    if (ok) setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            custom ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {termsSummary(row.commissionPercent, row.commissionDurationMonths)}
        </span>
        <button
          type="button"
          onClick={startEdit}
          className="text-xs font-medium text-[#c2410c] hover:underline"
        >
          Edit
        </button>
        {state.kind === "success" ? (
          <span className="text-xs text-emerald-700">{state.message}</span>
        ) : null}
        {state.kind === "error" ? (
          <span className="text-xs text-red-700">{state.message}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder="30"
          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#f97316] focus:outline-none"
        />
        <span className="text-xs text-slate-500">%</span>
      </div>
      <select
        value={durationMode}
        onChange={(e) => setDurationMode(e.target.value as "lifetime" | "months")}
        className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#f97316] focus:outline-none"
      >
        <option value="lifetime">Lifetime</option>
        <option value="months">Months</option>
      </select>
      {durationMode === "months" ? (
        <input
          type="number"
          min={1}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          placeholder="12"
          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#f97316] focus:outline-none"
        />
      ) : null}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={save}
          disabled={working}
          className="rounded bg-[#f97316] px-2 py-1 text-xs font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
        >
          {working ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={working}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {state.kind === "error" ? (
        <span className="text-xs text-red-700">{state.message}</span>
      ) : null}
    </div>
  );
}

/**
 * Inline editor for one affiliate's comp allowance: how many free single-seat
 * Pro workspaces they may hand out per calendar month. Blank / 0 turns the
 * ability off. The comp itself is always capped at 2 months and 1 seat, enforced
 * when the affiliate issues it, so this only controls who may comp and how often.
 */
function CompAllowanceCell({
  row,
  state,
  onSave,
}: {
  row: RosterRow;
  state: LinkRowState;
  onSave: (userId: string, monthlyQuota: number | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [quota, setQuota] = useState<string>(
    row.affiliateCompMonthlyQuota ? String(row.affiliateCompMonthlyQuota) : "",
  );

  const working = state.kind === "working";
  const enabled = (row.affiliateCompMonthlyQuota ?? 0) > 0;

  const startEdit = () => {
    setQuota(row.affiliateCompMonthlyQuota ? String(row.affiliateCompMonthlyQuota) : "");
    setEditing(true);
  };

  const save = async () => {
    const trimmed = quota.trim();
    const qNum = trimmed === "" ? null : Number(trimmed);
    if (qNum !== null && (!Number.isInteger(qNum) || qNum < 0)) {
      window.alert("Comp allowance must be a whole number (0 or blank turns it off).");
      return;
    }
    const ok = await onSave(row.userId, qNum);
    if (ok) setEditing(false);
  };

  const revoke = async () => {
    if (
      !window.confirm(
        "Revoke this affiliate's comp workspace? They can no longer hand out new free workspaces. Comps they have already issued keep running (cancel those one by one on the Comps page). The affiliate is emailed that their passes are paused.",
      )
    ) {
      return;
    }
    await onSave(row.userId, null);
  };

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {enabled ? `Comps: ${row.affiliateCompMonthlyQuota}/mo` : "Comps: off"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-medium text-[#c2410c] hover:underline"
          >
            Edit
          </button>
          {enabled ? (
            <button
              type="button"
              onClick={revoke}
              disabled={working}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              {working ? "…" : "Revoke"}
            </button>
          ) : null}
        </div>
        {state.kind === "success" ? (
          <span className="text-xs text-emerald-700">{state.message}</span>
        ) : null}
        {state.kind === "error" ? (
          <span className="text-xs text-red-700">{state.message}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          placeholder="off"
          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#f97316] focus:outline-none"
        />
        <span className="text-xs text-slate-500">/mo</span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={save}
          disabled={working}
          className="rounded bg-[#f97316] px-2 py-1 text-xs font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60"
        >
          {working ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={working}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {state.kind === "error" ? (
        <span className="text-xs text-red-700">{state.message}</span>
      ) : null}
    </div>
  );
}

function currentMonthValue(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Payouts tab: per custom-rate affiliate, the month's commissionable orders,
 * what Lemon Squeezy already paid (30%), and the top-up we still owe. Lets the
 * admin mark a month paid (shared reconciled stamp with the Owed tab) and email
 * statements (combined master + optional individual copies). Self-contained: it
 * fetches its own data and manages its own selection + row state.
 */
function PayoutsTab({ onForbidden }: { onForbidden: () => void }) {
  const [period, setPeriod] = useState<string>(currentMonthValue());
  const [rows, setRows] = useState<PayoutAffiliate[]>([]);
  const [lsAvailable, setLsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [payRow, setPayRow] = useState<Record<string, LinkRowState>>({});
  const [sendCombined, setSendCombined] = useState(true);
  const [sendIndividual, setSendIndividual] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/affiliates/admin-payouts?period=${encodeURIComponent(period)}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        onForbidden();
        return;
      }
      const json = (await res.json()) as PayoutsResponse;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      const affiliates = json.affiliates ?? [];
      setRows(affiliates);
      setLsAvailable(json.lsAvailable === true);
      // Default-select every affiliate that has a balance owed.
      const sel: Record<string, boolean> = {};
      for (const a of affiliates) sel[a.userId] = a.owedCents > 0;
      setSelected(sel);
    } catch (err) {
      console.error(err);
      setError("Network error loading payouts.");
    } finally {
      setLoading(false);
    }
  }, [period, onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedIds = useMemo(
    () => rows.filter((r) => selected[r.userId]).map((r) => r.userId),
    [rows, selected],
  );

  const totalOwed = useMemo(() => rows.reduce((sum, r) => sum + r.owedCents, 0), [rows]);

  const onMarkMonthPaid = async (aff: PayoutAffiliate) => {
    if (aff.owedCents <= 0 || aff.lines.length === 0) return;
    if (
      !window.confirm(
        `Mark ${formatUsd(aff.owedCents)} paid to ${aff.fullName ?? aff.email ?? aff.userId} for ${period}?\n\nDo this only after you have actually paid the top-up. This stamps the ${aff.lines.length} order(s) reconciled so they drop off this month and the Owed tab.`,
      )
    ) {
      return;
    }
    setPayRow((prev) => ({ ...prev, [aff.userId]: { kind: "working" } }));
    try {
      const res = await fetch("/api/affiliates/admin-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: aff.userId,
          period,
          orderIds: aff.lines.map((l) => l.lsOrderId),
          amountCents: aff.owedCents,
        }),
      });
      const json = (await res.json()) as { error?: string; reconciledCount?: number };
      if (!res.ok) {
        setPayRow((prev) => ({
          ...prev,
          [aff.userId]: { kind: "error", message: json.error ?? `Failed (${res.status})` },
        }));
        return;
      }
      setPayRow((prev) => ({
        ...prev,
        [aff.userId]: { kind: "success", message: `Marked ${json.reconciledCount ?? 0} paid.` },
      }));
      setTimeout(() => void load(), 1200);
    } catch (err) {
      console.error(err);
      setPayRow((prev) => ({ ...prev, [aff.userId]: { kind: "error", message: "Network error." } }));
    }
  };

  const onSend = async () => {
    if (selectedIds.length === 0) {
      setSendMsg("Select at least one affiliate to email.");
      return;
    }
    if (!sendCombined && !sendIndividual) {
      setSendMsg("Choose the combined copy, individual copies, or both.");
      return;
    }
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/affiliates/admin-send-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, userIds: selectedIds, sendCombined, sendIndividual }),
      });
      const json = (await res.json()) as {
        error?: string;
        inbox?: string;
        combinedSent?: boolean;
        individualSent?: number;
      };
      if (!res.ok) {
        setSendMsg(json.error ?? `Failed (${res.status})`);
        return;
      }
      const parts: string[] = [];
      if (sendCombined) parts.push(json.combinedSent ? `Combined copy sent to ${json.inbox}.` : "Combined copy failed.");
      if (sendIndividual) parts.push(`${json.individualSent ?? 0} individual statement(s) sent.`);
      setSendMsg(parts.join(" ") || "Done.");
    } catch (err) {
      console.error(err);
      setSendMsg("Network error sending statements.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Payouts
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Monthly commission top-ups
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          For affiliates on a custom rate, this is what they earned each month, what Lemon Squeezy
          already paid (30%), and the top-up you still owe. Pay the balance, then mark the month paid.
          Statements can be emailed as a combined master copy plus an optional copy to each affiliate.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Month
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider">Total owed</span>
          <span className="text-lg font-bold text-indigo-700">{formatUsd(totalOwed)}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={sendCombined} onChange={(e) => setSendCombined(e.target.checked)} />
            Combined copy
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={sendIndividual} onChange={(e) => setSendIndividual(e.target.checked)} />
            Email each affiliate
          </label>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
          >
            {sending ? "Sending…" : `Email ${selectedIds.length || ""} selected`.trim()}
          </button>
        </div>
      </div>

      {sendMsg ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {sendMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No custom-rate affiliates with activity this month. Set a rate above 30% on the Roster tab
          to start tracking top-ups.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((aff) => {
            const state = payRow[aff.userId] ?? { kind: "idle" };
            const working = state.kind === "working";
            const earned = aff.lsPaidCents + aff.owedCents;
            // LS reports cumulative earnings; if it shows more unpaid than we
            // attributed this month, a referral may have bypassed our capture.
            const lsUnpaid = aff.ls?.unpaidEarningsCents ?? null;
            return (
              <li
                key={aff.userId}
                className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected[aff.userId] ?? false}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [aff.userId]: e.target.checked }))
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900 break-words">
                        {aff.fullName ?? "(no name)"}
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                          {aff.ratePercent}% · {aff.durationMonths === null ? "Lifetime" : `${aff.durationMonths} mo`}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600 break-all">{aff.email ?? "(no email)"}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {aff.affiliateCode ? `Code ${aff.affiliateCode} · ` : ""}
                        {aff.orderCount} order{aff.orderCount === 1 ? "" : "s"} · earned{" "}
                        {formatUsd(earned)} · LS paid {formatUsd(aff.lsPaidCents)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-lg font-bold text-indigo-700">{formatUsd(aff.owedCents)} owed</p>
                    <button
                      type="button"
                      onClick={() => onMarkMonthPaid(aff)}
                      disabled={working || aff.owedCents <= 0}
                      className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60"
                    >
                      {working ? "Saving…" : "Mark month paid"}
                    </button>
                  </div>
                </div>

                {lsUnpaid !== null && lsUnpaid > aff.owedCents + aff.lsPaidCents ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Lemon Squeezy shows {formatUsd(lsUnpaid)} unpaid for this affiliate (cumulative),
                    which is more than we attributed. Cross-check LS in case a referral bypassed our
                    tracking (e.g. a raw LS affiliate link).
                  </p>
                ) : null}

                {aff.lines.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700">
                      {aff.lines.length} order{aff.lines.length === 1 ? "" : "s"} this month
                    </summary>
                    <ul className="mt-2 space-y-1 rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                      {aff.lines.map((l) => (
                        <li key={l.lsOrderId} className="flex flex-wrap justify-between gap-2">
                          <span className="break-all">
                            Order {l.lsOrderId}
                            {l.createdAt ? ` · ${formatDate(l.createdAt)}` : ""}
                            {l.attributionStatus === "pending" ? " · gap" : ""}
                          </span>
                          <span>
                            {formatCents(l.totalCents, l.currency)} · LS {formatUsd(l.lsPaidCents)} ·
                            owe {formatUsd(l.owedCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
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

      {!lsAvailable ? (
        <p className="text-xs text-slate-400">
          Lemon Squeezy is unavailable right now, so the LS cross-check is skipped. Owed amounts are
          computed from your own order records.
        </p>
      ) : null}

      <PayoutLedgerHistory />
    </section>
  );
}

type LedgerPayout = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  period: string | null;
  grossCents: number;
  currency: string;
  status: string;
  paypalEmail: string | null;
  errorNote: string | null;
  createdAt: string | null;
  paidAt: string | null;
  retryable: boolean;
};

const PAYOUT_STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  processing: "bg-blue-100 text-blue-800",
  pending: "bg-blue-100 text-blue-800",
  unclaimed: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  denied: "bg-red-100 text-red-800",
  blocked: "bg-red-100 text-red-800",
  returned: "bg-red-100 text-red-800",
};

/** Payout ledger history + retry, shown under the monthly top-ups. */
function PayoutLedgerHistory() {
  const [rows, setRows] = useState<LedgerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRow, setRetryRow] = useState<Record<string, LinkRowState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliates/admin-payouts-ledger", { cache: "no-store" });
      const json = (await res.json()) as { payouts?: LedgerPayout[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(json.payouts ?? []);
    } catch (err) {
      console.error(err);
      setError("Network error loading payout history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = async (p: LedgerPayout) => {
    if (
      !window.confirm(
        `Retry the ${formatUsd(p.grossCents)} payout to ${p.name ?? p.email ?? p.userId}?\n\nThis sends a fresh PayPal payout for the amount still owed. The failed attempt is kept for your records.`,
      )
    ) {
      return;
    }
    setRetryRow((prev) => ({ ...prev, [p.id]: { kind: "working" } }));
    try {
      const res = await fetch("/api/affiliates/admin-payouts-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId: p.id }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        const friendly =
          json.code === "no_paypal"
            ? "The affiliate still has no PayPal email on file."
            : json.code === "tax_unverified"
              ? "The affiliate's tax form isn't verified."
              : json.code === "below_minimum"
                ? "Nothing is owed anymore (below the minimum)."
                : json.error ?? `Failed (${res.status})`;
        setRetryRow((prev) => ({ ...prev, [p.id]: { kind: "error", message: friendly } }));
        return;
      }
      setRetryRow((prev) => ({ ...prev, [p.id]: { kind: "success", message: "Retry sent (processing)." } }));
      setTimeout(() => void load(), 2000);
    } catch (err) {
      console.error(err);
      setRetryRow((prev) => ({ ...prev, [p.id]: { kind: "error", message: "Network error." } }));
    }
  };

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">PayPal payout history</h3>
          <p className="mt-1 text-sm text-slate-600">
            Every PayPal disbursement and its status. Orders reconcile only when a payout succeeds; a
            failed or returned payout can be retried, which sends a fresh payout for what&apos;s still owed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-4 h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No payouts yet. Use &quot;Disburse via PayPal&quot; on the Owed tab.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((p) => {
            const state = retryRow[p.id] ?? { kind: "idle" };
            const working = state.kind === "working";
            const badge = PAYOUT_STATUS_STYLE[p.status] ?? "bg-slate-100 text-slate-700";
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 break-words">
                      {p.name ?? p.email ?? p.userId.slice(0, 8)}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${badge}`}>
                        {p.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 break-all">
                      {formatUsd(p.grossCents)}
                      {p.period ? ` · ${p.period}` : " · ad-hoc"}
                      {p.paypalEmail ? ` · ${p.paypalEmail}` : ""}
                      {p.paidAt ? ` · paid ${formatDate(p.paidAt)}` : p.createdAt ? ` · ${formatDate(p.createdAt)}` : ""}
                    </p>
                    {p.errorNote ? (
                      <p className="mt-1 text-xs text-red-600 break-words">{p.errorNote}</p>
                    ) : null}
                  </div>
                  {p.retryable ? (
                    <button
                      type="button"
                      onClick={() => onRetry(p)}
                      disabled={working}
                      className="rounded-lg bg-[#0070ba] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#005a96] disabled:opacity-60"
                    >
                      {working ? "Retrying…" : "Retry"}
                    </button>
                  ) : null}
                </div>
                {state.kind === "success" ? (
                  <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                    {state.message}
                  </p>
                ) : null}
                {state.kind === "error" ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
                    {state.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const RANGE_OPTIONS = [1, 6, 12, 24] as const;

/**
 * Analytics tab: a monthly bar chart of gross referred revenue, full affiliate
 * earnings, and the top-up owed, program-wide with a per-affiliate filter, plus
 * a totals table. All computed from our own orders (reconciles with Payouts).
 */
function AnalyticsTab({ onForbidden }: { onForbidden: () => void }) {
  const [months, setMonths] = useState<number>(12);
  const [customOpen, setCustomOpen] = useState(false);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/affiliates/admin-earnings?months=${months}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        onForbidden();
        return;
      }
      const json = (await res.json()) as EarningsResponse;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Network error loading analytics.");
    } finally {
      setLoading(false);
    }
  }, [months, onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets: MonthlyBucket[] = useMemo(() => {
    if (!data) return [];
    if (selected === "all") return data.totals ?? [];
    return data.byAffiliate?.find((a) => a.userId === selected)?.months ?? [];
  }, [data, selected]);

  const summary = useMemo(() => {
    return buckets.reduce(
      (acc, b) => ({
        gross: acc.gross + b.grossCents,
        earned: acc.earned + b.earnedCents,
        owed: acc.owed + b.owedCents,
      }),
      { gross: 0, earned: 0, owed: 0 },
    );
  }, [buckets]);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Admin · Analytics
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Affiliate earnings by month
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Gross revenue affiliates drove, what they earned at their full rate, and the top-up you owe
          on top of Lemon Squeezy&apos;s 30%. Computed from your orders, so it reconciles with the
          Payouts tab.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Affiliate
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#f97316] focus:outline-none"
          >
            <option value="all">All affiliates</option>
            {(data?.byAffiliate ?? []).map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.fullName ?? a.email ?? a.affiliateCode ?? a.userId.slice(0, 8)} ({a.ratePercent}%)
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Range
          <div className="flex items-center gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setCustomOpen(false);
                  setMonths(r);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  !customOpen && months === r
                    ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {r}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                customOpen
                  ? "border-[#f97316] bg-orange-50 text-[#c2410c]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              Custom
            </button>
            {customOpen ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={months}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next) && next >= 1) {
                      setMonths(Math.min(120, Math.round(next)));
                    }
                  }}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-[#f97316] focus:outline-none"
                />
                <span className="text-xs font-normal normal-case text-slate-500">months</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-4 text-right">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue</p>
            <p className="text-lg font-bold text-indigo-700">{formatUsd(summary.gross)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Earned</p>
            <p className="text-lg font-bold text-violet-700">{formatUsd(summary.earned)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">You owe</p>
            <p className="text-lg font-bold text-[#c2410c]">{formatUsd(summary.owed)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>
      ) : (
        <>
          <MonthlyEarningsChart data={buckets} />

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Referred revenue</th>
                  <th className="px-4 py-3 text-right">LS paid (30%)</th>
                  <th className="px-4 py-3 text-right">You owe</th>
                  <th className="px-4 py-3 text-right">Total earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {buckets
                  .slice()
                  .reverse()
                  .map((b) => (
                    <tr key={b.month} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 font-medium text-slate-800">{b.month}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{b.orderCount}</td>
                      <td className="px-4 py-2 text-right text-slate-800">{formatUsd(b.grossCents)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatUsd(b.lsPaidCents)}</td>
                      <td className="px-4 py-2 text-right font-medium text-[#c2410c]">
                        {formatUsd(b.owedCents)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-violet-700">
                        {formatUsd(b.earnedCents)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {typeof data?.lsTotalEarningsCents === "number" ? (
            <p className="text-xs text-slate-400">
              Lemon Squeezy reports {formatUsd(data.lsTotalEarningsCents)} in cumulative affiliate
              earnings across all time (all affiliates). Use it as a rough sanity check against the
              totals above.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
