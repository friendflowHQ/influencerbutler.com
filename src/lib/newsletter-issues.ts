// Educational newsletter queue for Amazon influencers / creators.
//
// 13 weekly issues (about three months). The weekly cron at
// /api/cron/newsletter sends the next unsent issue to the Resend Audience,
// one per week, starting at index 0 the first time it runs. Content is roughly
// 80% education / 20% soft product mention, in the trust-building voice the
// owner asked for. Edit freely: order is the array order, and `subject` /
// `preheader` / `body` are all that matter. Plain text bodies (paragraphs
// separated by blank lines); the sender wraps them into simple HTML.
//
// No em dashes anywhere (repo convention): use colons and hyphens.

export type NewsletterIssue = {
  subject: string;
  preheader: string;
  body: string;
};

const SIGNOFF = `Talk next week,
The Influencer Butler team

You're getting this because you signed up at influencerbutler.com. Unsubscribe anytime using the link below.`;

export const NEWSLETTER_ISSUES: NewsletterIssue[] = [
  {
    subject: "Welcome: the one habit that separates earners from hobbyists",
    preheader: "It is not more content. It is checking this one number every week.",
    body: `Welcome aboard. Every week I'll send you one short, useful thing to help you earn more as an Amazon influencer. No fluff, no hard sell.

Let's start with the habit that, more than anything else, separates creators who earn from creators who just post: they look at their commission report every single week.

Most people post a link and forget it. The earners check, every week:
1. Which products actually paid out (not which got clicks).
2. Which links are dead or pointing to the wrong place.
3. Which categories are paying the best rate right now.

That one review tells you what to make more of and what to quietly drop. Do it this week, even if it is five minutes in a spreadsheet.

If pulling that report by hand is painful, that is exactly the kind of thing Influencer Butler automates, but the habit matters far more than the tool.

${SIGNOFF}`,
  },
  {
    subject: "How to actually get accepted into Creator Connections campaigns",
    preheader: "Brands filter on three things. Most creators miss the second.",
    body: `Creator Connections is where a lot of real commission lives, but getting into campaigns feels like a black box. It is not random. Brands tend to filter on three things:

1. Relevance: your storefront and recent content match their product category. If you review kitchen gear, you will not get accepted to a supplement campaign. Lean into a clear niche.

2. Recency: an active, recently updated storefront beats a bigger but stale one. Brands can see you are currently posting. This is the one most people miss: they apply with a storefront they have not touched in two months.

3. Fit of audience: your numbers do not have to be huge, but they should look engaged and real.

This week: pick your two strongest categories and make sure your storefront leads with them. Accept the campaigns that match, ignore the ones that do not.

${SIGNOFF}`,
  },
  {
    subject: "Commission rates decoded: which categories actually pay",
    preheader: "Two creators, same effort, very different paychecks. Here is why.",
    body: `Not all commissions are equal, and the gap is bigger than most people realize. The exact rates shift, but the pattern holds: some categories pay several times more than others for the same click.

Generally higher: luxury beauty, some home and furniture, outdoor gear.
Generally lower: electronics, video games, grocery, health items.

This does not mean abandon low-rate categories. It means be intentional. If you are spending equal effort promoting a 1% category and a 10% category, your paycheck is being decided for you.

This week: list the five products you promote most. Look up the rate on each. If your effort is going mostly to the low end, rebalance toward the products that actually pay.

${SIGNOFF}`,
  },
  {
    subject: "The dead-link audit that finds money you already earned",
    preheader: "Broken and mis-tagged links quietly leak commission every day.",
    body: `Here is an uncomfortable truth: a chunk of creators are leaking commission through links that are broken, expired, or missing their tag entirely. The traffic shows up, the sale happens, and you get nothing because the link was wrong.

A quick audit:
1. Click through your most-shared links yourself. Do they land on a live product? Do they carry your tag?
2. Check older posts and your link-in-bio. Those are where dead links hide.
3. Fix or replace anything broken, starting with your highest-traffic posts.

You are not creating anything new here. You are recovering money from work you already did. That is the highest-return hour you can spend this week.

(Catching broken and untagged links automatically is one of the jobs Influencer Butler handles, but you can do a manual pass today.)

${SIGNOFF}`,
  },
  {
    subject: "Prime Day prep: the runway matters more than the day",
    preheader: "The creators who win big sales events started two weeks early.",
    body: `Big sales events can be a huge chunk of a creator's year. The mistake is treating them as a single day. The creators who clean up are the ones who built a runway.

Two weeks out:
- Refresh your storefront and idea lists so they feature giftable, deal-likely products.
- Line up the content you will post, do not improvise on the day.

The few days before:
- Tease specific products your audience already trusts you on.
- Make sure every link works and is tagged (see last week's audit).

On the day:
- Post early, post often, and lead with genuine picks, not everything on sale.

This week: block 30 minutes to list the 10 products you would most want to feature, and start warming your audience to them now.

${SIGNOFF}`,
  },
  {
    subject: "Your storefront is a landing page. Treat it like one.",
    preheader: "Idea lists that convert have a theme, not just a pile of links.",
    body: `Most storefronts are a junk drawer: a pile of unrelated products. The ones that convert read like curated guides.

The shift is simple: build idea lists around a theme or a problem, not a category.

Instead of "Kitchen," try:
- "Everything I use to meal-prep on Sundays"
- "Small-kitchen gear that actually saves space"
- "Gifts for the friend who loves to cook"

Themed lists work because they match how people actually shop: they have a situation, not a category. They also give you natural content to post ("here is my Sunday meal-prep list").

This week: turn one of your categories into one themed idea list with a clear title and 8 to 12 products that genuinely belong together.

${SIGNOFF}`,
  },
  {
    subject: "Finding winning products without guessing",
    preheader: "A repeatable research loop beats hoping something goes viral.",
    body: `Winning products are usually found, not stumbled upon. Here is a simple, repeatable loop:

1. Start from what already works for you. Look at your own top earners and find adjacent products.
2. Check the rate. A great product in a 1% category may not be worth a feature (see issue 3).
3. Look for proof of demand: solid review counts, recent sales rank, a price point your audience actually buys at.
4. Make sure you can speak to it honestly. The best-converting content is a real recommendation.

The goal is not one viral hit. It is a steady stream of solid, well-matched products you can recommend with a straight face.

This week: find three new products adjacent to your current top earner and add them to a themed list.

${SIGNOFF}`,
  },
  {
    subject: "Make one video. Post it five places.",
    preheader: "Repurposing is the highest-leverage habit small creators ignore.",
    body: `If you are making content from scratch for every platform, you are working five times as hard as you need to. Repurposing is how small teams (or solo creators) compete.

A simple system:
1. Make one solid vertical video (a product walkthrough, a "things I bought" roundup).
2. Post it natively to each platform you are on: Reels, Shorts, TikTok, Pinterest Idea Pin.
3. Tweak the hook and caption per platform, keep the core the same.
4. Pull a still or two for static posts.

One idea, a week of content. The algorithm on each platform does not know or care that it ran elsewhere.

This week: take your single best recent video and post it to one platform you skipped.

${SIGNOFF}`,
  },
  {
    subject: "Brand outreach that does not feel spammy",
    preheader: "The difference between ignored and answered is in the first line.",
    body: `Reaching out to brands directly can unlock partnerships and better rates, but most outreach gets deleted because it is all about the creator: "I have X followers, I'd love to work together."

Flip it. Lead with them:
1. Name a specific product of theirs you genuinely use or would recommend, and why.
2. Show you already understand their audience.
3. Make a small, concrete ask (a sample, an affiliate code, a feature), not "let's partner."
4. Keep it short. Three to four sentences.

You are starting a relationship, not closing a deal in one email. Specific and brief beats long and generic every time.

This week: send three short, specific notes to brands whose products you already recommend.

${SIGNOFF}`,
  },
  {
    subject: "The three numbers that actually matter",
    preheader: "Dashboards are noisy. Watch these and ignore the rest.",
    body: `It is easy to drown in metrics. For an affiliate creator, three numbers tell you almost everything:

1. Earnings per product: which items actually pay you. Make more content about the top few.
2. Conversion, not just clicks: a post with fewer clicks but more sales is your real winner. Study why it converted.
3. Trend over time: are this month's earnings ahead of last month's pace? That is your real scoreboard.

Vanity metrics (views, followers) feel good but do not pay. These three point you at what to do next.

This week: find your single best-converting post from the last 90 days and make something in the same style.

${SIGNOFF}`,
  },
  {
    subject: "Build your Q4 runway now (yes, now)",
    preheader: "The holiday creators who win are planning in the summer.",
    body: `The fourth quarter is the biggest earning window of the year for most creators. The ones who win it are not scrambling in November. They are quietly building now.

A summer head start:
1. Start a running "gift guide" idea list and add to it all season as you find good products.
2. Note which of your evergreen posts spiked last holiday season and plan to refresh them.
3. Line up themes: gifts under $25, gifts for him/her, stocking stuffers, cozy season.

By the time everyone else is panic-posting in Q4, you will have curated lists and content ready to go.

This week: create one "Holiday gift guide" idea list and add the first five products to it.

${SIGNOFF}`,
  },
  {
    subject: "Disclosure: the boring habit that protects everything you build",
    preheader: "Clear affiliate disclosure is not optional, and it builds trust.",
    body: `This one is not glamorous, but it protects everything else: disclose your affiliate relationships clearly and consistently.

It matters for two reasons. First, it is required: regulators expect clear, hard-to-miss disclosure that you earn from links. Vague or buried disclosure does not count. Second, and underrated: clear disclosure actually builds trust. Audiences already assume you earn something. Being upfront about it makes you look honest, not less credible.

Simple rules:
1. Put it where people see it before they click, not just in a footer.
2. Use plain words: "I earn a commission from links in this post."
3. Be consistent across every platform.

This week: check your link-in-bio and recent posts. Add a clear, simple disclosure anywhere it is missing.

${SIGNOFF}`,
  },
  {
    subject: "Your weekly creator routine (let's make this stick)",
    preheader: "Three months in: the simple loop that keeps the earnings growing.",
    body: `We have covered a lot over the last few months: commission reviews, link audits, themed storefronts, product research, repurposing, outreach, the numbers that matter, and disclosure. Here is how to make it a routine instead of a one-time push.

A simple weekly loop, about an hour total:
- Monday: check last week's earnings and your three key numbers.
- Midweek: fix any broken or untagged links you spot.
- Make one piece of content, repurpose it everywhere.
- Add one product to a themed idea list.
- Send one or two short, specific brand notes.

That is it. Small, consistent, compounding. The creators who earn are rarely the ones who do the most in a burst. They are the ones who keep showing up.

Thanks for reading these for the last three months. Reply anytime and tell me what you want more of.

${SIGNOFF}`,
  },
];
