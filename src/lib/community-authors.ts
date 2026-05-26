/**
 * Resolve community author_ids to their public profile fields
 * (display_name, username, avatar_url). The profiles table's RLS only
 * permits own-profile reads, so we go through the service-role admin
 * client to read the safe public fields server-side and ship them down
 * with the rendered page.
 */
import { createAdminClient } from "./admin";

export type CommunityAuthor = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
};

type AdminProfileClient = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (
        col: string,
        values: string[],
      ) => Promise<{
        data: Array<{
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
          email?: string | null;
        }> | null;
        error: unknown;
      }>;
    };
  };
};

/**
 * Look up profile rows for every author_id passed in. Returns a Map
 * keyed by author_id. Missing/unresolved ids are simply absent from
 * the Map (caller falls back to the chip's defaults).
 *
 * Safe to pass an array with duplicate or null ids — they're filtered.
 */
export async function resolveCommunityAuthors(
  authorIds: Array<string | null | undefined>,
): Promise<Map<string, CommunityAuthor>> {
  const ids = Array.from(
    new Set(
      authorIds.filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (ids.length === 0) return new Map();

  const supabase = createAdminClient() as unknown as AdminProfileClient | null;
  if (!supabase) return new Map();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, email")
      .in("id", ids);
    if (error || !data) return new Map();
    const map = new Map<string, CommunityAuthor>();
    for (const row of data) {
      map.set(row.id, {
        id: row.id,
        display_name: row.display_name ?? null,
        username: row.username ?? null,
        avatar_url: row.avatar_url ?? null,
        email: row.email ?? null,
      });
    }
    return map;
  } catch (err) {
    console.error("resolveCommunityAuthors failed", err);
    return new Map();
  }
}
