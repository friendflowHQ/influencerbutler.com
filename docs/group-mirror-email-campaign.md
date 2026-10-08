# Group Mirror Butler email campaign (engaged non-subscribers)

Audience: **Opened emails, no subscription or trial**, minimum emails opened **3**. That is everyone who opened more than two of our emails and has no active subscription or trial (churned people who opened 3+ are included). Stream: `lifecycle`.

Campaign bodies that use light markup are sent as formatted HTML (with a clean plain-text version). Markup used here:

- `**bold**`
- `# Heading` on its own line
- two or more `- ` lines in a row make a bullet list (a single `- ` sign-off line stays a normal line)
- a line that is only `[Button label](https://...)` becomes a call-to-action button
- plain `https://...` links are linked automatically

## Subject options

1. Someone asked for a feature at lunch. It shipped before the game ended.
2. We built a new Butler in an afternoon

## Body

```
Hi there,

# Someone asked for a new Butler this afternoon. It was built and tested before the baseball game ended.

A member told us in the Pro Lounge that her group admins post deals in a Facebook group, and she wanted every one of them to land in Telegram automatically. We passed it to the team, and within the hour it was ready. (I watched my son's baseball game the whole time.)

It's called **Group Mirror Butler**. It lives inside your Telegram Butler, and it's in the latest release.

**That's how we work: you tell us what you need, and we build it.**

- You send us a request, like the one above
- Pro requests go first, and some are built within a day
- You can even make a request during your 14-day trial, depending on the current request log

You could hire a developer for thousands of dollars and wait weeks. Or you can be a Pro member for $39/month (less with an affiliate promo code).

[Try Pro free for 14 days](https://www.influencerbutler.com/go/download?src=group-mirror-engaged)

- The Influencer Butler team

P.S. **Pro pricing goes up at the end of November**, so now is a great time to grab today's price.
```

## Before sending

- Send a **test** to yourself and check it in Gmail on desktop and phone: heading, bold, bullets, orange button, P.S., footer with unsubscribe and postal address.
- Check the audience count in the composer (about 1.4k expected).
- Campaigns drain at 100 per 5-minute run, so about an hour for the full list.

## Notes

- Group Mirror and Telegram Butler are Pro features (not in the free list in `src/lib/entitlements.ts`).
- Formatted campaigns ship as HTML, so opens and clicks are tracked. Also use the `src=group-mirror-engaged` link tag in the funnel stats.
- No competitors are named, per the public-page naming policy.
