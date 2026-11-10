/**
 * /p/<code>: the private preview of a done-for-you Foyer page (invite pilot).
 *
 * Unlisted and noindex: the code only ever went to the creator's own inbox.
 * Nothing here is published under the creator's name; the draft is shown in a
 * sandboxed, script-free frame under a banner that says plainly who made it and
 * why. A visit moves the invite to "viewed"; Claim lives in ClaimPanel.
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
import ClaimPanel from "./ClaimPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your page preview",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
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
  const invite = data as unknown as (InviteRow & { preview_html: string }) | null;
  if (!invite) return <Notice title="We could not find that page">Please check the link in your email.</Notice>;
  if (invite.status === "declined") {
    return <Notice title="This preview is closed">If you would like it back, just reply to Liz&apos;s email.</Notice>;
  }
  if (isExpired(invite)) {
    return (
      <Notice title="This preview has expired">
        No problem: reply to Liz&apos;s email and she will happily reopen it for you.
      </Notice>
    );
  }

  // Count the visit (the admin preview route does not, so reviews never inflate this).
  await db
    .from("foyer_invites")
    .update({ view_count: (invite.view_count ?? 0) + 1, viewed_at: invite.viewed_at ?? new Date().toISOString() })
    .eq("id", invite.id);
  if (invite.status === "drafted" || invite.status === "sent") await advanceInvite(db, invite, "viewed");

  const name = invite.first_name || `@${invite.ig_handle}`;
  const expires = formatInviteDate(invite.expires_at);

  return (
    <main id="main-content" className="min-h-screen bg-orange-50 px-4 py-8">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_400px] md:items-start">
        <section className="order-2 md:order-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-700">Made for @{invite.ig_handle}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{name}, this page is yours if you want it</h1>
          <p className="mt-3 text-slate-700">
            Liz at Influencer Butler put this together from your public bio and the links you already share. Every link on
            it is one of your own, exactly as you posted it. Nothing is live or public until you claim it and press Publish.
          </p>
          <ul className="mt-5 space-y-2 text-slate-700">
            <li>One link for your bio that holds your shops, codes and freebies.</li>
            <li>An email sign-up so you own your audience, not just your followers.</li>
            <li>Change anything in a couple of clicks: colors, text, links and photos.</li>
            <li>14 days of Influencer Butler Power User, free. No card needed.</li>
          </ul>
          <div className="mt-6">
            <ClaimPanel code={code} />
          </div>
          {expires ? <p className="mt-4 text-sm text-slate-600">This private preview stays up until {expires}.</p> : null}
          <p className="mt-2 text-sm text-slate-600">
            Not interested? Simply ignore it. Questions? Reply to Liz&apos;s email, she reads every one.
          </p>
        </section>
        <section className="order-1 md:order-2" aria-label="Your page preview">
          <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white shadow-xl">
            <iframe
              title={`Preview of the page made for @${invite.ig_handle}`}
              srcDoc={invite.preview_html}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="h-[720px] w-full border-0"
            />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">Preview only. Buttons go live after you claim it.</p>
        </section>
      </div>
    </main>
  );
}
