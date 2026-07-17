import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browsable, filterable user directory for the admin Users workspace. Merges
 * every known person into one flat row array the client filters:
 *
 *  - auth.users: the real account list, including magic-link / startup-walkthrough
 *    sign-ins that never paid (these often have no profiles/subscriptions row).
 *  - profiles: display name, affiliate flag/code, country, LS customer link.
 *  - subscriptions: the most relevant sub per user -> status + plan + ends/renews.
 *  - subscription_cancel_reasons: the churn reason/feedback for cancelled users.
 *  - email_subscribers + course_progress: email-only "leads" with no account.
 *
 * Every optional source is wrapped so a manually-lagging prod schema (columns are
 * applied by hand and drift) degrades to "unknown" instead of 500ing the list.
 * Distinct from /api/admin/users/lookup, which returns the full detail (licenses,
 * orders, support actions) for one email.
 */

// Safety cap so a runaway auth.users table can't build an unbounded payload.
const MAX_ACCOUNTS = 5000;
const PER_PAGE = 200;

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

// createAdminClient() returns a deliberately narrow type. Cast to the surface we
// need here (chained query builder + a fuller auth.admin.listUsers than the
// shared AdminService exposes), mirroring the RosterClient cast in admin-roster.
type ListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    } & Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
  };
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: AuthUser[] } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

type UserRow = {
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

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Precedence when a user has several subscription rows: a live sub wins over an
// old cancelled one (so a resubscriber reads as active, not cancelled), and ties
// break to the most recently created row.
function statusRank(status: string | null): number {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return 5;
    case "on_trial":
      return 4;
    case "past_due":
      return 3;
    case "paused":
      return 2;
    case "cancelled":
    case "canceled":
      return 1;
    default:
      return 0;
  }
}

export async function GET(request: Request) {
  const actor = await requirePermission("users.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as ListClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    // 1. Accounts: page through auth.users until an empty page (existing call
    // sites stop at a single 200-row page and silently cap the list).
    const accounts: AuthUser[] = [];
    let truncated = false;
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (error) {
        console.error("admin/users/list: listUsers failed", error);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
      }
      const batch = data?.users ?? [];
      if (batch.length === 0) break;
      accounts.push(...batch);
      if (accounts.length >= MAX_ACCOUNTS) {
        truncated = true;
        accounts.length = MAX_ACCOUNTS;
        break;
      }
      if (batch.length < PER_PAGE) break;
    }

    const accountEmails = new Set<string>();
    for (const u of accounts) {
      const email = str(u.email);
      if (email) accountEmails.add(email.toLowerCase());
    }

    // 2. Profiles, indexed by user id. Magic-link/walkthrough-only accounts have
    // no row here, so profile fields fall back to the auth record.
    type ProfileInfo = {
      email: string | null;
      name: string | null;
      isAffiliate: boolean;
      affiliateCode: string | null;
      country: string | null;
    };
    const profileByUser = new Map<string, ProfileInfo>();
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,email,display_name,is_affiliate,affiliate_code,country,ls_customer_id");
      for (const row of profiles ?? []) {
        const id = str(row.id);
        if (!id) continue;
        profileByUser.set(id, {
          email: str(row.email),
          name: str(row.display_name),
          isAffiliate: row.is_affiliate === true,
          affiliateCode: str(row.affiliate_code),
          country: str(row.country),
        });
      }
    } catch (err) {
      console.warn("admin/users/list: profiles read skipped", err);
    }

    // 3. Subscriptions: reduce to the single most relevant sub per user.
    type SubInfo = {
      status: string | null;
      planName: string | null;
      endsAt: string | null;
      renewsAt: string | null;
      createdAt: string;
    };
    const subByUser = new Map<string, SubInfo>();
    try {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("user_id,status,plan_name,ends_at,renews_at,created_at");
      for (const row of subs ?? []) {
        const userId = str(row.user_id);
        if (!userId) continue;
        const candidate: SubInfo = {
          status: str(row.status),
          planName: str(row.plan_name),
          endsAt: str(row.ends_at),
          renewsAt: str(row.renews_at),
          createdAt: str(row.created_at) ?? "",
        };
        const existing = subByUser.get(userId);
        if (!existing) {
          subByUser.set(userId, candidate);
          continue;
        }
        const rankDelta = statusRank(candidate.status) - statusRank(existing.status);
        if (rankDelta > 0 || (rankDelta === 0 && candidate.createdAt > existing.createdAt)) {
          subByUser.set(userId, candidate);
        }
      }
    } catch (err) {
      console.warn("admin/users/list: subscriptions read skipped", err);
    }

    // 4. Cancel reasons: latest churn feedback per user. Only surfaced on rows
    // whose most-relevant sub is actually cancelled.
    type CancelInfo = { reason: string | null; feedback: string | null; createdAt: string | null };
    const cancelByUser = new Map<string, CancelInfo>();
    try {
      const { data: reasons } = await supabase
        .from("subscription_cancel_reasons")
        .select("user_id,reason,feedback,created_at")
        .order("created_at", { ascending: false });
      for (const row of reasons ?? []) {
        const userId = str(row.user_id);
        if (!userId || cancelByUser.has(userId)) continue; // first seen = latest (ordered desc)
        cancelByUser.set(userId, {
          reason: str(row.reason),
          feedback: str(row.feedback),
          createdAt: str(row.created_at),
        });
      }
    } catch (err) {
      console.warn("admin/users/list: cancel reasons read skipped", err);
    }

    // Build account rows.
    const rows: UserRow[] = [];
    const byStatus: Record<string, number> = {};
    for (const u of accounts) {
      const userId = u.id;
      const profile = profileByUser.get(userId);
      const sub = subByUser.get(userId);
      const status = sub?.status ?? null;
      const isCancelled = statusRank(status) === 1;
      const cancel = isCancelled ? cancelByUser.get(userId) ?? null : null;

      const statusKey = (status ?? "none").toLowerCase();
      byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;

      rows.push({
        kind: "account",
        userId,
        email: str(u.email) ?? profile?.email ?? "(no email)",
        name: profile?.name ?? null,
        createdAt: str(u.created_at),
        lastSignInAt: str(u.last_sign_in_at),
        isAffiliate: profile?.isAffiliate ?? false,
        affiliateCode: profile?.affiliateCode ?? null,
        country: profile?.country ?? null,
        hasProfile: Boolean(profile),
        subStatus: status,
        planName: sub?.planName ?? null,
        endsAt: sub?.endsAt ?? null,
        renewsAt: sub?.renewsAt ?? null,
        cancelledAt: cancel?.createdAt ?? (isCancelled ? sub?.endsAt ?? null : null),
        cancelReason: cancel?.reason ?? null,
        cancelFeedback: cancel?.feedback ?? null,
        leadSource: null,
      });
    }

    const accountsCount = rows.length;

    // 5. Leads: known emails with no account. Union newsletter + course captures,
    // then subtract anyone already present as an account.
    const leadByEmail = new Map<string, { source: string | null; createdAt: string | null }>();
    const addLead = (emailRaw: unknown, source: string | null, createdAt: unknown) => {
      const email = str(emailRaw);
      if (!email) return;
      const key = email.toLowerCase();
      if (accountEmails.has(key) || leadByEmail.has(key)) return;
      leadByEmail.set(key, { source, createdAt: str(createdAt) });
    };
    try {
      const { data: subscribers } = await supabase
        .from("email_subscribers")
        .select("email,source,created_at,unsubscribed_at");
      for (const row of subscribers ?? []) {
        addLead(row.email, str(row.source) ?? "newsletter", row.created_at);
      }
    } catch (err) {
      console.warn("admin/users/list: email_subscribers read skipped", err);
    }
    try {
      const { data: course } = await supabase
        .from("course_progress")
        .select("email,series,created_at");
      for (const row of course ?? []) {
        addLead(row.email, str(row.series) ? `course:${str(row.series)}` : "course", row.created_at);
      }
    } catch (err) {
      console.warn("admin/users/list: course_progress read skipped", err);
    }

    for (const [email, lead] of leadByEmail) {
      rows.push({
        kind: "lead",
        email,
        name: null,
        createdAt: lead.createdAt,
        lastSignInAt: null,
        isAffiliate: false,
        affiliateCode: null,
        country: null,
        hasProfile: false,
        subStatus: null,
        planName: null,
        endsAt: null,
        renewsAt: null,
        cancelledAt: null,
        cancelReason: null,
        cancelFeedback: null,
        leadSource: lead.source,
      });
    }

    const leadsCount = leadByEmail.size;

    return NextResponse.json({
      users: rows,
      counts: {
        total: rows.length,
        accounts: accountsCount,
        leads: leadsCount,
        byStatus,
      },
      truncated,
    });
  } catch (error) {
    console.error("admin/users/list failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
