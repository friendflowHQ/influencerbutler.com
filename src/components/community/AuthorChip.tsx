/**
 * Author chip used on community Q&A pages — avatar + display name.
 * Falls back gracefully when the user has no profile yet (renders an
 * initials circle and the email prefix as the name).
 */
import type { CommunityAuthor } from "@/lib/community-authors";

type Props = {
  author: CommunityAuthor | null | undefined;
  fallbackEmail?: string | null;
  size?: "sm" | "md";
};

function resolveDisplayName(
  author: CommunityAuthor | null | undefined,
  fallbackEmail: string | null | undefined,
): string {
  const dn = author?.display_name?.trim();
  if (dn) return dn;
  const un = author?.username?.trim();
  if (un) return un;
  const email = (author?.email ?? fallbackEmail ?? "").trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return "Member";
}

function initials(name: string): string {
  const parts = name
    .split(/[\s._-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function AuthorChip({ author, fallbackEmail, size = "md" }: Props) {
  const name = resolveDisplayName(author, fallbackEmail);
  const avatarUrl = author?.avatar_url?.trim() || null;
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <span className="inline-flex items-center gap-2">
      {avatarUrl ? (
        // Avatars bucket is public and CSP allows https://*.supabase.co
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className={`${dim} rounded-full object-cover ring-1 ring-slate-200`}
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className={`${dim} inline-flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ring-1 ring-slate-200`}
        >
          {initials(name)}
        </span>
      )}
      <span className="text-sm font-medium text-slate-800">{name}</span>
    </span>
  );
}
