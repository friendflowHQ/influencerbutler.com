/**
 * /p/<code>: a private Storefront Score page (invite pilot).
 *
 * Unlisted and noindex: the code only ever went to the creator's own inbox.
 * Built from the handle and public storefront facts only: no photos, no copied
 * posts, nothing from Amazon or Walmart's own branding. The tone is "here's
 * what you can unlock": the score, what it measures, ONE fix in full, the
 * other fixes by title only. Claiming (ClaimPanel) reveals the full report and
 * starts the trial. "Remove my page" deletes it on the spot. A visit counts as
 * "viewed"; TimeBeacon reports time on page.
 */
import type { Metadata } from "next";
import {
  INVITE_LIST_COLUMNS,
  advanceInvite,
  formatInviteDate,
  inviteDb,
  isExpired,
  isValidInviteCode,
  type InviteRow,
} from "@/lib/foyer-invites";
import ClaimPanel, { RemovePageButton, TimeBeacon } from "./ClaimPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Storefront Score",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const COMPONENT_LABELS: Record<string, { label: string; what: string }> = {
  lists: { label: "Idea lists", what: "Themed lists on your storefront" },
  video: { label: "Video coverage", what: "Videos on the products you feature most" },
  campaigns: { label: "Campaign products", what: "Open campaigns from brands you already post" },
  recency: { label: "Fresh posts", what: "How recently your storefront got a new post" },
};

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen bg-orange-50 px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <div className="mt-3 text-slate-700">{children}</div>
      </div>
    </main>
  );
}

export default async function InvitePreviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidInviteCode(code)) return <Notice title="We could not find that page">Please check the link in your email.</Notice>;

  const db = inviteDb();
  if (!db) return <Notice title="Something went wrong">Please try again in a few minutes.</Notice>;
  const { data } = await db
    .from("foyer_invites")
    .select(`${INVITE_LIST_COLUMNS}, preview_html`)
    .eq("code", code)
    .maybeSingle();
  const invite = data as unknown as (InviteRow & { preview_html: string | null }) | null;
  if (!invite) return <Notice title="We could not find that page">Please check the link in your email.</Notice>;
  if (invite.status === "removed") {
    return <Notice title="This page was removed">It is gone for good, and you will not hear from us again.</Notice>;
  }
  if (invite.status === "declined" || isExpired(invite) || !invite.score) {
    return <Notice title="This page is no longer available">If you would like it back, just reply to Liz&apos;s email.</Notice>;
  }

  // Count the visit (the admin review route does not, so reviews never inflate this).
  await db
    .from("foyer_invites")
    .update({ view_count: (invite.view_count ?? 0) + 1, viewed_at: invite.viewed_at ?? new Date().toISOString() })
    .eq("id", invite.id);
  if (invite.status === "drafted" || invite.status === "sent") await advanceInvite(db, invite, "viewed");

  const score = invite.score;
  const claimed = Boolean(invite.claimed_at);
  const fixes = Array.isArray(score.fixes) ? score.fixes : [];
  const shown = claimed ? fixes : fixes.slice(0, 1);
  const locked = claimed ? [] : fixes.slice(1);
  const expires = formatInviteDate(invite.expires_at);

  return (
    <main id="main-content" className="min-h-screen bg-orange-50 px-4 py-8">
      <TimeBeacon code={code} />
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-800">Made for @{invite.ig_handle}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Your Storefront Score</h1>
        <p className="mt-2 max-w-2xl text-slate-700">
          Liz at Influencer Butler put this together from your public Amazon storefront only. It is private: only
          someone with the link from your email can see it.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
          <section aria-label="Your score" className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="text-6xl font-bold text-slate-900">{score.score}</div>
            <div className="mt-1 text-sm text-slate-600">out of 100</div>
            <ul className="mt-6 space-y-3 text-left">
              {Object.entries(score.components || {}).map(([key, c]) => {
                const meta = COMPONENT_LABELS[key] ?? { label: key, what: "" };
                const pct = c.max ? Math.round((c.points / c.max) * 100) : 0;
                return (
                  <li key={key}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-800">{meta.label}</span>
                      <span className="text-slate-600">
                        {c.points}/{c.max}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-2 rounded-full bg-orange-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{meta.what}</div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="What you can unlock" className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">What you can unlock</h2>
            <ol className="mt-4 space-y-5">
              {shown.map((f, i) => (
                <li key={f.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-orange-800">#{i + 1}</div>
                  <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-slate-700">{f.why}</p>
                  <p className="mt-2 text-slate-700">
                    <span className="font-medium">With Influencer Butler:</span> {f.withButler}
                  </p>
                  {f.byHandNote ? <p className="mt-1 text-sm text-slate-600">By hand: {f.byHandNote}.</p> : null}
                </li>
              ))}
              {locked.map((f, i) => (
                <li key={f.id} className="rounded-xl border border-dashed border-slate-300 p-4">
                  <div className="text-sm font-semibold text-slate-500">#{i + 2}</div>
                  <h3 className="text-lg font-semibold text-slate-800">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">Claim your page to see the details and how to do it.</p>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <ClaimPanel code={code} alreadyClaimed={claimed} />
            </div>
          </section>
        </div>

        {invite.preview_html ? (
          <section aria-label="Your link-in-bio page" className="mt-8 grid gap-6 md:grid-cols-[1fr_400px] md:items-start">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Your link-in-bio page is ready too</h2>
              <p className="mt-2 text-slate-700">
                Claiming also gives you this page, already filled with your storefront and idea lists, plus 14 days of
                Influencer Butler Power User free, no card. Nothing goes live until you press Publish, and you can change
                anything on it.
              </p>
            </div>
            <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white shadow-xl">
              <iframe
                title={`Draft page for @${invite.ig_handle}`}
                srcDoc={invite.preview_html}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="h-[640px] w-full border-0"
              />
            </div>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-orange-200 pt-6 text-sm text-slate-600">
          <p>
            Built only from public storefront data. Influencer Butler is not affiliated with or endorsed by Amazon or
            Walmart.
          </p>
          {expires && !claimed ? <p className="mt-1">This page is deleted automatically on {expires}.</p> : null}
          <div className="mt-3">
            <RemovePageButton code={code} />
          </div>
        </footer>
      </div>
    </main>
  );
}
