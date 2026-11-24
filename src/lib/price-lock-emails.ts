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

// The risk reversal and the annual math, reused by the short A/D reminders so
// every send answers "what if it is not for me" and "is a year worth it".
const TRIAL_LINE =
  "The trial is free for 14 days. You are not charged until it ends, and you can cancel any time before then.";
const ANNUAL_PS =
  "P.S. Rather pay once for the year? Power User is **$390** today ($32.50 a month, versus $588 a year at the new monthly price) and Beginner is **$249**.";

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
    subject: "🔒 Your price locks in 6 days (free 14-day trial)",
    body: `Preheader: Beginner $24.99 and Power User $39 stay yours for as long as you stay. Free for 14 days. ☕

Hi,

Black Friday week is the busiest deal week of the year, and it goes a lot easier when your posts go out on schedule without you babysitting them.

Here's the deal on price: start your free trial by **Nov 30 at 11:59pm Pacific** and you keep today's price for as long as you stay subscribed, even after it goes up for everyone new.

${PRICES_TODAY}

Beginner is about the cost of 4 coffees a month, for deals that get found and posted for you. And Launch Butler sets up your Page, group, branding and posting schedule from a few questions, so you're not starting from a blank screen.

${TRIAL_LINE}

[Start my free trial and lock today's price](${pricing("pl-1124-ad")})

Liz

${ANNUAL_PS}`,
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

  // ------------------------------------------------ Wed Nov 25 - Sat Nov 28, 12pm
  // Daily sends through Thanksgiving and Black Friday weekend (owner decision
  // 2026-11-24, replaces the old Nov 26-28 blackout). A/D and C only; cold stays
  // off. Each day has its own angle so nobody gets the same email twice.
  {
    key: "pl-1125-ad",
    date: "2026-11-25",
    hour: 12,
    segments: ["A", "D"],
    subject: "☕ What 4 coffees a month actually gets you",
    body: `Preheader: Deals found and posted for you, set up in minutes, free for 14 days. Today's price locks for as long as you stay.

Hi,

Here's the plain version of what Influencer Butler does, so you can decide without guessing:

📦 **Finds deals and posts them** to your Page and group on a schedule
🧹 Cleans up expired deals so your feed stays fresh
💌 Messages brands in Creator Connections for you
💰 Accepts the Creator Connections campaigns that match what you sold
🛍️ Gives you your own Foyer shop page and branded links
🎩 Launch Butler sets up your Page, group and branding from a few questions

Beginner is $24.99 a month, about the cost of 4 coffees. Power User is $39 and adds every butler plus 1:1 calls.

${PRICES_TODAY}

Start before **Nov 30 at 11:59pm Pacific** and today's price is yours for as long as you stay. ${TRIAL_LINE}

[Start my free trial and lock today's price](${pricing("pl-1125-ad")})

Liz

P.S. 5 days left. If you have a question first, just reply. It comes straight to us.`,
  },
  {
    key: "pl-1125-c",
    date: "2026-11-25",
    hour: 12,
    segments: ["C"],
    subject: "5 days left to keep today's price",
    body: `Hi {{FIRST_NAME}},

Here's exactly what happens if you add a card before **Nov 30 at 11:59pm Pacific**:

🎁 Your free time rides out. Nothing is charged until it ends.
🔒 Today's price is locked for as long as you stay subscribed.
📅 That includes switching to annual later, at today's annual price.

Add it after Nov 30 and you can still keep going, just at the new price.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },
  {
    key: "pl-1126-ad",
    date: "2026-11-26",
    hour: 12,
    segments: ["A", "D"],
    subject: "🦃 One thing to be thankful for: your price stays put",
    body: `Preheader: Happy Thanksgiving! Start free for 14 days and today's price is yours for as long as you stay. 🧡

Hi,

Happy Thanksgiving! 🦃 I'll keep this short so you can get back to the people at your table.

One thing worth knowing today: prices go up after **Nov 30 at 11:59pm Pacific**, and if you start before then, you keep today's price for as long as you stay subscribed.

${PRICES_TODAY}

${TRIAL_LINE}

Whenever you have a quiet minute this weekend, it's there for you.

[Lock today's price](${pricing("pl-1126-ad")})

Thank you for being part of this. 🧡

Liz`,
  },
  {
    key: "pl-1126-c",
    date: "2026-11-26",
    hour: 12,
    segments: ["C"],
    subject: "🦃 Keep today's price (no charge until your free time ends)",
    body: `Hi {{FIRST_NAME}},

Happy Thanksgiving! 🦃 Just a quiet reminder, no rush today.

Add a card by **Nov 30 at 11:59pm Pacific** and you keep today's price for as long as you stay. Your free time still rides out, and nothing is charged until it ends.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },
  {
    key: "pl-1127-ad",
    date: "2026-11-27",
    hour: 12,
    segments: ["A", "D"],
    subject: "🛍️ Black Friday: is your Page posting deals without you?",
    body: `Preheader: 3 days left at today's price. Deals found and posted on schedule while you shop. Free for 14 days.

Hi,

It's Black Friday, the busiest deal day of the year. Every creator in your niche is posting deals today. 🛍️

The question is whether yours are going out on schedule, or whether you're stuck finding them and posting by hand.

**Influencer Butler does the repetitive part for you:** it finds deals from your keywords and posts them to your Page and group at a steady pace, even on the days you're busy.

${PRICES_TODAY}

3 days left to lock today's price, and the trial is free for 14 days. You are not charged until it ends, and you can cancel any time before then.

[Lock today's price](${pricing("pl-1127-ad")})

Liz`,
  },
  {
    key: "pl-1127-c",
    date: "2026-11-27",
    hour: 12,
    segments: ["C"],
    subject: "3 days left: keep your free time and today's price",
    body: `Hi {{FIRST_NAME}},

Black Friday is a good day to make sure your butler is posting for you. 🛍️

Add a card by **Nov 30 at 11:59pm Pacific** to keep today's price for as long as you stay. Your free time rides out, and nothing is charged until it ends.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },
  {
    key: "pl-1128-ad",
    date: "2026-11-28",
    hour: 12,
    segments: ["A", "D"],
    subject: "💰 The math on locking in a full year",
    body: `Preheader: Power User is $390 a year today, versus $588 a year at the new monthly price. 2 days left.

Hi,

If you know you'll stick with it, a full year is the best way to lock in. Here's the math, using real prices:

🔒 **Power User annual: $390** today, which is $32.50 a month
📅 At the new price, 12 months of Power User monthly is $588
✨ You keep **$198**, that's 34% off

🔒 **Beginner annual: $249** today, which is $20.75 a month
📅 At the new price, 12 months of Beginner monthly is about $360

Prefer to stay monthly? That locks too: $24.99 for Beginner, $39 for Power User, for as long as you stay.

Both are free to try for 14 days. You are not charged until the trial ends, and you can cancel any time before then. Prices go up after **Nov 30 at 11:59pm Pacific**, so there are 2 days left.

[Lock in my price](${pricing("pl-1128-ad")})

Liz`,
  },
  {
    key: "pl-1128-c",
    date: "2026-11-28",
    hour: 12,
    segments: ["C"],
    subject: "2 days left (annual is locked too)",
    body: `Hi {{FIRST_NAME}},

Two days left to keep today's price.

Add a card by **Nov 30 at 11:59pm Pacific** and your price is locked for as long as you stay, including if you switch to annual later at today's annual price. Your free time rides out first, and nothing is charged until it ends.

[Keep today's price]({{KEEP_PLAN_URL}})

Liz`,
  },

  // ---------------------------------------------------------------- Sun Nov 29, 12pm
  {
    key: "pl-1129-ad",
    date: "2026-11-29",
    hour: 12,
    segments: ["A", "D"],
    subject: "⏰ Tomorrow is the last day at today's price",
    body: `Preheader: After tomorrow at 11:59pm Pacific, Beginner is $29.99 and Power User is $49. Lock today's price free for 14 days.

Hi,

Quick heads up before the weekend wraps: prices go up after **tomorrow, Nov 30 at 11:59pm Pacific**.

${PRICES_TODAY}

Start your free trial before then and today's price is yours for as long as you stay. ${TRIAL_LINE}

If you've been waiting for a calm moment to set it up, Launch Butler does the setup for you: your Page, group, branding and a posting schedule that ramps up on its own.

[Lock today's price](${pricing("pl-1129-ad")})

Liz

${ANNUAL_PS}`,
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
    subject: "🔒 Last day: $24.99 and $39 end tonight",
    body: `Preheader: Prices go up at 11:59pm Pacific tonight. Start free for 14 days and keep today's price for as long as you stay.

Hi,

Today's the day. Prices go up for new subscriptions **tonight at 11:59pm Pacific**.

${PRICES_TODAY}

Start your free trial today and you keep today's price for as long as you stay, even after the new prices start. ${TRIAL_LINE}

Launch Butler can take it from there: answer a few questions and it sets up your Page, group, branding and deal schedule while you get on with your day.

[Lock today's price](${pricing("pl-1130am-ad")})

Liz

${ANNUAL_PS}`,
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
    subject: "Final hours to lock today's price",
    body: `Preheader: At 11:59pm Pacific tonight the price goes up. Free for 14 days, cancel any time before it ends.

Hi,

A few hours left. At **11:59pm Pacific tonight** prices go up for new subscriptions.

${PRICES_TODAY}

Starting the trial locks today's price for as long as you stay. ${TRIAL_LINE}

If you've been meaning to try it, this is the moment.

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

${PRICES_TODAY}

The trial is free for 14 days.

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

${PRICES_TODAY}

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

${PRICES_TODAY}

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
