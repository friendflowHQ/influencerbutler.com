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

---

# Round 2

Results of the first send (3+ openers, 1,449 people): 1,449 delivered, 776 opened (53.6%), 90 clicked (6.2%), 1 bounce. The 90 clicks match the 90 people who reached the download (`src=group-mirror-engaged`). Use the "Download clicks" box in the campaign drawer to judge a send, and use ONE unique `?src=` tag per campaign or variant.

## A. First send to people who opened 1 or 2 emails (split test on subject)

Two campaigns, same body, different subject and button tag. Audience for both: **Opened emails, no subscription or trial**, minimum 1, maximum 2. Set **Split test** to Half A on the first, then use **Duplicate** to get Half B (the duplicate flips to the other half automatically). Stream `lifecycle`.

- Campaign A subject: Someone asked for a feature at lunch. It shipped before the game ended.
- Campaign B subject: We built a new Butler in an afternoon

Body (replace `X` with `a` in campaign A and `b` in campaign B):

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

[Try Pro free for 14 days](https://www.influencerbutler.com/go/download?src=group-mirror-light-X)

- The Influencer Butler team

P.S. **Pro pricing goes up at the end of November**, so now is a great time to grab today's price.
```

How to read it: compare opens and the "Download clicks" number for `group-mirror-light-a` vs `group-mirror-light-b`. The halves are the same size, so the bigger number wins. Expect lower numbers than the 3+ group (these people are less engaged); only compare A to B.

## B. Resend to people who did not open the first email

One campaign. Audience: **Did not open an earlier campaign**, then pick "Group Mirror Butler - engaged non-subscribers". Stream `lifecycle`. Planned send: Monday Oct 12, 8:00 PM Mountain (the evening hour that worked), after the first campaign is at least 4 days old.

Subject: In case this got buried: we built a Butler in an afternoon

```
Hi there,

In case my last email got buried, here's the short version.

# We built a new Butler in an afternoon, because a member asked

**Group Mirror Butler** copies the deals your group admins post in a Facebook group straight into Telegram. A Pro member asked for it, and it was built and tested within the hour.

- Tell us what you need
- Pro requests go first, and some are built within a day
- Try it free for 14 days

[Try Pro free for 14 days](https://www.influencerbutler.com/go/download?src=group-mirror-resend)

- The Influencer Butler team

P.S. **Pro pricing goes up at the end of November**, so now is a great time to grab today's price.
```

Some "non-openers" simply blocked the tracking pixel, so a few will have read the first email already.
