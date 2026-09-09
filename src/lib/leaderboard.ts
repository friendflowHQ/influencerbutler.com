import { createAdminClient } from "@/lib/supabase/admin";
import fallback from "../../content/leaderboard.json";

/**
 * Public "Top Affiliates" leaderboard data.
 *
 * Ranks affiliates by referral count: the number of profiles rows stamped with
 * their ref_affiliate_user_id (first-touch signup attribution, migration
 * 20260719). Reads MUST use the service-role admin client - those profiles
 * belong to OTHER users and profiles has no public SELECT of other people's
 * rows.
 *
 * Privacy: only referral COUNT is public. A name is shown only when the
 * affiliate has opted in (profiles.public_leaderboard_opt_in, migration
 * 20260908); otherwise the entry is masked to initials (e.g. "A.M."). Emails
 * and full legal names are never emitted.
 *
 * Degrades gracefully: any failure (missing env, query error, opt-in column
 * not yet applied in prod, empty program) falls back to the hand-editable
 * entries in content/leaderboard.json so the board is never blank or broken.
 */

export type LeaderboardEntry = {
  rank: number;
  name: string;
  referrals: number;
  /** true when the affiliate opted in and is shown by their chosen handle. */
  claimed: boolean;
  /** true for an unfilled rank shown as an open "claim this spot" slot. */
  placeholder?: boolean;
  trend?: "up" | "down" | "new";
};

export type PublicLeaderboard = {
  entries: LeaderboardEntry[];
  /** ISO timestamp (live) or the JSON lastUpdated date string (fallback). */
  updatedAt: string;
  source: "live" | "fallback";
};

// Cap on attribution rows scanned in one pass. PostgREST has no GROUP BY, so we
// count in JS (same approach as admin-roster). Comfortably covers the current
// program; revisit with an RPC if referred signups ever exceed this.
const MAX_ATTRIBUTION_ROWS = 10000;

function maskInitials(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const first = tokens[0]?.[0] ?? "";
  const last = tokens.length > 1 ? tokens[tokens.length - 1]?.[0] ?? "" : "";
  const initials = `${first}${last}`.toUpperCase().replace(/[^A-Z]/g, "");
  if (!initials) return null;
  return initials.split("").join(".") + ".";
}

function fallbackBoard(): PublicLeaderboard {
  const entries = ([...(fallback.entries ?? [])] as Array<{
    rank: number;
    name: string;
    referrals: number;
    trend?: "up" | "down" | "new";
  }>)
    .sort((a, b) => a.rank - b.rank)
    .map((e) => ({ ...e, claimed: true }));
  return { entries, updatedAt: fallback.lastUpdated, source: "fallback" };
}

export async function loadPublicLeaderboard(limit = 5): Promise<PublicLeaderboard> {
  // One-field switch in content/leaderboard.json. "manual" serves the
  // hand-edited entries (full control, e.g. during a launch push); "live"
  // ranks real affiliates by referral count. Anything other than "live" is
  // treated as manual so the public board never surprises you.
  if ((fallback as { mode?: string }).mode !== "live") {
    return fallbackBoard();
  }

  try {
    const admin = createAdminClient();

    // 1. Pull attribution stamps and count referrals per affiliate in JS.
    const { data: attrRows, error: attrErr } = await admin
      .from("profiles")
      .select("ref_affiliate_user_id")
      .not("ref_affiliate_user_id", "is", null)
      .range(0, MAX_ATTRIBUTION_ROWS - 1);
    if (attrErr) {
      console.warn("leaderboard: attribution read failed, using fallback", attrErr);
      return fallbackBoard();
    }

    const counts = new Map<string, number>();
    for (const row of (attrRows ?? []) as Array<{ ref_affiliate_user_id: string | null }>) {
      const id = row.ref_affiliate_user_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (counts.size === 0) {
      // Program has no attributed signups yet: show the seeded fallback so the
      // board still reads as a live challenge rather than an empty page.
      return fallbackBoard();
    }

    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    const ids = ranked.map(([id]) => id);

    // 2. Resolve each ranked affiliate's public identity + opt-in state.
    //    Tolerate a prod that lacks the 20260908 opt-in column (retry without).
    type ProfileInfo = {
      id: string;
      username: string | null;
      display_name: string | null;
      public_leaderboard_opt_in?: boolean | null;
    };
    let profiles: ProfileInfo[] = [];
    const withOptIn = await admin
      .from("profiles")
      .select("id,username,display_name,public_leaderboard_opt_in")
      .in("id", ids);
    if (withOptIn.error) {
      const reduced = await admin
        .from("profiles")
        .select("id,username,display_name")
        .in("id", ids);
      profiles = (reduced.data ?? []) as ProfileInfo[];
    } else {
      profiles = (withOptIn.data ?? []) as ProfileInfo[];
    }
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // full_name (private) is used ONLY to derive masked initials, never emitted.
    const { data: apps } = await admin
      .from("affiliate_applications")
      .select("user_id,full_name")
      .in("user_id", ids);
    const fullNameById = new Map(
      ((apps ?? []) as Array<{ user_id: string; full_name: string | null }>).map((a) => [
        a.user_id,
        a.full_name,
      ]),
    );

    const entries: LeaderboardEntry[] = ranked.map(([id, referrals], idx) => {
      const p = profileById.get(id);
      const optedIn = p?.public_leaderboard_opt_in === true;
      const handle = p?.username ? `@${p.username}` : p?.display_name ?? null;
      const masked =
        maskInitials(fullNameById.get(id) ?? p?.display_name ?? null) ?? "Affiliate";
      return {
        rank: idx + 1,
        name: optedIn && handle ? handle : masked,
        referrals,
        claimed: optedIn && Boolean(handle),
      };
    });

    // Keep the board full: pad any unfilled ranks with honest "open spot" rows
    // (a claim-your-spot invite, not fabricated stats) so a young board still
    // reads as a Top 5 and nudges the end-of-month push.
    for (let rank = entries.length + 1; rank <= limit; rank++) {
      entries.push({ rank, name: "Open spot", referrals: 0, claimed: false, placeholder: true });
    }

    return { entries, updatedAt: new Date().toISOString(), source: "live" };
  } catch (err) {
    console.warn("leaderboard: live load threw, using fallback", err);
    return fallbackBoard();
  }
}
