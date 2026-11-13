/**
 * Price lock push emails (Nov 12 - Nov 30 2026). Each entry becomes one DRAFT
 * campaign (POST /api/admin/emails/price-lock action "create-drafts"). Nothing
 * is scheduled until the owner approves a batch and schedules it.
 *
 * Copy rules (owner, 2026-11-11): from Liz, short, warm, peer to peer, no em
 * dashes, no "Dear", one button, no income promises (time saved and posting
 * consistently only), only real feature names. Bodies use campaign markup
 * (src/lib/campaign-email.ts): **bold** turns on the HTML body (needed for the
 * button and click tracking), a line that is only [Label](url) is the button.
 * The unsubscribe footer and postal address are appended by sendMarketingEmail.
 *
 * {{KEEP_PLAN_URL}} is replaced per recipient with their comp's Keep my plan
 * link (delayed first charge), see personalizePriceLockBody.
 */
import type { PriceLockSegment } from "@/lib/price-lock-audience";

const SITE = "https://www.influencerbutler.com";

export type PriceLockEmail = {
  /** Stable key, also the click tag (src=) and the campaign name suffix. */
  key: string;
  /** Pacific date + hour the send starts. */
  date: string;
  hour: number;
  segments: PriceLockSegment[];
  subject: string;
  body: string;
  /** Nov 30 6pm: only people who did not click this morning's send(s). */
  excludeClickersOf?: string[];
  /** The one exception to one-email-a-day (Nov 30 6pm). */
  allowSecondToday?: boolean;
  /** Sent on the cold stream (separate sending domain). */
  cold?: boolean;
  /** Long-form emails offer monthly and annual buttons (owner request 2026-11-11). */
  maxButtons?: number;
  /** B only: paying monthly subscribers (gets {{ANNUAL_OFFER}}). */
  monthlyOnly?: boolean;
};

/**
 * Big partner lists that sit in segment A only because they were enrolled
 * into a sequence (counts on 2026-11-11: Instagram Posse 33,461, Dani Austin
 * giveaway 23,772). Left out of every A send until the owner decides.
 */
export const DEFAULT_EXCLUDED_ORIGINS: readonly string[] = ["instagram-posse", "dani-austin-giveaway"];

const pricing = (src: string) => `${SITE}/pricing?src=${src}`;

const PRICES_TODAY = `- Beginner: $24.99 a month today, $29.99 after Nov 30
- Power User: $39 a month today, $49 after Nov 30`;

// What Launch Butler does today, in plain words. Every claim is in the shipped
// desktop app (workspaces/group-launch, live for every plan since v2.1.11).
const LAUNCH_BUTLER_LINE =
  "You answer a few questions about your niche, and it does the setup that used to take hours: your Facebook Page and group, your branding and graphics, and a deal posting schedule that starts slow and ramps up on its own.";


// ---------------------------------------------------------------------------
// Long-form "price lock" sections (format modelled on a high-converting creator
// launch email: emoji headers, two options with real savings math, a "what you
// get" list, then urgency). Every number is our own price list; every feature
// is shipped. Savings are what the customer keeps, never income.
// ---------------------------------------------------------------------------
const LAUNCH_SECTION = `# 🛎️ YOU DON'T HAVE TO SET IT UP YOURSELF

The #1 thing I hear is "I just want it to work, I don't have time to learn it."

So we built **Launch Butler**. You answer a few questions about your niche, and it does the setup that used to take hours:
🎩 Your Facebook Page and group, created for you
🎨 Your branding, cover and profile graphics
📦 A deal posting schedule that starts slow and ramps up on its own
🛍️ Your own Foyer shop page
💬 Comment to DM, so people who comment get your link in their inbox

It's included on every plan! 🧡`;

const OPTIONS_SECTION = (src: string) => `# 🔒 OPTION 1: LOCK IN TODAY'S MONTHLY PRICE

✨ Beginner: **$24.99 a month** (going to $29.99)
✨ Power User: **$39 a month** (going to $49)
✨ That's $60 to $120 a year you keep, every year you stay
✨ Your price stays put even after Nov 30!

# 🎩 OPTION 2: LOCK IN A WHOLE YEAR

✨ Power User for **$390 a year** (going to $490)
✨ That works out to just **$32.50 a month**!
✨ Compared to $49 a month after Nov 30 ($588 a year), you save $198. That's 34% off!
✨ Beginner for **$249 a year** (going to $299)`.replace(/\{src\}/g, src);

const INSIDE_SECTION = `# 🤵 HERE'S WHAT YOUR BUTLER HANDLES FOR YOU

📦 **Deals on autopilot:** finds deals and posts them to your Page and group on a schedule
🔗 **Branded affiliate links:** built in, no separate link tool
💬 **Comment to DM:** built in, no separate DM tool
🛍️ **Foyer:** your own shop and download page
🎥 **Live group calls:** bring your questions, with replays if you can't make it
📞 **1:1 calls:** included on Power User`;

const DONT_WAIT_SECTION = `# ⏰ ONE LAST THING... PLEASE DON'T WAIT!

The new prices start right after Black Friday weekend, at **11:59pm Pacific on Nov 30**. Once that clock runs out, today's price is gone for new subscriptions.

So if you've been curious, watching from the sidelines, or wishing someone would just set it up for you... this is your sign! 🎩`;

export const PRICE_LOCK_EMAILS: readonly PriceLockEmail[] = [
  // ---------------------------------------------------------------- Thu Nov 12, 12pm
  {
    key: "pl-1112-a",
    date: "2026-11-12",
    hour: 12,
    segments: ["A"],
    subject: "🎩 Prices go up Nov 30. Lock in today's price forever! 🔒",
    body: `Preheader: Your price stays put as long as you stay, and Launch Butler does the setup for you ✨

Hi there! 👋

Okay, I have some big news and I wanted YOU to hear it from me first!!

**Influencer Butler prices go up after Nov 30 at 11:59pm Pacific.** But if you start before then, you keep today's price for as long as you stay subscribed. Even after the price goes up! 🔒

And before you think "this isn't for me, I never figured out the setup"... PLEASE keep reading! 🙏

${LAUNCH_SECTION}

${OPTIONS_SECTION("pl-1112-a")}

${INSIDE_SECTION}

# 🥹 YOU DON'T HAVE TO HAVE IT ALL FIGURED OUT

I know how overwhelming it feels when you're starting out. There are so many moving pieces, and finding the time to learn them all is the hardest part.

That's exactly why Butler exists: to take the repetitive work off your plate so you can post consistently without living on your phone.

${DONT_WAIT_SECTION}

[🔒 Lock in my monthly price](${pricing("pl-1112-a-monthly")})

[🎩 Lock in a whole year](${pricing("pl-1112-a-annual")})

The trial is free for 14 days, and you can cancel any time before it ends.

Liz 🧡

P.S. You don't need a big following or any tech skills to start. Launch Butler handles the setup, and your price is locked for as long as you stay! 🧡`,
    maxButtons: 2,
  },
  {
    key: "pl-1112-d",
    date: "2026-11-12",
    hour: 12,
    segments: ["D"],
    subject: "🎩 You said it was too much to set up. So we fixed it!",
    body: `Preheader: Launch Butler does the setup for you now, and today's price is yours if you come back by Nov 30 🔒

Hi there! 👋

When someone cancels, I read every single answer. And the one I hear most is some version of "it was too complicated, and I didn't have time to learn it."

That's fair. **We listened, and we built something just for that.** 🧡

${LAUNCH_SECTION}

And here's the timing part: **prices go up after Nov 30 at 11:59pm Pacific.** If you come back before then, you keep today's price for as long as you stay. Even after the price goes up! 🔒

${OPTIONS_SECTION("pl-1112-d")}

${INSIDE_SECTION}

${DONT_WAIT_SECTION}

[🔒 Come back at today's monthly price](${pricing("pl-1112-d-monthly")})

[🎩 Come back for a whole year](${pricing("pl-1112-d-annual")})

The trial is free for 14 days, and you can cancel any time before it ends.

Liz 🧡

P.S. If you'd rather talk it through with a person first, just reply to this email. It comes straight to us! 🛎️`,
    maxButtons: 2,
  },
  {
    key: "pl-1112-b",
    date: "2026-11-12",
    hour: 12,
    segments: ["B"],
    subject: "You're locked in",
    body: `Hi,

I wanted you to hear this from me first: prices for new Influencer Butler subscriptions go up after **Nov 30**.

Nothing changes for you. You keep your current price for as long as you stay subscribed, and there's nothing you need to do.

If you haven't tried Launch Butler yet, it's in the app now. ${LAUNCH_BUTLER_LINE} Your plan includes one free launch.

[See how Launch Butler works](${SITE}/help/tutorials/group-launch?src=pl-1112-b)

Thank you for being here.

Liz`,
  },
  {
    key: "pl-1112-c",
    date: "2026-11-12",
    hour: 12,
    segments: ["C"],
    subject: "Keep today's price (no charge until your free time ends)",
    body: `Hi {{FIRST_NAME}},

You're on free time with Influencer Butler right now, so I wanted to give you a heads up.

Prices for new subscriptions go up after **Nov 30 at 11:59pm Pacific**. If you add a card by then:

🎁 Your free time rides out. Nothing is charged until your free time ends.
🔒 Your price is locked for as long as you stay subscribed.
📅 That includes switching to annual later (at today's annual price) or moving up to a bigger plan (at that plan's price today).

[Keep today's price]({{KEEP_PLAN_URL}})

If you add it after Nov 30, you can still keep going, just at the new price.

Liz`,
  },
  // Resend of pl-1112-c from the main address (owner, 2026-11-13) to comps who
  // still have not added a card. Same audience rules, re-checked at send time.
  {
    key: "pl-1113-c",
    date: "2026-11-13",
    hour: 12,
    segments: ["C"],
    subject: "Keep today's price (no charge until your free time ends)",
    body: `Hi {{FIRST_NAME}},

You're on free time with Influencer Butler right now, so I wanted to give you a heads up.

Prices for new subscriptions go up after **Nov 30 at 11:59pm Pacific**. If you add a card by then:

🎁 Your free time rides out. Nothing is charged until your free time ends.
🔒 Your price is locked for as long as you stay subscribed.
📅 That includes switching to annual later (at today's annual price) or moving up to a bigger plan (at that plan's price today).

[Keep today's price]({{KEEP_PLAN_URL}})

If you add it after Nov 30, you can still keep going, just at the new price.

Liz`,
  },

  // ---------------------------------------------------------------- Tue Nov 17, 12pm
  {
    key: "pl-1117-a",
    date: "2026-11-17",
    hour: 12,
    segments: ["A"],
    subject: "Let Butler set it up for you",
    body: `Hi,

If you've been putting this off because setup sounds like a weekend you don't have, this one's for you.

**Launch Butler does the setup for you.** ${LAUNCH_BUTLER_LINE}

No VA to train, no tutorials to binge first. You pick your niche, your name and your colors, and it handles the busywork.

Prices go up after Nov 30, and anyone who starts before then keeps today's price.

[Let Butler set it up](${pricing("pl-1117-a")})

Liz`,
  },
  {
    key: "pl-1117-d",
    date: "2026-11-17",
    hour: 12,
    segments: ["D"],
    subject: "If someone set it up for you, would you come back?",
    body: `Hi,

A few people who left told us, "if someone set it up for me, I'd come back in a heartbeat." So that's what we built.

**Launch Butler does the setup for you.** ${LAUNCH_BUTLER_LINE}

You keep control: you pick the niche, names and colors, and you can turn things off any time.

Come back before Nov 30 and you keep today's price for as long as you stay.

[Let Butler set it up](${pricing("pl-1117-d")})

Liz`,
  },

  // ---------------------------------------------------------------- Tue Nov 24, 12pm
  {
    key: "pl-1124-bm",
    date: "2026-11-24",
    hour: 12,
    segments: ["B"],
    monthlyOnly: true,
    subject: "🔒 Want a whole year at today's price?",
    body: `Preheader: Your monthly price stays locked, and so does today's annual price whenever you switch ✨

Hi there! 👋

Quick one, since you're on a monthly plan.

Your monthly price is locked in for as long as you stay. That doesn't change! 🧡

And if you've been thinking about going annual, **your annual price is locked too**. Switch now or any time later, even after Nov 30, and you get today's annual price, not the new one.

{{ANNUAL_OFFER}}

[🔒 Switch to annual](${SITE}/dashboard/subscription?src=pl-1124-bm)

It's one click in your dashboard, and the unused part of this month is credited toward your year.

Liz 🧡

P.S. Happy staying monthly? You don't need to do a thing. Your price is locked either way.`,
  },
  {
    key: "pl-1124-ad",
    date: "2026-11-24",
    hour: 12,
    segments: ["A", "D"],
    subject: "6 days left (get set up before Black Friday)",
    body: `Hi,

Black Friday week is the busiest deal week of the year, and it's a lot easier when your posts go out on schedule without you babysitting them.

If you start now, Launch Butler can have your Page, group and posting schedule set up before the rush.

And there are **6 days left** to lock today's price:

${PRICES_TODAY}

[Get set up before Black Friday](${pricing("pl-1124-ad")})

Liz`,
  },
  {
    key: "pl-1124-c",
    date: "2026-11-24",
    hour: 12,
    segments: ["C"],
    subject: "6 days left to keep today's price",
    body: `Hi {{FIRST_NAME}},

Quick reminder: there are **6 days left** to keep today's price.

Add a card by Nov 30 at 11:59pm Pacific and your free time still rides out: nothing is charged until it ends. After that your price stays locked for as long as you stay subscribed, including if you switch to annual.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },

  // ---------------------------------------------------------------- Sun Nov 29, 12pm
  {
    key: "pl-1129-ad",
    date: "2026-11-29",
    hour: 12,
    segments: ["A", "D"],
    subject: "Tomorrow",
    body: `Hi,

Just a short one: prices go up after **tomorrow, Nov 30 at 11:59pm Pacific**.

Start your free trial before then and you keep today's price for as long as you stay.

[Lock today's price](${pricing("pl-1129-ad")})

Liz`,
  },
  {
    key: "pl-1129-c",
    date: "2026-11-29",
    hour: 12,
    segments: ["C"],
    subject: "Tomorrow is the last day to keep today's price",
    body: `Hi {{FIRST_NAME}},

Short one: **tomorrow, Nov 30**, is the last day to keep today's price.

Add a card and you're set. Your free time rides out with no charge until it ends, and your price stays locked as long as you stay, annual included.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },

  // ---------------------------------------------------------------- Mon Nov 30, 8am
  {
    key: "pl-1130am-ad",
    date: "2026-11-30",
    hour: 8,
    segments: ["A", "D"],
    subject: "Last day for today's price",
    body: `Hi,

Today's the day. Prices go up for new subscriptions **tonight at 11:59pm Pacific**.

${PRICES_TODAY}

Start your free trial today and you keep today's price for as long as you stay. Launch Butler can take it from there.

[Lock today's price](${pricing("pl-1130am-ad")})

Liz`,
  },
  {
    key: "pl-1130am-c",
    date: "2026-11-30",
    hour: 8,
    segments: ["C"],
    subject: "Last day to keep today's price",
    body: `Hi {{FIRST_NAME}},

Today's the last day. Add a card **by 11:59pm Pacific tonight** and you keep today's price for as long as you stay, including if you switch to annual. Still no charge until your free time ends.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },

  // ---------------------------------------------------------------- Mon Nov 30, 6pm
  {
    key: "pl-1130pm-ad",
    date: "2026-11-30",
    hour: 18,
    segments: ["A", "D"],
    subject: "Final hours",
    body: `Hi,

A few hours left. At **11:59pm Pacific tonight** prices go up for new subscriptions.

If you've been meaning to try it, this is the moment to lock today's price.

[Lock today's price](${pricing("pl-1130pm-ad")})

Liz`,
    excludeClickersOf: ["pl-1130am-ad"],
    allowSecondToday: true,
  },
  {
    key: "pl-1130pm-c",
    date: "2026-11-30",
    hour: 18,
    segments: ["C"],
    subject: "Final hours to keep today's price",
    body: `Hi {{FIRST_NAME}},

A few hours left. Add a card **by 11:59pm Pacific tonight** to keep today's price for as long as you stay, annual included. No charge until your free time ends.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
    excludeClickersOf: ["pl-1130am-c"],
    allowSecondToday: true,
  },

  // ================================================================ COLD (E1/E2/E3)
  // Sent on the cold stream only (separate domain), never from the main domain.
  // ---------------------------------------------------------------- E1: clicked
  {
    key: "pl-e1-1113",
    date: "2026-11-13",
    hour: 10,
    segments: ["E1"],
    cold: true,
    subject: "You checked it out",
    body: `Hi,

You clicked through to Influencer Butler a while back, so I wanted to share the one thing that changed the most since then.

**Launch Butler sets it up for you in minutes.** ${LAUNCH_BUTLER_LINE}

No setup weekend, no tutorials first. You pick your niche, your name and your colors.

[See how Launch Butler works](${SITE}/help/tutorials/group-launch?src=pl-e1-1113)

Liz`,
  },
  {
    key: "pl-e1-1116",
    date: "2026-11-16",
    hour: 10,
    segments: ["E1"],
    cold: true,
    subject: "Hours of posting, or a VA?",
    body: `Hi,

Most creators I talk to are stuck between two options: spend hours every week finding deals and posting them by hand, or pay a VA to do it.

There's a third one. Influencer Butler does the repetitive part on a schedule: it finds the deals, posts them to your Page and group at a steady pace, and keeps going while you're busy. **You stay consistent without being glued to it.**

[Start a free 14-day trial](${pricing("pl-e1-1116")})

Liz`,
  },
  {
    key: "pl-e1-1119",
    date: "2026-11-19",
    hour: 10,
    segments: ["E1"],
    cold: true,
    subject: "One tool instead of a stack",
    body: `Hi,

Here's what people usually pay for separately, and what Influencer Butler does in one app:

- A deep-link service for your affiliate links (branded links are built in)
- A comment-to-DM tool (Comment to DM is built in)
- A separate shop or download page and file host (Foyer)
- A spreadsheet to track brand pitches (Pitch Butler)
- The repetitive VA work: posting deals on a schedule, finding products, re-tagging old content, sending group invites

What results look like: **your deals go out every day on schedule, even on the days you're busy.** Results vary, and what you earn depends on your niche and your audience, but the time you get back is the part people notice first.

[Start a free 14-day trial](${pricing("pl-e1-1119")})

Liz`,
  },
  {
    key: "pl-e1-1124",
    date: "2026-11-24",
    hour: 10,
    segments: ["E1"],
    cold: true,
    subject: "6 days left at today's price",
    body: `Hi,

Quick one: prices for new subscriptions go up after **Nov 30 at 11:59pm Pacific**. Start before then and you keep today's price for as long as you stay.

${PRICES_TODAY}

[Lock today's price](${pricing("pl-e1-1124")})

Liz`,
  },
  {
    key: "pl-e1-1129",
    date: "2026-11-29",
    hour: 10,
    segments: ["E1"],
    cold: true,
    subject: "Tomorrow",
    body: `Hi,

Prices go up after **tomorrow, Nov 30 at 11:59pm Pacific**. If you've been meaning to try it, now's a good time to lock today's price.

[Lock today's price](${pricing("pl-e1-1129")})

Liz`,
  },
  {
    key: "pl-e1-1130",
    date: "2026-11-30",
    hour: 8,
    segments: ["E1"],
    cold: true,
    subject: "Last day for today's price",
    body: `Hi,

Last day. Prices for new subscriptions go up **tonight at 11:59pm Pacific**. The trial is free for 14 days and you keep today's price for as long as you stay.

[Lock today's price](${pricing("pl-e1-1130")})

Liz`,
  },
  // ---------------------------------------------------------------- E2: opened, no click
  {
    key: "pl-e2-1114",
    date: "2026-11-14",
    hour: 10,
    segments: ["E2"],
    cold: true,
    subject: "What Launch Butler does, simply",
    body: `Hi,

The short version of Influencer Butler's newest feature:

**You answer a few questions. Launch Butler does the setup.** ${LAUNCH_BUTLER_LINE}

That's it. You keep control, and you can change anything later.

[See how it works](${SITE}/help/tutorials/group-launch?src=pl-e2-1114)

Liz`,
  },
  {
    key: "pl-e2-1118",
    date: "2026-11-18",
    hour: 10,
    segments: ["E2"],
    cold: true,
    subject: "Fewer subscriptions, less busywork",
    body: `Hi,

If you're paying for a link tool, a comment-to-DM tool and a shop page, or paying someone to post deals for you, Influencer Butler covers those in one app:

- Branded affiliate links, built in
- Comment to DM
- Foyer, your shop and download page
- Deals posted on a schedule, products found for you

**One app, less busywork.** Results vary, but the hours you get back add up fast.

[Start a free 14-day trial](${pricing("pl-e2-1118")})

Liz`,
  },
  {
    key: "pl-e2-1123",
    date: "2026-11-23",
    hour: 10,
    segments: ["E2"],
    cold: true,
    subject: "One week left at today's price",
    body: `Hi,

Prices for new subscriptions go up after **Nov 30 at 11:59pm Pacific**. Start your free trial this week and you keep today's price for as long as you stay.

${PRICES_TODAY}

[Lock today's price](${pricing("pl-e2-1123")})

Liz`,
  },
  {
    key: "pl-e2-1130",
    date: "2026-11-30",
    hour: 8,
    segments: ["E2"],
    cold: true,
    subject: "Last day for today's price",
    body: `Hi,

Last day. Prices go up **tonight at 11:59pm Pacific**. Start the free trial today and you keep today's price for as long as you stay.

[Lock today's price](${pricing("pl-e2-1130")})

Liz`,
  },
  // ---------------------------------------------------------------- E3: never opened (two sends, then stop)
  // pl-e3-1115 resends the best-performing cold email (highest click rate in
  // the cold report) with a new subject. Its body is filled in from that email
  // once the owner confirms which one; until then create-drafts skips it.
  {
    key: "pl-e3-1115",
    date: "2026-11-15",
    hour: 10,
    segments: ["E3"],
    cold: true,
    subject: "Quick question about your deals",
    body: "{{BEST_COLD_EMAIL_BODY}}",
  },
  {
    key: "pl-e3-1122",
    date: "2026-11-22",
    hour: 10,
    segments: ["E3"],
    cold: true,
    subject: "What if someone set it up for you?",
    body: `Hi,

A lot of creators tell me the same thing: "I'd do it if someone just set it up for me."

**That's what Launch Butler does.** ${LAUNCH_BUTLER_LINE}

If that sounds useful, the trial is free for 14 days. If not, no worries, this is the last you'll hear from me about it.

[See how it works](${SITE}/help/tutorials/group-launch?src=pl-e3-1122)

Liz`,
  },
];

/** Fills the per-recipient placeholders. Null when a needed value is missing
 * (the caller then skips the recipient rather than send a broken link). */
export function personalizePriceLockBody(
  body: string,
  values: { keepPlanUrl?: string | null; annualOffer?: string | null; firstName?: string | null },
): string | null {
  let out = body;
  // "Hi {{FIRST_NAME}}," becomes "Hi Jane," or plain "Hi," when we have no name.
  const name = values.firstName?.trim() || null;
  out = out.split("Hi {{FIRST_NAME}},").join(name ? `Hi ${name},` : "Hi,");
  out = out.split("{{FIRST_NAME}}").join(name ?? "there");
  if (out.includes("{{KEEP_PLAN_URL}}")) {
    if (!values.keepPlanUrl) return null;
    out = out.split("{{KEEP_PLAN_URL}}").join(values.keepPlanUrl);
  }
  if (out.includes("{{ANNUAL_OFFER}}")) {
    if (!values.annualOffer) return null;
    out = out.split("{{ANNUAL_OFFER}}").join(values.annualOffer);
  }
  return out;
}

/** Campaign name used for the draft (shown in admin Emails). */
export function priceLockCampaignName(e: PriceLockEmail): string {
  return `Price lock: ${e.key} (${e.segments.join("+")})`;
}

/** Same sending address, shown as from Liz: "Liz at Influencer Butler <hello@...>". */
export function fromLiz(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  const address = m ? m[1] : from.trim();
  return `Liz at Influencer Butler <${address}>`;
}
