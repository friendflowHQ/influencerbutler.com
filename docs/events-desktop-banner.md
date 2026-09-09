# Events: desktop app banner (handoff for the Electron repo)

The website now has an Events system (scheduled group calls with RSVP, cross-app
banners, day-before reminders, and an AI recap). The web dashboard banner and the
Chrome extension notice are wired up in the website repo. This doc covers the one
remaining surface: the desktop Electron app (`Documents/GitHub/InfluencerButler`),
which lives in a separate repo and is not committed from the website repo.

## The shared feed

The website serves a public, CORS-enabled, edge-cached announcements feed:

```
GET https://www.influencerbutler.com/api/announcements?surface=desktop
```

Response:

```json
{
  "banners": [
    {
      "id": "8b1e...",
      "text": "Join our Prime Big Deals Day strategy call, Thursday at 11am MT.",
      "ctaLabel": "Register",
      "ctaUrl": "https://www.influencerbutler.com/dashboard/events",
      "startsAt": "2026-09-24T17:00:00.000Z",
      "endsAt": "2026-09-24T19:00:00.000Z"
    }
  ]
}
```

- `banners` is empty when nothing is active. Only events whose banner is enabled,
  targeted at the `desktop` surface, and inside the banner window are returned.
- The admin schedules the event and controls the banner text, target surfaces, and
  window from the website admin (`/dashboard/admin/events`). No desktop redeploy is
  needed to change or clear a banner.
- The feed is cached ~2 minutes at the edge with a content-hash `ETag`. Send
  `If-None-Match` with the last ETag to get a cheap `304`.

## Recommended desktop wiring

Poll on an interval (about every 15 minutes is plenty), dedupe by `id`, and show a
dismissable banner. Persist the dismissed ids so a dismissed banner does not
reappear until it changes. Sketch (main or renderer, adapt to the app's patterns):

```ts
const FEED = "https://www.influencerbutler.com/api/announcements?surface=desktop";
let lastEtag: string | null = null;

async function pollAnnouncements(): Promise<void> {
  try {
    const res = await fetch(FEED, {
      headers: lastEtag ? { "If-None-Match": lastEtag } : {},
    });
    if (res.status === 304) return; // nothing changed
    lastEtag = res.headers.get("ETag");
    const { banners } = (await res.json()) as {
      banners: { id: string; text: string; ctaLabel: string | null; ctaUrl: string }[];
    };
    const dismissed = loadDismissedIds(); // from local settings/store
    const next = banners.find((b) => !dismissed.includes(b.id));
    if (next) showEventBanner(next); // your existing banner UI (see whats-new toast)
    else hideEventBanner();
  } catch {
    // network blip: keep whatever is showing, try again next tick
  }
}

// setInterval(pollAnnouncements, 15 * 60_000); + one call on app ready
```

Reuse the app's existing "What's New" toast styling for consistency. The CTA button
should open `ctaUrl` in the user's browser (the dashboard Upcoming Events page,
which is login-gated so the RSVP captures their email).

## Notes

- No new website env vars are required. The feed reads the same `events` table the
  admin tool writes to.
- The extension already gets the same banner text through its existing flags feed
  (`/api/extension/flags`, the `notice` field), so no extension change is needed for
  installed users.
