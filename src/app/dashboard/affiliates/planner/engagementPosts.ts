// Per-butler Facebook engagement posts for the affiliate Content Planner.
// Comment-driving posts (Reveal / Relatable / Interactive) grouped by butler, each with a
// screenshot prompt + a copy-paste caption. Consumed by planner/page.tsx (sticky butler nav
// filters to one butler at a time). KEEP CURRENT: when a butler ships or changes, update its
// posts here. NO em dashes anywhere (repo rule): use ':' / '-' / ',' instead.
// Generated 28 butlers x 10 posts. Last built by tooling; edit by hand freely.

export type EngagementPost = {
  title: string;
  type: string; // Reveal / Relatable / Interactive (and combos)
  screenshot: string;
  caption: string;
};

export type Category =
  | "Amazon Automation"
  | "Social & Outreach"
  | "Content & Deals"
  | "Earnings & Growth";

export const CATEGORIES: Category[] = [
  "Amazon Automation",
  "Social & Outreach",
  "Content & Deals",
  "Earnings & Growth",
];

export type ButlerGroup = {
  slug: string;
  name: string;
  cat: Category;
  blurb: string;
  posts: EngagementPost[];
};

export const BUTLERS: ButlerGroup[] = [
  {
    "slug": "amazon-butler",
    "name": "Amazon Butler",
    "cat": "Amazon Automation",
    "blurb": "Messages brands in Creator Connections, follows up, and paces itself so your account stays safe.",
    "posts": [
      {
        "title": "Brand Outreach Party",
        "type": "Reveal / Relatable",
        "screenshot": "The Amazon Butler panel mid-run, messaging brands in Creator Connections.",
        "caption": "😴 While I was asleep last night, 40 brands got a personalized message from me.\n\nI wrote my pitch ONCE. It rotates the wording so no two brands get the same note, follows up on its own, and paces itself so my account stays safe. I woke up to replies in my inbox.\n\nRaise your hand if you're still copy-pasting the same brand message 50 times a day 🙋‍♀️ (I was too, it nearly broke me lol)"
      },
      {
        "title": "No Two Brands The Same",
        "type": "Reveal",
        "screenshot": "The Amazon Butler message-rotation view showing several brands each getting a differently worded pitch.",
        "caption": "🤫 Little secret: I have not typed a fresh brand pitch in weeks.\n\nI wrote ONE message I actually like, and Amazon Butler rotates the wording so every brand in Creator Connections gets a note that reads like I sat down and wrote it just for them. No copy-paste fingerprint, no \"template\" vibe.\n\nBrands can smell a mass blast a mile away, and this fixes exactly that. 💌\n\nWho else is guilty of sending the same word-for-word DM to 30 brands? 🙋‍♀️ Comment if that was you (no judgment, I lived there too)."
      },
      {
        "title": "The Follow-Up I Always Forgot",
        "type": "Relatable",
        "screenshot": "The Amazon Butler follow-up log showing automatic second messages sent to brands who did not reply.",
        "caption": "😅 Confession: my old \"strategy\" was messaging a brand once and then... hoping.\n\nMost deals live in the follow-up, and I was leaving ALL of them on read (my own read, lol). Now the butler nudges every brand that ghosted me, on its own, without me remembering a single thing.\n\nThe replies I get now? Half of them come from that second message. 📈\n\nBe honest: how many brands have you messaged exactly once and never followed up with? Drop a number below 👇"
      },
      {
        "title": "Hours Back Every Week",
        "type": "Reveal / Relatable",
        "screenshot": "The Amazon Butler run summary showing how many brands were contacted in one automated session.",
        "caption": "⏰ I used to block off entire evenings just to message brands. Gone.\n\nThat outreach grind, opening each brand, writing the note, tracking who I already hit, was eating hours I did not have as a one-person operation. Now it runs in the background while I actually make content (or sleep).\n\nSame outreach, a fraction of the time, and honestly a lot more of it. 💛\n\nWhat would you do with the hours back? Comment the ONE thing you'd rather be doing than copy-pasting pitches 👇"
      },
      {
        "title": "Runs While You Sleep",
        "type": "Relatable",
        "screenshot": "The Amazon Butler panel actively working through the Creator Connections brand list.",
        "caption": "🌙 My favorite kind of work is the kind I'm not awake for.\n\nI set my pitch, hit go, and Amazon Butler works its way through the brand list in the background. I'm not babysitting a screen, I'm filming, editing, or straight up sleeping while outreach keeps happening.\n\nThe grind does not stop just because I clocked out. 😴\n\nAre you a night-owl creator or an early bird? Comment 🦉 or 🐦 and let's see who we've got in here."
      },
      {
        "title": "The Slow-And-Safe Flex",
        "type": "Reveal",
        "screenshot": "The Amazon Butler pacing setting showing outreach spaced out to protect your account.",
        "caption": "🐢 Fast is tempting. Banned is worse.\n\nWhen I first tried to hustle brand outreach I'd fire off a pile of messages fast and just pray my account was fine. Amazon Butler paces itself instead, spacing the messages out so it looks like a real human doing real outreach.\n\nSlow and steady, but it never stops, which is honestly the whole cheat code. 🔒\n\nHave you ever gotten a warning or a weird restriction from moving too fast? Comment 🔥 if account safety stresses you out too."
      },
      {
        "title": "Write It Once",
        "type": "Interactive",
        "screenshot": "The Amazon Butler pitch editor where you type your single brand message before a run.",
        "caption": "✍️ The whole thing runs on ONE message you write.\n\nYou type the pitch you'd actually send a brand you love, save it, and the butler handles the rest: rotating the wording, spacing it out, following up. Write once, reach many. That's it.\n\nSo the real question is what your pitch even says. 👀\n\nDrop your best brand opening line in the comments 👇 I'll tell you honestly if it'd make ME reply."
      },
      {
        "title": "From Zero Outreach To This",
        "type": "Relatable",
        "screenshot": "The Amazon Butler dashboard showing the total number of brands reached since you started.",
        "caption": "📊 Real talk: for months my brand outreach number was basically zero.\n\nNot because I didn't want deals, but because sitting down to message brands felt like a second job I kept avoiding. Now that number climbs on its own every single day while I focus on content.\n\nProgress you don't have to force is a different kind of freedom. 💛\n\nWhere are you at right now, still stuck at zero outreach, or already sending? Comment your honest answer 👇"
      },
      {
        "title": "Personalized At Scale",
        "type": "Reveal",
        "screenshot": "The Amazon Butler preview showing two brand messages side by side with different wording.",
        "caption": "🎯 \"Personalized\" and \"a lot\" usually don't go together. This is the exception.\n\nEvery brand still gets a note that feels one-to-one because the wording rotates, but I'm reaching way more brands than I ever could by hand. It's the personal touch WITHOUT the carpal tunnel. 😮‍💨\n\nBrands reply to humans, and this keeps me sounding human at volume.\n\nWhat's the nicest reply you've ever gotten from a brand? Share it below, I want the good news 👇"
      },
      {
        "title": "Set It And Actually Forget It",
        "type": "Interactive (drop your niche)",
        "screenshot": "The Amazon Butler start screen right before you launch an unattended outreach run.",
        "caption": "🚀 I hit start, close the laptop, and go live my life.\n\nThat's genuinely the workflow now. Amazon Butler messages brands in Creator Connections, follows up on the quiet ones, and paces itself so my account stays safe, all with zero babysitting from me.\n\nThe only thing I actually do is pick which brands fit my niche. 🎬\n\nSo tell me: what's YOUR niche? Drop it below 👇 and let's see who we've got repping what in here."
      }
    ]
  },
  {
    "slug": "daily-commission-butler",
    "name": "Daily Commission Butler",
    "cat": "Amazon Automation",
    "blurb": "Watches your storefront and auto-accepts new Creator Connections offers the instant they appear.",
    "posts": [
      {
        "title": "The 3am Accept",
        "type": "Reveal / Relatable",
        "screenshot": "The Daily Commission Butler activity log showing a Creator Connections offer auto-accepted with a timestamp.",
        "caption": "😴 I accepted a paid campaign at 3:14am while I was dead asleep.\n\nAmazon drops these Creator Connections offers on products you've already sold, and the good ones get claimed FAST. My butler just watches my storefront in the background and grabs them the second they appear. 💛\n\nNo more refreshing my dashboard like a maniac hoping I'm early enough.\n\nBe honest, how many offers do you think you've missed just because you were living your life? Drop a 🙋‍♀️ below."
      },
      {
        "title": "Commission Rate Spike",
        "type": "Reveal",
        "screenshot": "A Daily Commission Butler entry highlighting an unusually high commission rate offer it caught.",
        "caption": "👀 Caught one: a product I already sell suddenly offered a way higher commission rate than usual.\n\nThose spikes don't sit there waiting for you. They pop up, and they expire fast. My butler flagged it and auto-accepted before I even had my coffee. ☕\n\nThe whole reason I set this up is because I KNOW I was sleeping through the best ones.\n\nComment 🔥 if you'd want to know the second one of these lands on your storefront."
      },
      {
        "title": "Never Miss Again",
        "type": "Relatable",
        "screenshot": "The Daily Commission Butler panel running quietly in the background while other tabs are open.",
        "caption": "Raise your hand if you've ever opened Amazon and seen a campaign offer that expired yesterday 🙋‍♀️\n\nI used to get that little gut-punch of ugh, I would have said yes to that. Now I don't even have to be watching. It sits in the background and accepts the offers on products I've already sold, the instant they show up.\n\nIt's the most set-and-forget thing I own. 💛\n\nWhat's the one that got away for you? Tell me below 👇"
      },
      {
        "title": "Hours Back Every Week",
        "type": "Reveal / Relatable",
        "screenshot": "The Daily Commission Butler summary showing how many offers it accepted over the past week.",
        "caption": "⏰ I got my mornings back.\n\nI used to sit and manually check Creator Connections for new offers, over and over, terrified I'd miss a good rate. Hours a week, gone, just refreshing.\n\nNow the butler watches for me 24/7 and auto-accepts the campaigns on products I've already sold. I look at the weekly summary and go oh nice, it caught all of those while I lived my life. 😌\n\nHow many hours a week do you burn just checking for offers? Drop a number 👇"
      },
      {
        "title": "Sponsored Products Too",
        "type": "Reveal",
        "screenshot": "A Daily Commission Butler log entry showing a Sponsored Products Creator Connections offer it accepted.",
        "caption": "Little thing a lot of people miss: it's not just regular Creator Connections offers. 💡\n\nMy butler also catches the Sponsored Products CC offers on stuff I've already sold, and accepts those the moment they land too. Two kinds of paid campaigns, both grabbed automatically, both in the background.\n\nThat's money I genuinely would not have known existed. 💛\n\nDid you even know Sponsored Products had these offers? Comment 👀 if this is news to you."
      },
      {
        "title": "The Expired Offer Sting",
        "type": "Relatable",
        "screenshot": "The Daily Commission Butler feed listing offers caught right at the moment they appeared.",
        "caption": "😩 Nothing stings like logging in and seeing a great campaign that closed while you were asleep.\n\nI did that to myself too many times. The best rates have the shortest windows, and I was never fast enough by hand.\n\nSo I stopped relying on being fast. The butler just accepts them the second they appear on products I already sell. No timing, no luck. 💛\n\nWhat's the worst offer you've ever watched expire? Vent below 👇"
      },
      {
        "title": "Set It And Forget It",
        "type": "Interactive",
        "screenshot": "The Daily Commission Butler toggle switched on with its status showing it is actively watching.",
        "caption": "Flip one switch and it just works. ✅\n\nMy Daily Commission Butler sits there watching my storefront for new campaign offers on products I've already sold, and auto-accepts them the moment they show up. I don't touch it. I don't babysit it. It just quietly catches paid campaigns while I make content.\n\nComment SET below and I'll walk you through turning it on for your own storefront 👇"
      },
      {
        "title": "While You Sleep",
        "type": "Reveal / Relatable",
        "screenshot": "A Daily Commission Butler overnight log showing offers accepted between midnight and morning.",
        "caption": "🌙 My storefront makes decisions while I sleep now.\n\nAmazon doesn't post new offers on a schedule that's convenient for you. They show up at random, and the strong ones vanish quick. My butler runs overnight, catches the campaigns on products I've already sold, and accepts them before anyone's awake to compete.\n\nI wake up to a list of yes, got it. 💛\n\nWho else does their best Amazon work at 2am by accident? 🙋‍♀️ Comment below."
      },
      {
        "title": "The Money I Was Leaving",
        "type": "Reveal",
        "screenshot": "The Daily Commission Butler results view showing a running count of accepted paid campaigns.",
        "caption": "💰 Turns out I was leaving real campaigns on the table just by not being at my desk.\n\nThese are products I've ALREADY sold. Amazon offers me a paid campaign on them, sometimes at a great rate, and if I'm not there in time, it's gone. My butler catches them for me now, automatically, the instant they drop.\n\nNo income promises here, just: don't leave the yes on the table. 💛\n\nComment 🙌 if you know you've missed a few."
      },
      {
        "title": "Drop Your Storefront",
        "type": "Interactive (drop your link)",
        "screenshot": "The Daily Commission Butler watching a connected Amazon storefront for incoming offers.",
        "caption": "👇 Drop your storefront link below.\n\nA lot of you have products sitting there that Amazon is ALREADY offering paid campaigns on, and the offers are expiring before you ever see them. It's such an easy thing to fix.\n\nMy butler watches for those offers and accepts them the second they appear, in the background, on the products you've already sold. 💛\n\nComment your link and I'll show you how to stop missing them. We all win when nobody's leaving campaigns behind."
      }
    ]
  },
  {
    "slug": "pricecrash-butler",
    "name": "Pricecrash Butler",
    "cat": "Amazon Automation",
    "blurb": "Scans Amazon for price crashes and pricing errors and queues the catches into your Deals Butler.",
    "posts": [
      {
        "title": "Caught It While I Slept",
        "type": "Reveal",
        "screenshot": "The Pricecrash Butler results panel showing a list of overnight catches with big percent-off numbers.",
        "caption": "😴 I went to bed. My butler stayed up scanning Amazon for price crashes and pricing errors.\n\nWoke up to a queue of deals already caught, some 80%+ off, sitting in my Deals Butler ready to review. I didn't refresh a single page. 🙌\n\nThe glitch deals are gone by lunch. That's the whole game. Comment 🔥 if you've ever seen a wild price drop AFTER it sold out. 👇"
      },
      {
        "title": "Set Your Crash Threshold",
        "type": "Interactive",
        "screenshot": "The Pricecrash Butler settings showing the discount threshold slider set anywhere from 50% up to 99% off.",
        "caption": "Quick question for the deal hunters 👀\n\nMy price-crash scanner lets me set the threshold. Crank it to 99% off and it only pings me on true glitch pricing. Dial it down to 50% and it becomes a steep-discount radar all day. 📉\n\nWhere would YOU set the line? Drop your number below (50 to 99) and I'll tell you what kind of deal flow that pulls in. 👇"
      },
      {
        "title": "The 3 Hours I Got Back",
        "type": "Relatable",
        "screenshot": "The Pricecrash Butler run history listing multiple scheduled scans completed automatically overnight.",
        "caption": "Raise your hand if you used to sit there refreshing Amazon deal pages for hours 🙋‍♀️ (guilty, it ate my whole evening)\n\nNow a scheduled scan does the hunting and just hands me the crashes. That's easily 3 hours a night I'm not doom-scrolling for a glitch price. ⏰\n\nWhat would you do with 3 hours back? Tell me below 👇"
      },
      {
        "title": "Drafts, Not Chaos",
        "type": "Reveal",
        "screenshot": "The Pricecrash Butler review view where caught deals are queued as drafts before anything posts.",
        "caption": "People assume automation means it posts random junk for you. Nope. 🙅‍♀️\n\nEvery crash it catches lands as a DRAFT in my Deals Butler first. I skim, kill the ones that aren't right, and only the good ones go out. Full control, none of the manual hunting. ✨\n\nDo you like to review first or auto-post and trust it? Comment your style 👇"
      },
      {
        "title": "Pricing Error Story Time",
        "type": "Interactive",
        "screenshot": "A single Pricecrash Butler catch showing a product that dropped to a fraction of its normal price.",
        "caption": "Everybody has ONE deal that got away. 😭\n\nMine was a gadget that hit like 90% off for maybe an hour. By the time I saw it? Sold out. Never again, so now a butler watches for those pricing errors around the clock. ⏱️\n\nTell me the deal you missed that STILL haunts you. Drop it below and let's grieve together 👇"
      },
      {
        "title": "Auto-Schedule Mode",
        "type": "Reveal",
        "screenshot": "The Pricecrash Butler option toggled to auto-schedule caught deals straight into the Deals Butler queue.",
        "caption": "Real talk: some nights I don't want to babysit anything. 🌙\n\nSo I flip my crash scanner to auto-schedule. It catches the price drops and queues them as posts on its own, spaced out and ready. I check in the morning like a boss reviewing overnight reports. 📊\n\nWould you trust full auto or keep a hand on the wheel? Comment 🤖 or 🖐️ 👇"
      },
      {
        "title": "While You Were Refreshing",
        "type": "Relatable",
        "screenshot": "The Pricecrash Butler dashboard mid-scan, scanning Amazon on a set schedule for crashes.",
        "caption": "The old me had 14 deal tabs open, refreshing like a maniac, terrified of missing the one that crashed. 😩\n\nNow it's a scheduled scan. It checks Amazon on a timer, flags the massive drops, done. My browser has like 2 tabs open now and I feel like a new person. 😂\n\nHow many tabs are open on YOUR device right now? Be honest 👇"
      },
      {
        "title": "Steep Discount Radar",
        "type": "Interactive",
        "screenshot": "The Pricecrash Butler catch list filtered to a lower threshold, showing a wider spread of steep discounts.",
        "caption": "Not every win is a 99%-off glitch. 💡\n\nWhen I lower the threshold, the scanner turns into a steep-discount radar and catches a way wider range of drops I can actually build content around. More to post, less time hunting. 🎯\n\nWhat's a product category YOU always want deals in? Name it below and I'll aim the radar there 👇"
      },
      {
        "title": "One Queue, No Hunting",
        "type": "Reveal / Relatable",
        "screenshot": "The Pricecrash Butler catches flowing directly into the Deals Butler queue in one connected view.",
        "caption": "The part that changed everything for me: the crashes it finds go STRAIGHT into my Deals Butler. 🔗\n\nNo copy-paste, no second app, no tab juggling. It catches the drop, it queues the deal, I approve. That handoff is what turned deal-posting from a chore into a habit. 💛\n\nWhat's the one task you wish would just hand itself off? Tell me 👇"
      },
      {
        "title": "The Sleep Flex",
        "type": "Relatable",
        "screenshot": "The Pricecrash Butler overnight summary showing crashes caught between bedtime and morning.",
        "caption": "My favorite flex isn't a big number. It's that I caught glitch deals WHILE ASLEEP. 😴💤\n\nGlitch prices don't wait for you to wake up, and I'm not setting a 3am alarm for a discount. A scheduled scan just does the night shift so I don't have to. Wild that this is normal now.\n\nComment 😴 if you'd happily let a butler take the night shift for you 👇"
      }
    ]
  },
  {
    "slug": "cc-check",
    "name": "CC Check",
    "cat": "Amazon Automation",
    "blurb": "Pulls every ASIN from any page in seconds and exports to CSV. Free forever.",
    "posts": [
      {
        "title": "Storefront Rip",
        "type": "Reveal",
        "screenshot": "The CC Check panel showing a full list of ASINs pulled from a single storefront page.",
        "caption": "😮 I pasted ONE storefront link and got every single Amazon product code off the page in about 3 seconds.\n\nNo clicking into products one by one. No copy-paste marathon. It grabbed all the ASINs at once and dumped them into a clean list I can export to CSV. 📄\n\nI used to do this by hand and it took me an entire evening. An EVENING. 😩\n\nWhat's the most tedious Amazon task you're still doing manually? Tell me below 👇"
      },
      {
        "title": "The ASIN Dump",
        "type": "Interactive (drop your link)",
        "screenshot": "A CC Check run with the ASIN count highlighted after scanning a pasted page.",
        "caption": "📋 Drop any Amazon page link below and I'll show you how many product codes are hiding on it 👇\n\nStorefront, blog post, a big listicle, whatever. CC Check reads the whole page and pulls every ASIN in seconds, then hands you a CSV. ✨\n\nSo many of us are still opening each product in a new tab to grab one code at a time. There's a faster way and it's free.\n\nDrop your link and let's see the count 🔥"
      },
      {
        "title": "Evening Back",
        "type": "Relatable",
        "screenshot": "CC Check finishing a scan with the exported CSV file ready to download.",
        "caption": "🙋‍♀️ Raise your hand if you've ever spent 2 hours copying Amazon product codes into a spreadsheet by hand.\n\nYeah. Me too. It nearly made me quit. 😮‍💨\n\nNow I paste the page, CC Check grabs every ASIN at once, and I export the whole thing to CSV before my coffee gets cold. ☕ That's hours back, every single week.\n\nComment ⏰ if you'd take a whole evening back too."
      },
      {
        "title": "Competitor Peek",
        "type": "Reveal / Interactive",
        "screenshot": "The CC Check results list after scanning a competitor's product roundup page.",
        "caption": "👀 Ever look at someone's big product roundup and wish you knew exactly what they were featuring?\n\nI paste the page into CC Check and it pulls every Amazon code off it in seconds. Now I've got a clean CSV of the whole list to research and see what's worth featuring myself. 📊\n\nTotally free, works even on an expired account. 💛\n\nWhat kind of page do you wish you could rip the codes from? Tell me below 👇"
      },
      {
        "title": "Blog Post Harvest",
        "type": "Reveal",
        "screenshot": "CC Check pulling ASINs from a long blog post packed with product links.",
        "caption": "📝 I had an old blog post with like 40 Amazon products buried in it and no master list anywhere.\n\nInstead of scrolling and copying each one, I pasted the URL into CC Check and it grabbed every ASIN at once. CSV in hand, done. 🎯\n\nHonestly the copy-paste-one-at-a-time era is over for me and I'm not mad about it lol.\n\nHow many products live in your longest post? Drop a number below 👇"
      },
      {
        "title": "CSV In Seconds",
        "type": "Reveal / Relatable",
        "screenshot": "The CC Check export button with a freshly generated CSV of ASINs.",
        "caption": "⚡ From messy webpage to clean CSV of every Amazon code in under 10 seconds.\n\nThat's the whole thing. Paste a page, it finds all the ASINs, you export. No spreadsheet wrangling, no tabs, no losing your mind. 🧠\n\nI genuinely save hours a week on list-building now and it costs me nothing.\n\nComment 🔥 if a clean CSV would make your life easier right now."
      },
      {
        "title": "Free Forever Flex",
        "type": "Relatable",
        "screenshot": "CC Check running successfully with a note that it works on a free or cancelled account.",
        "caption": "💛 The thing I love most about CC Check? It's free forever.\n\nEven if your subscription lapsed or you cancelled, it still pulls every Amazon product code off any page and exports to CSV. No paywall on the boring-but-essential stuff. 🙌\n\nWe all deserve one tool that just works and doesn't nickel-and-dime us.\n\nWhat's one tool you WISH was free forever? Tell me below 👇"
      },
      {
        "title": "Tab Graveyard",
        "type": "Relatable",
        "screenshot": "CC Check listing dozens of ASINs pulled from one page in a single run.",
        "caption": "🪦 RIP to my 47 open Amazon tabs, each one there just so I could grab a single product code.\n\nThose days are done. I paste the page, CC Check pulls every ASIN in one shot, and my browser can finally breathe. 😮‍💨💻\n\nExporting the whole list to CSV takes one click after that.\n\nBe honest: how many tabs do you have open RIGHT NOW? 👇"
      },
      {
        "title": "Bulk Or Bust",
        "type": "Interactive (drop your link)",
        "screenshot": "A CC Check scan in progress, pulling all product codes from a pasted storefront.",
        "caption": "🚀 Drop your storefront link below and I'll pull every product code off it for you 👇\n\nCC Check reads the whole page at once instead of you clicking through product by product. Seconds later you've got a CSV of every ASIN, ready to use. 📄\n\nBulk beats one-at-a-time every single time.\n\nDrop that link and let's build your master list together 💪"
      },
      {
        "title": "The List I Never Had",
        "type": "Reveal",
        "screenshot": "The completed CC Check CSV export showing a full column of ASINs.",
        "caption": "😅 For YEARS I never had a clean master list of every product I'd featured. Just scattered links everywhere.\n\nNow I paste a page, CC Check grabs all the Amazon codes at once, and I export a tidy CSV. Finally organized, and it took me one afternoon instead of one lifetime. 🗂️✨\n\nBest part: it's free and works even if your account lapsed.\n\nAre you a list person or a chaos person? Comment below 👇"
      }
    ]
  },
  {
    "slug": "orders-butler",
    "name": "Orders Butler",
    "cat": "Amazon Automation",
    "blurb": "Pulls your full Amazon order history in one click, so past purchases become content ideas. Free forever.",
    "posts": [
      {
        "title": "The Receipts Reveal",
        "type": "Reveal",
        "screenshot": "The Orders Butler panel showing a long scrolling list of past Amazon orders just pulled in.",
        "caption": "🧾 I just pulled my ENTIRE Amazon order history in one click. Years of it. 😳\n\nEvery single thing I've ever bought is now sitting in one list, ready to tag. No copy-pasting row by row like I used to do at midnight lol.\n\nTurns out my next 20 videos were hiding in my own purchases the whole time.\n\nHow far back does YOUR Amazon history go? Drop a year below 👇"
      },
      {
        "title": "Content Ideas You Already Own",
        "type": "Relatable",
        "screenshot": "A section of the imported order list highlighting a handful of random everyday products.",
        "caption": "Raise your hand if you stare at a blank screen wondering what to post next 🙋‍♀️\n\nI used to do that DAILY. Then I pulled my full order history and realized I've already bought hundreds of things I could review, tag, and talk about honestly.\n\nThe ideas aren't out there. They're in your cart history.\n\nComment 🔥 if you're guilty of overthinking your next post."
      },
      {
        "title": "No More Copy-Paste Midnight",
        "type": "Reveal / Relatable",
        "screenshot": "The one-click import button on Orders Butler with the order count climbing.",
        "caption": "😴 I used to sit up copy-pasting order numbers and product names into a spreadsheet one. by. one.\n\nOne click now pulls the whole history for me. Years back. Every product I've actually bought and can actually vouch for.\n\nMy hands are no longer cramping and my content pipeline is FULL.\n\nWho else has wasted hours copy-pasting order rows? Tell me I'm not alone 👇"
      },
      {
        "title": "Hours Back Flex",
        "type": "Reveal",
        "screenshot": "The full imported history view with a total order count visible at the top.",
        "caption": "⏰ This would've taken me an entire weekend by hand. It took ONE click.\n\nMy whole Amazon purchase history, going back years, imported and ready to turn into taggable content. That's a stack of afternoons I'm never spending on a spreadsheet again.\n\nHonestly the time back alone changed how I plan videos.\n\nWhat would YOU do with a free weekend? Drop it below 💛"
      },
      {
        "title": "Drop Your Weirdest Buy",
        "type": "Interactive",
        "screenshot": "The order list scrolled to show a mix of unusual or funny past purchases.",
        "caption": "😂 Pulled my full order history and got HUMBLED by some of my past purchases.\n\nEvery one of these is actually a content idea though: a review, a \"why I bought this,\" a storytime. Stuff I forgot I even owned.\n\nYour own history is a goldmine of honest content you can tag.\n\nWhat's the weirdest thing in your Amazon order history? Confess below 👇"
      },
      {
        "title": "Years of Buys, One List",
        "type": "Reveal",
        "screenshot": "Orders Butler mid-import pulling multiple years of orders into a single view.",
        "caption": "📦 I've been shopping on Amazon for YEARS and never once turned that history into content.\n\nOne click later, every order is in a single list I can scroll and tag. Products I genuinely bought, genuinely used, genuinely have opinions on.\n\nThat's the honest content people actually trust.\n\nHow many years of Amazon orders are you sitting on? Guess below 👇"
      },
      {
        "title": "Your Next 20 Videos",
        "type": "Interactive",
        "screenshot": "The imported order history with several products that would each make an easy video.",
        "caption": "🎥 I found my next 20 video ideas without brainstorming a single one.\n\nHow? I pulled my whole Amazon order history in one click and just scrolled. Every product I've bought is a review, a haul, or a \"this actually held up.\"\n\nNo inventing, no faking, just stuff I really own.\n\nComment \"VIDEOS\" and I'll tell you exactly how I turn one order into three posts 👇"
      },
      {
        "title": "Tagging Gold Mine",
        "type": "Reveal / Relatable",
        "screenshot": "The order list view with products lined up ready to be tagged to a storefront.",
        "caption": "💰 Every product you've ever bought on Amazon is a tagging opportunity you're probably ignoring.\n\nI pulled mine all at once and realized I had HUNDREDS of items I could honestly talk about and tag. Free to do, and it's my own real history.\n\nThe grind isn't finding products. It's remembering the ones you already have.\n\nComment 🙋‍♀️ if you've been sleeping on your own purchase history."
      },
      {
        "title": "Free Forever Flex",
        "type": "Relatable",
        "screenshot": "The Orders Butler panel showing the finished import with the full history loaded.",
        "caption": "Okay real talk: the thing that finally unstuck my content wasn't a fancy paid tool.\n\nIt was pulling my own Amazon order history in one click, for free, and turning years of purchases into a list of things to review and tag. Stuff I already bought and stand behind.\n\nHonest content, zero guesswork.\n\nWhat's ONE product in your history you'd happily review tomorrow? Name it 👇"
      },
      {
        "title": "The Forgotten Cart",
        "type": "Interactive (drop a product)",
        "screenshot": "The imported history scrolled way back to older orders you'd forgotten about.",
        "caption": "🕰️ Scrolled back through my full order history and found products I completely FORGOT I owned.\n\nEach one is a post waiting to happen: a throwback review, a \"still using this years later,\" an honest verdict. All pulled in one click, no spreadsheet involved.\n\nYour memory forgets. Your order history doesn't.\n\nDrop ONE thing you bought ages ago and still love below 👇💛"
      }
    ]
  },
  {
    "slug": "storefront-butler",
    "name": "Storefront Butler",
    "cat": "Amazon Automation",
    "blurb": "Syncs your storefront and shows photo and video content gaps per product. Free forever.",
    "posts": [
      {
        "title": "The Content Gap List",
        "type": "Reveal",
        "screenshot": "The Storefront Butler product list showing photo and video counts per product, with the low-coverage items at the top.",
        "caption": "😳 I finally saw it in black and white: 14 products in my storefront with ZERO videos on them.\n\nStorefront Butler synced my whole storefront and put a photo count and video count next to every single product. No more guessing what to film next, it's just a list of the gaps staring back at me.\n\nTurns out I'd been over-filming my 3 favorites and ignoring the rest 🙈\n\nHow many of your products have zero video right now? Guess a number below 👇"
      },
      {
        "title": "Zero Video Club",
        "type": "Interactive",
        "screenshot": "A filtered view of Storefront Butler highlighting products that have photos but no videos yet.",
        "caption": "🎥 Comment a number 1 to 10.\n\nThat's how many products in your storefront you THINK have no video on them.\n\nI thought mine was 4. It was 14. 😭 Storefront Butler pulled in every product and showed me the video count next to each one, and wow, I'd been leaving a lot of my catalog totally uncovered.\n\nDrop your guess below and I'll tell you the fastest way to see your real number 👇"
      },
      {
        "title": "Over-Covered, Under-Covered",
        "type": "Relatable",
        "screenshot": "The Storefront Butler panel sorted so the most-covered products sit at the top and the bare ones at the bottom.",
        "caption": "🙋‍♀️ Raise your hand if you have ONE product with 12 videos and forty products with none.\n\nYeah. Same. I only saw it once Storefront Butler laid out my photo and video counts side by side for the whole storefront. My \"favorite\" was over-covered and half my catalog was invisible.\n\nSpreading that energy out is the whole game.\n\nDrop a 🙋‍♀️ if you've got a product you low-key film way too much lol"
      },
      {
        "title": "What Should I Film Today",
        "type": "Interactive (drop your link)",
        "screenshot": "Storefront Butler showing the top few products that still need content, with their empty video counts.",
        "caption": "📸 Never know what to film? Same, until now.\n\nStorefront Butler synced my storefront and sorted my products by how little content they have. My morning is easy now: open the list, film the top gap, done.\n\nDrop your storefront link below 👇 and I'll show you how to turn it into a simple \"film this next\" list instead of that overwhelmed staring-at-your-phone feeling. 💛"
      },
      {
        "title": "The Sunday Audit",
        "type": "Reveal / Relatable",
        "screenshot": "The full Storefront Butler sync view with total product count and content counts visible at a glance.",
        "caption": "☕ My whole Sunday content audit is now 5 minutes.\n\nI used to scroll my storefront on Amazon, click into products one by one, try to remember what I'd filmed. It ate an hour and I still missed stuff.\n\nStorefront Butler syncs every product and shows the photo and video count for all of them on one screen. I just scan for the zeros and that's my week's list. ✅\n\nWhat does your content planning look like right now? Tell me below 👇"
      },
      {
        "title": "Hidden Half Of My Storefront",
        "type": "Reveal",
        "screenshot": "Storefront Butler displaying the total number of synced products next to how many have no video yet.",
        "caption": "🔎 I did not realize half my storefront had never been filmed.\n\nWhen Storefront Butler synced everything, the video-count column told on me: dozens of products just sitting there with photos and no video content at all. Those are earning way under their potential.\n\nHonestly a little embarrassing but also? Now I know exactly where to point my camera. 🎯\n\nComment 🔥 if you think your \"hidden half\" is bigger than you'd like to admit"
      },
      {
        "title": "Filmed It Twice",
        "type": "Relatable",
        "screenshot": "A Storefront Butler product row showing a high video count on a single item.",
        "caption": "😂 Confession: I've filmed the same water bottle like nine times and never touched half my other products.\n\nStorefront Butler put the video counts right there next to each product and OKAY, called out. The over-covered ones were obvious and so were the poor lonely zeros.\n\nBalance is the move. Every product deserves at least one. 💛\n\nWhat's the ONE product you keep filming over and over? Confess below 👇"
      },
      {
        "title": "Five Minute Catalog Check",
        "type": "Reveal",
        "screenshot": "The Storefront Butler sync completing, showing the whole storefront pulled in with counts filled in.",
        "caption": "⏱️ It took 5 minutes to see content coverage for my ENTIRE storefront.\n\nNo clicking product by product on Amazon, no notes app tally, no guessing. Storefront Butler synced it all and showed a photo count and video count on every product at once.\n\nThat's an hour of manual auditing I get back every single week. 🙌\n\nHow long does checking your storefront usually take you? Drop it below 👇"
      },
      {
        "title": "Guess Your Gap Number",
        "type": "Interactive",
        "screenshot": "Storefront Butler with the products sorted by lowest video count so the biggest gaps are on top.",
        "caption": "🎯 Quick game. Comment the number of products in your storefront that have NO video.\n\nNo peeking, just your gut guess.\n\nWhen I finally ran mine through Storefront Butler I was off by ten. 😅 It syncs your whole storefront and shows the real video count on each product, so the guessing stops and the filming list begins.\n\nDrop your number and let's see who's the most surprised 👇"
      },
      {
        "title": "Free Coverage Map",
        "type": "Interactive (drop your link)",
        "screenshot": "The Storefront Butler overview showing photo and video counts across the synced storefront.",
        "caption": "🗺️ This is the free tool I wish I'd had a year ago.\n\nStorefront Butler maps out your entire storefront and shows how much photo and video content each product actually has. The gaps light up, the over-covered stuff stands out, and suddenly \"what do I film?\" has an answer.\n\nFree forever, no catch. 💛\n\nDrop your storefront link below 👇 and I'll walk you through reading your own coverage map."
      }
    ]
  },
  {
    "slug": "cc-deals",
    "name": "Campaign Deals",
    "cat": "Amazon Automation",
    "blurb": "Shows which products in your Creator Connections campaigns are on sale right now, with your commission rate.",
    "posts": [
      {
        "title": "Your Campaigns Are On Sale",
        "type": "Reveal",
        "screenshot": "The Campaign Deals list showing campaign products on sale right now, sorted by biggest discount with sale price and commission rate.",
        "caption": "🚨 Turns out 6 of the brands I'm already partnered with are running sales RIGHT NOW and nobody told me.\n\nThis butler scans every Creator Connections campaign I'm in and pulls the ones that are discounted today: the % off, the sale price, and my commission rate, sorted biggest deal first. 🤑\n\nA discounted product I already earn on = way easier to convert. So I post THAT one while the sale is live.\n\nDrop a 🔥 if your partnered brands never tell you when they go on sale either."
      },
      {
        "title": "Post The Discount, Not The Product",
        "type": "Relatable",
        "screenshot": "A Campaign Deals row highlighting the discount percent, sale price, and deal end time for one campaign product.",
        "caption": "Confession: I used to just post whatever campaign product I felt like that day. 🙈\n\nThen I realized people don't click 'nice product,' they click 'this is 40% off and ends tonight.' Same link, same commission, WAY more sales.\n\nNow this butler shows me exactly which of my campaign items are discounted and by how much, so I always lead with the deal that's actually live.\n\nWhat's the last thing you bought just because it was on sale? Tell me below 👇"
      },
      {
        "title": "Biggest Discount Wins",
        "type": "Interactive (drop your niche)",
        "screenshot": "The Campaign Deals panel sorted so the highest-discount campaign product sits at the top of the list.",
        "caption": "Drop your niche below and I'll tell you the move 👇\n\nHere's the thing: your best post today isn't your favorite product, it's the campaign product with the biggest discount RIGHT NOW. Deeper deal = more clicks = more of your commission.\n\nThis butler sorts all my partnered campaign items by discount so the winner is sitting right at the top. I don't guess anymore.\n\nWhat niche are you in? Beauty, home, tech? Comment it and let's find your top deal to post today. 💛"
      },
      {
        "title": "I Almost Missed It",
        "type": "Relatable",
        "screenshot": "A Campaign Deals row showing the deal end time (countdown) next to a campaign product's sale price.",
        "caption": "⏰ A brand I'm partnered with had a product 50% off... and I found out with 4 hours left on the clock.\n\nThat used to be the story of my life. The sale would end and I'd realize I could've been posting it all week. 😩\n\nNow the butler shows me the deal END TIME right next to the discount, so I know exactly how long I've got to promote it before it's gone.\n\nEver find a sale the day AFTER it ended? Please tell me I'm not alone 🙋‍♀️"
      },
      {
        "title": "Set It And Post It",
        "type": "Reveal",
        "screenshot": "The Campaign Deals refresh schedule set to update on its own so new sales appear automatically.",
        "caption": "I don't check for sales manually anymore. 🛋️\n\nI set this butler to refresh on a schedule, so it keeps re-scanning my Creator Connections campaigns and quietly surfaces any product that's gone on sale. New discount pops up? It's already at the top of my list.\n\nMy whole 'what should I post today' problem is now just: open it, grab the biggest live deal, post. 🙌\n\nComment ✅ if 'what do I even post today' is your daily struggle too."
      },
      {
        "title": "Fifteen Minutes I Got Back",
        "type": "Reveal / Relatable",
        "screenshot": "The Campaign Deals list fully populated after one refresh, showing several campaigns' on-sale products at once.",
        "caption": "I used to open every single brand's page one by one to check if anything I promote had gone on sale. Half my morning, gone. ☕😭\n\nNow one refresh and this butler lays out every on-sale product across ALL my campaigns in one list, discount and commission right there.\n\nThe time-back is the real flex. I'd rather spend it filming than digging through tabs.\n\nHow long do you spend hunting for something to post? Comment your number 👇"
      },
      {
        "title": "The Commission Was Right There",
        "type": "Reveal",
        "screenshot": "A Campaign Deals row showing the commission rate column next to the discount for a campaign product.",
        "caption": "💰 Wild thing I learned: not all my campaign products pay the same commission.\n\nSo now I don't just chase the biggest discount, I look at the discount AND my commission rate side by side. This butler shows both on every row, so I can pick the deal that's a strong discount for the buyer AND a solid rate for me.\n\nBest post = something they want to buy that also pays me well. 🎯\n\nComment 💸 if you've never actually checked which of your products pays the most."
      },
      {
        "title": "Why That Post Converted",
        "type": "Relatable",
        "screenshot": "The Campaign Deals panel with the top on-sale campaign product expanded to show discount, sale price, and rate.",
        "caption": "One of my posts randomly did 3x my normal sales last month and I couldn't figure out why. 🤔\n\nLooking back? That product happened to be on sale that week. People weren't buying because of my caption, they were buying because it was a genuine deal.\n\nSo now I do it on purpose. This butler tells me which of my campaign products are discounted so I lead with those every time, not by luck.\n\nWhat's your best-performing post ever? Drop it below, I wanna see 👀"
      },
      {
        "title": "Free Deal Radar",
        "type": "Interactive (drop your link)",
        "screenshot": "The Campaign Deals list showing multiple campaigns' products on sale with discounts and end times visible.",
        "caption": "Drop your storefront link below 👇\n\nSo many of us are sitting on brand partnerships and posting the products at FULL price while they're secretly on sale. A live discount is the easiest conversion you'll ever get, and you're just... not using it. 😩\n\nThis is the butler that shows you every campaign product you're already in that's discounted right now, sorted biggest first.\n\nDrop your link and let's make sure you're posting the deal, not the sticker price. 💛"
      },
      {
        "title": "Ride The Sale",
        "type": "Interactive",
        "screenshot": "A Campaign Deals row showing a campaign product's discount percent, sale price, and deal end time together.",
        "caption": "🏄‍♀️ My new rule: when a brand I'm partnered with puts a product on sale, I ride that wave until it ends.\n\nThe discount does half the selling for me. All I have to do is show up with the link while it's live, and this butler tells me exactly which products are on sale and when each deal ends so I never miss the window.\n\nWork smarter, post the thing that's already discounted. 🙌\n\nWhat would you post today if you knew it was 40% off right now? Comment it 👇"
      }
    ]
  },
  {
    "slug": "extension",
    "name": "Free Chrome Extension",
    "cat": "Amazon Automation",
    "blurb": "Free, no login: influencer vs brand video counts, content gaps, and Butler Approved seals on any Amazon page.",
    "posts": [
      {
        "title": "The Video Count Check",
        "type": "Reveal",
        "screenshot": "The extension badge on an Amazon product page showing the influencer video count vs brand video count.",
        "caption": "👀 I stopped guessing which products are already saturated.\n\nNow when I open any Amazon product page, a little badge tells me right there: how many influencer videos it already has vs how many are from the brand. If a product has 200 creator videos on it already, I keep scrolling. If it's wide open, I film. 🎯\n\nIt's a free Chrome extension, no login, no card. I just click and it tells me.\n\nComment 🔥 if you've ever filmed something only to find out later it was WAY too crowded to rank."
      },
      {
        "title": "Hidden Gaps in Your Orders",
        "type": "Relatable",
        "screenshot": "The extension's content-gap view listing products from your own order history that have few or no influencer videos.",
        "caption": "🛒 The wildest part? My BEST content ideas were already in my Amazon order history.\n\nThe extension scans stuff I've actually bought and flags the ones barely anyone has filmed. I owned these things. I loved them. I just never thought to make a video. 🤦‍♀️\n\nTurns out I was sitting on a content list this whole time and didn't know it.\n\nDrop a 🙋‍♀️ if you also have a house full of Amazon boxes you've never once posted about."
      },
      {
        "title": "Butler Approved Seal",
        "type": "Reveal / Interactive",
        "screenshot": "A product page with the green 'Butler Approved' seal and the visible pass/fail criteria checklist next to it.",
        "caption": "✅ This green seal changed how I pick products.\n\nWhen a product is worth filming, the extension slaps a 'Butler Approved' seal on the page, and it SHOWS me the criteria it passed and failed. No mystery. I can see exactly why it's a yes or a no. 👀\n\nDrop an Amazon product link below and I'll tell you if it earns the seal or not. Curious how many of yours pass. 👇"
      },
      {
        "title": "Storefront Checkup",
        "type": "Interactive (drop your link)",
        "screenshot": "The extension running a quick storefront checkup, surfacing dead or under-performing picks on a creator's storefront.",
        "caption": "🩺 Free storefront checkup, right here in the comments.\n\nThe extension does a quick pass on a creator storefront and flags what's quietly dragging it down. Half of us have picks up that don't help us at all anymore and we never look. 😬\n\nDrop your storefront link below 👇 and I'll run a checkup and tell you what I'd fix first. No cost, no catch, we all win when nobody's leaving money on the table. 💛"
      },
      {
        "title": "Two Hours I Got Back",
        "type": "Relatable",
        "screenshot": "The extension badge open on a product page so the competition and criteria info appears in one glance instead of manual research.",
        "caption": "⏰ I used to spend an hour before every video 'researching' a product.\n\nScrolling reviews, counting how many other creators filmed it, guessing if it was worth my time. Now the extension shows me all of that the second I land on the page. One glance and I know. 🙌\n\nThat's easily two hours back every week that I now spend actually filming.\n\nWhat's the most tedious part of your process right now? Tell me below, I want to know I'm not alone. 👇"
      },
      {
        "title": "Brand vs Creator Ratio",
        "type": "Reveal",
        "screenshot": "A close-up of the badge breaking a product's videos into influencer count and brand count.",
        "caption": "📊 Not all 'popular' products are actually competitive.\n\nSome have hundreds of videos, but they're mostly BRAND videos, not creators. That's a totally different game. The extension splits it out for me so I can see the real creator competition, not just a scary total number. 👀\n\nMade me realize a bunch of 'too crowded' products were wide open for creators like us.\n\nComment 👀 if you've ever skipped a product because the number looked scary."
      },
      {
        "title": "The Free Front Door",
        "type": "Reveal / Relatable",
        "screenshot": "The extension pinned in the Chrome toolbar with its panel open on an Amazon page, no sign-in screen in sight.",
        "caption": "🚪 No login. No card. No trial countdown.\n\nI keep getting asked how I check products so fast, and honestly it's just a free Chrome extension. I pinned it, and now every Amazon page tells me what I need to know without me signing up for a single thing. 🙌\n\nIt's genuinely the easiest tool I've added all year.\n\nComment 'ME' and I'll tell you exactly where to get it. 👇"
      },
      {
        "title": "Pass or Fail Party",
        "type": "Interactive (drop your link)",
        "screenshot": "The pass/fail criteria checklist from the Butler Approved seal, showing which checks a product passed and which it missed.",
        "caption": "🎉 Let's play pass or fail with your next product idea.\n\nThe extension doesn't just say yes or no. It shows the actual checklist: what a product passed, what it failed, and why it landed where it did. Total transparency. ✅❌\n\nDrop an Amazon product you're thinking about filming 👇 and I'll run it through the checklist and post back the pass/fail. Let's see whose idea scores highest. 🏆"
      },
      {
        "title": "It Talks to the App",
        "type": "Reveal",
        "screenshot": "The extension panel showing a product flagged, synced through to the desktop app's queue.",
        "caption": "🔗 The part that sold me: the extension syncs with the desktop app.\n\nSo when I spot a good product while browsing, I flag it in the extension and it's waiting for me in the app later. My 'competition check' and my 'to-film' list finally live in the same place instead of scattered notes on my phone. 🙌\n\nDrop a 🙌 if your content ideas are currently living in seven different places right now (be honest)."
      },
      {
        "title": "Saturation Reality Check",
        "type": "Interactive",
        "screenshot": "The badge on a heavily-filmed product showing a high influencer video count as a warning sign.",
        "caption": "🚦 Quick reality check for anyone stuck at low views.\n\nSometimes it's not your content, it's the product. If 300 creators already filmed it, you're fighting uphill no matter how good you are. The extension shows me that count BEFORE I waste a shoot on it. 😅\n\nWhat's a product you filmed that turned out way more crowded than you expected? Confess below 👇 mine was a viral water bottle, oof."
      }
    ]
  },
  {
    "slug": "instagram-butler",
    "name": "Instagram Butler",
    "cat": "Social & Outreach",
    "blurb": "Sends your Instagram DMs at a safe pace with automatic follow-ups.",
    "posts": [
      {
        "title": "The Sleep Outreach",
        "type": "Reveal / Relatable",
        "screenshot": "The Instagram Butler panel mid-run, sending DMs at a steady human pace with follow-ups queued.",
        "caption": "😴 I sent 30 storefront DMs last night. I was asleep for all of them.\n\nI wrote ONE message. Instagram Butler sends it out slow, like a real person typing, so my account doesn't get flagged. It even follows up on the people who ghost me. 💛\n\nRaise your hand if your DMs are still a copy-paste nightmare 🙋‍♀️ (mine were, it was rough lol)"
      },
      {
        "title": "The DM Math",
        "type": "Reveal",
        "screenshot": "The Instagram Butler run summary showing the number of DMs sent and follow-ups scheduled.",
        "caption": "📊 Real talk: manually DMing 40 people my storefront takes me an entire afternoon. Every. Single. Time.\n\nNow I set the template once and Instagram Butler paces it out for me, follow-ups included. That afternoon is back in my pocket. ⏳\n\nHow many hours a week do YOU lose to manual outreach? Drop the number below 👇 I wanna feel less alone"
      },
      {
        "title": "Ghosted No More",
        "type": "Relatable",
        "screenshot": "The Instagram Butler follow-up queue, showing automatic second messages lined up for non-responders.",
        "caption": "👻 We both know the money is in the follow-up. And we both know we NEVER actually do it.\n\nI'd send one DM, get ignored, and just... give up. Instagram Butler quietly circles back to the ghosts for me, on its own schedule. So many replies came from that second nudge. 🙌\n\nComment 🔥 if you've fumbled a lead just because you forgot to follow up"
      },
      {
        "title": "Slow And Safe",
        "type": "Reveal",
        "screenshot": "The Instagram Butler pacing settings, showing the safe human-speed delay between each DM.",
        "caption": "🐢 The reason my account is still alive: I stopped blasting DMs.\n\nInstagram Butler sends my storefront message at a slow, human pace, spaced out so it never looks like a bot. Steady beats spammy, every time. 💛\n\nWho here has gotten action-blocked from DMing too fast? 🙋‍♀️ Comment below, let's compare war stories"
      },
      {
        "title": "One Template Party",
        "type": "Interactive",
        "screenshot": "The Instagram Butler template editor, showing the single outreach message being set up.",
        "caption": "✍️ I write my storefront pitch ONE time. That's it.\n\nInstagram Butler takes that one template and steadily DMs it to the right people for me, then follows up. No more retyping the same thing until my thumbs hurt. 😮‍💨\n\nDrop your BEST short outreach line below 👇 I'm collecting good ones and I'll tell you what's working for me"
      },
      {
        "title": "Storefront In The Wild",
        "type": "Interactive (drop your link)",
        "screenshot": "The Instagram Butler panel set up to DM a target list with the storefront link in the message.",
        "caption": "🛍️ Drop your storefront link below 👇\n\nIt does NOTHING sitting in your bio hoping people find it. I got tired of waiting, so now Instagram Butler puts my storefront directly in front of the right people, one steady DM at a time.\n\nDrop yours and I'll show you the exact hands-off setup I use to get it seen. We all eat when nobody's link is collecting dust. 💛"
      },
      {
        "title": "The Afternoon I Got Back",
        "type": "Relatable",
        "screenshot": "The Instagram Butler dashboard showing outreach running unattended while nothing is on screen.",
        "caption": "🌤️ Yesterday I went to lunch, ran errands, and picked up my kid. Meanwhile my outreach kept going.\n\nInstagram Butler was DMing my storefront and following up the whole time, at a safe pace, without me babysitting my phone. That used to be my ENTIRE day. 😩\n\nWhat would you do with an extra afternoon each week? Tell me below 👇"
      },
      {
        "title": "Right People Only",
        "type": "Reveal",
        "screenshot": "The Instagram Butler target list loaded and ready, with the DM template attached.",
        "caption": "🎯 Outreach isn't about DMing EVERYONE. It's about steadily reaching the right people without burning your account down.\n\nI load my list, set my one message, and Instagram Butler paces the DMs and follow-ups so I stay under the radar. Calm, consistent, hands-off. 💛\n\nComment 🎯 if you'd rather send fewer, smarter DMs than spray-and-pray"
      },
      {
        "title": "The Copy-Paste Confession",
        "type": "Relatable",
        "screenshot": "The Instagram Butler run in progress, replacing the manual copy-paste DM grind.",
        "caption": "🙈 Confession: I used to copy my storefront DM, paste it, send, ctrl+c again... for HOURS. My brain was mush by post 20.\n\nInstagram Butler ended that. One template, steady pace, auto follow-ups. My thumbs and my sanity thank me daily. 😅\n\nWhat's the most DMs you've ever hand-sent in one sitting? Confess below 👇 no judgment here"
      },
      {
        "title": "Set It And Walk Away",
        "type": "Interactive",
        "screenshot": "The Instagram Butler start screen, one click away from running unattended outreach.",
        "caption": "🚶‍♀️ My favorite kind of task: the kind I set up and walk away from.\n\nI pick my template, hit go, and Instagram Butler handles the storefront DMs and follow-ups at a safe human pace while I do literally anything else. 💛\n\nWhat's the ONE task you'd hand off first if you could? Drop it below 👇 curious if we all say the same thing"
      }
    ]
  },
  {
    "slug": "messenger-butler",
    "name": "Messenger Butler",
    "cat": "Social & Outreach",
    "blurb": "Pulls your Amazon messages into one tagged inbox with the ASIN grabbed for you.",
    "posts": [
      {
        "title": "Inbox Chaos → Calm",
        "type": "Relatable",
        "screenshot": "The Messenger Butler tagged inbox: threads labeled Negotiating / Product selection / Shipped, with ASINs pulled.",
        "caption": "📥 My Amazon inbox used to look like a crime scene. 😅\n\nNow every message is pulled into ONE view, pre-tagged so I instantly see who's Negotiating, who's at Product selection, and what just shipped, with the product's ASIN grabbed for me automatically.\n\nBe honest: how many unread brand messages are sitting in your inbox right now? 👀 No judgment, drop the number 👇"
      },
      {
        "title": "The Ghosted Brand",
        "type": "Relatable",
        "screenshot": "The Messenger Butler inbox with a thread tagged Negotiating that had gone unanswered.",
        "caption": "🙈 Raise your hand if you've ever ghosted a brand by ACCIDENT.\n\nA rep messaged me a real offer, it slid down Amazon's message center, and I found it three weeks later. Dead deal. 😩\n\nNow every brand message lands in one inbox and gets tagged, so I can SEE who's mid-negotiation instead of digging. Nobody falls through the cracks anymore.\n\nComment 🙋 if a good offer has ever slipped past you too."
      },
      {
        "title": "Tag Team",
        "type": "Reveal",
        "screenshot": "The inbox showing threads color-tagged Negotiating, Product selection, and Shipped.",
        "caption": "🏷️ My brand messages basically sort themselves now.\n\nEvery thread gets tagged by where it actually is: who's still Negotiating, who's picking a Product, what already Shipped. I open the inbox and know exactly who needs me today.\n\nNo more re-reading old threads trying to remember where we left off. 💛\n\nWhat stage do MOST of your brand chats get stuck at? Drop it below 👇"
      },
      {
        "title": "Where's That ASIN",
        "type": "Relatable",
        "screenshot": "A message thread with the product ASIN pulled and shown right beside it.",
        "caption": "🔎 The ASIN scavenger hunt was my villain origin story.\n\nBrand says yes, then I'm bouncing between the chat and Amazon trying to match up WHICH product they meant. Every single time.\n\nNow the ASIN gets pulled and sits right next to the message. I read the offer and the exact product in one glance. 🙌\n\nComment 🔥 if you've ever tagged the WRONG product by mistake."
      },
      {
        "title": "Reply In Ten Seconds",
        "type": "Reveal",
        "screenshot": "The quick-reply box open on a brand thread inside Messenger Butler.",
        "caption": "⚡ Fast replies win deals, and I was always the slow one.\n\nBrands move on if you take three days to answer. My problem was never what to say, it was FINDING the message in time.\n\nNow they're all in one inbox with quick-reply built in, so I answer in seconds instead of hunting. Speed is a flex. 😎\n\nHow long do you usually take to reply to a brand? Be honest below 👇"
      },
      {
        "title": "Hours Back Sunday",
        "type": "Reveal / Relatable",
        "screenshot": "The full Messenger Butler inbox consolidating messages from multiple brand threads.",
        "caption": "⏳ I used to lose my whole Sunday to my Amazon message center.\n\nScrolling, re-reading, trying to remember who I promised what. Hours gone before I even started actual content. 😮‍💨\n\nOne tidy inbox, everything tagged, ASINs already pulled. That Sunday chore is basically a coffee-length task now, and I got my weekend back.\n\nWhat would YOU do with those hours back? Tell me below 💛"
      },
      {
        "title": "Shipped And Forgotten",
        "type": "Interactive",
        "screenshot": "Threads filtered to the Shipped tag inside the Messenger Butler inbox.",
        "caption": "📦 How many gifted products have you received and just... forgotten to post about? 👀\n\nNo shade, I had a whole shelf of them. The Shipped tag now shows me every product a brand actually sent, so I never leave content (or a relationship) on the table.\n\nOwe a brand a post? This is your reminder. 😅\n\nComment 📦 if you've got a gifted product sitting unposted RIGHT NOW."
      },
      {
        "title": "The Negotiation Pile",
        "type": "Interactive (drop your stage)",
        "screenshot": "The Negotiating tag view showing open brand deals still in talks.",
        "caption": "🤝 Quick poll: how many brand deals do you have in negotiation this week?\n\nI genuinely could NOT have told you before. They were scattered across dozens of threads. Now the Negotiating tag lines them all up so I can close them instead of losing them.\n\nSeeing them in one place changed how many I actually finish. 💪\n\nDrop your number below, let's see who's got the busiest pipeline 👇"
      },
      {
        "title": "One Inbox Confession",
        "type": "Relatable",
        "screenshot": "The single consolidated inbox replacing Amazon's scattered message center.",
        "caption": "😅 Confession: I have missed brand messages purely because Amazon's message center is a maze.\n\nNot because I'm lazy, because the good stuff hides between shipping notices and old threads. Real offers, buried.\n\nPulling them ALL into one inbox fixed the thing I was too embarrassed to admit was a problem. 💛\n\nBe honest, comment 🙈 if you've missed a message you wish you hadn't."
      },
      {
        "title": "Read Before You Reply",
        "type": "Reveal",
        "screenshot": "A brand thread with product selection details and ASIN shown together before replying.",
        "caption": "🧠 I stopped replying to brands half-informed.\n\nBefore, I'd answer an offer without even remembering which product or where we'd left off. Cringe. 😬\n\nNow each thread shows the tag, the product, and the ASIN right there, so every reply I send actually sounds like I've got my act together. Because now I do.\n\nWhat's the most awkward reply you've ever sent a brand? Spill below 👇"
      }
    ]
  },
  {
    "slug": "like-butler",
    "name": "Like Butler",
    "cat": "Social & Outreach",
    "blurb": "Auto-likes storefronts on a safe schedule so you stop tapping hearts all day. Free forever.",
    "posts": [
      {
        "title": "The Thumb Cramp Post",
        "type": "Relatable",
        "screenshot": "The Like Butler panel showing a running count of storefront posts liked today.",
        "caption": "🖐️ My thumb needed a vacation, y'all.\n\nEvery day I was scrolling storefront posts, tapping heart after heart to stay visible and reciprocal in the creator groups. It was hours. My hand hurt lol 😩\n\nNow a butler does the tapping for me, on a schedule, at a safe pace I set. I show up in all the same feeds without living in the app.\n\nRaise your hand if your liking thumb is TIRED 🙋‍♀️"
      },
      {
        "title": "Set It And Walk Away",
        "type": "Reveal",
        "screenshot": "The Like Butler settings showing the daily like limit and pacing controls.",
        "caption": "😴 I set my limits once and closed the laptop.\n\nLike Butler auto-likes Amazon storefront posts on a schedule at a pace I choose, so I stay visible and reciprocal without babysitting the feed all day. I pick how many, how fast, then walk away.\n\nBest part: it's free forever. Works on trial, paid, expired, whatever. 💛\n\nWhat would you do with the hour you'd get back? Drop it below 👇"
      },
      {
        "title": "The Reciprocity Receipts",
        "type": "Interactive",
        "screenshot": "A Like Butler run log listing storefront posts liked with timestamps.",
        "caption": "💛 Comment RECIP if you believe in liking back.\n\nCreator circles run on reciprocity. You like mine, I like yours, we all get reach. But keeping up manually? Impossible when you've got 200 people to reciprocate with. 😮‍💨\n\nMy butler quietly likes storefront posts on a schedule so I'm always holding up my end, no ghosting, no forgetting.\n\nDrop a RECIP below and let's keep each other visible 👇"
      },
      {
        "title": "Hours Back Every Week",
        "type": "Reveal / Relatable",
        "screenshot": "The Like Butler daily total, showing how many posts it liked hands-free.",
        "caption": "⏰ I got HOURS back and I'm not exaggerating.\n\nI used to block off time every single morning just to tap hearts on storefront posts so I'd stay in the mix. That's gone now. Like Butler handles the liking on a schedule at a safe pace, all by itself.\n\nSame visibility, zero of my time. 🙌\n\nHow many hours a week do YOU spend just liking? Guess below, I'm nosy 👇"
      },
      {
        "title": "Safe Pace Only",
        "type": "Reveal",
        "screenshot": "The Like Butler pacing slider set to a slow, account-safe speed.",
        "caption": "🐢 Slow and steady, on purpose.\n\nI was scared automation would get me flagged, so here's what sold me: Like Butler lets ME set the pace and the daily cap. It spaces the likes out at a safe speed instead of blasting them all at once.\n\nI stay visible, my account stays chill. 😌\n\nComment 🔥 if 'keep my account safe' is your #1 rule too."
      },
      {
        "title": "The Invisible Creator",
        "type": "Relatable",
        "screenshot": "The Like Butler panel actively liking storefront posts in the background.",
        "caption": "👻 The day I stopped liking, I basically disappeared.\n\nOne busy week, I didn't have time to tap hearts on anyone's storefront posts. Reach dropped. People forgot me. Turns out staying visible is a daily job. 😩\n\nNow the butler keeps me showing up in feeds even on my worst weeks, on a schedule, at a pace I trust.\n\nEver had a week where you just vanished? Tell me below 👇"
      },
      {
        "title": "Free Forever Flex",
        "type": "Reveal / Interactive",
        "screenshot": "The Like Butler enabled and running, with the free plan active.",
        "caption": "🆓 This one costs me nothing and I use it every day.\n\nLike Butler auto-likes storefront posts on a schedule so I stay reciprocal in the creator groups, and it's free forever. Not a trial teaser, actually free, even after my other stuff expires. 💛\n\nSet the limits, walk away, stay visible. Easy.\n\nDrop a 🆓 if 'free and actually useful' is your love language 👇"
      },
      {
        "title": "Wake Up Visible",
        "type": "Reveal",
        "screenshot": "The Like Butler morning summary showing overnight and early liking activity.",
        "caption": "🌅 I woke up already caught up on likes.\n\nWhile I was asleep, Like Butler was working through storefront posts on the schedule I set, at a safe pace. By breakfast I'd already reciprocated with the circle without lifting a finger. ☕\n\nStarting the day NOT behind? Life-changing.\n\nAre you a morning liker or a midnight scroller? Tell me below 👇"
      },
      {
        "title": "You Set The Rules",
        "type": "Interactive",
        "screenshot": "The Like Butler limit fields where you choose how many posts to like per day.",
        "caption": "🎛️ I'm the one in control, not the bot.\n\nWhat I love about Like Butler: I set the daily number, I set the pace, and it respects it. It won't go wild, it just quietly keeps me visible and reciprocal in the storefront feeds while I do literally anything else. 😅\n\nIf you could auto-like a set number a day, what number would you pick? Drop it below 👇"
      },
      {
        "title": "The Hearts Add Up",
        "type": "Relatable / Interactive",
        "screenshot": "The Like Butler running total climbing as it likes storefront posts.",
        "caption": "💗 Watching this counter tick up is weirdly satisfying.\n\nEvery like is a little 'I see you' to another creator, and those add up to reach, reciprocity, and clicks. Doing it by hand all day was burning me out though. 😮‍💨\n\nNow the butler keeps the hearts flowing on a schedule at a safe pace, and I just check the total.\n\nComment 💗 if you're here for the reciprocity, not the algorithm games 👇"
      }
    ]
  },
  {
    "slug": "instagram-like-butler",
    "name": "Instagram Like Butler",
    "cat": "Social & Outreach",
    "blurb": "Auto-likes the Instagram accounts you pick with per-account caps and safe pacing. Free forever.",
    "posts": [
      {
        "title": "The Warm List",
        "type": "Interactive (drop your handle)",
        "screenshot": "The Instagram Like Butler account list showing the creators and brands you've picked to like.",
        "caption": "💛 Drop your IG handle below and one brand you're dying to work with 👇\n\nHere's my little secret: I keep a list of the creators and brands I want to notice me, and my butler auto-likes their recent posts for me every day. Consistent, gentle, no spammy blitz.\n\nStaying visible is half the battle, and I was NOT keeping up by hand. 😅\n\nWho's on your warm list right now? Tell me below and let's cheer each other on."
      },
      {
        "title": "Hours Back",
        "type": "Reveal",
        "screenshot": "The Like Butler run summary showing how many posts it liked across your chosen accounts.",
        "caption": "😴 I used to spend an hour a day just tapping like on the same 30 accounts so they'd remember I exist.\n\nNow my butler does it. I pick who I want to stay warm with, set a daily cap per account, and it paces itself so my account stays safe. That's an hour a day back for actual content.\n\nComment ⏰ if you'd take an hour a day back too."
      },
      {
        "title": "Set The Caps",
        "type": "Reveal / Interactive",
        "screenshot": "The per-account cap settings in Like Butler where you set how many recent posts to like.",
        "caption": "🎛️ This is the setting that made me trust it.\n\nI set a cap on how many recent posts get liked per account, and it spaces them out instead of blasting everything at once. Slow and steady keeps my account looking human, which is the whole point.\n\nWhat's your daily like limit before you feel like a robot? Drop a number below 👇"
      },
      {
        "title": "Show Up Anyway",
        "type": "Relatable",
        "screenshot": "The Like Butler activity log showing likes spread across the day.",
        "caption": "🙋‍♀️ Raise your hand if you know engagement matters but you just... forget to actually show up on other people's posts.\n\nSame. I'd go quiet for a week then panic-like 50 things in one night. Not cute.\n\nNow it's automatic and gentle, spread through the day, on the exact accounts I chose. I show up even on my messy days.\n\nComment 🙋‍♀️ if you needed this too."
      },
      {
        "title": "Pick Your People",
        "type": "Interactive (drop your link)",
        "screenshot": "Adding a new creator to the Like Butler account list.",
        "caption": "👀 Drop your storefront or IG link below 👇\n\nMost of us aren't invisible because our content is bad. We're invisible because we never engage with the people we want to be seen by.\n\nMy butler lets me hand-pick the creators and brands, then keeps me on their radar by liking their recent posts on a safe schedule. No follow-for-follow nonsense, just consistency.\n\nDrop your link and tell me who you want on YOUR list. 💛"
      },
      {
        "title": "Still Free",
        "type": "Reveal / Relatable",
        "screenshot": "The Like Butler panel running while your account status shows the free plan.",
        "caption": "🆓 Quick PSA because people keep asking me: yes, this one is free forever.\n\nTrial, paid, expired, cancelled, doesn't matter. My Like Butler keeps quietly warming up my chosen accounts either way. That honestly sold me more than any fancy feature.\n\nStaying visible shouldn't cost me a subscription I forget to use.\n\nComment 🔥 if free forever is your love language too."
      },
      {
        "title": "The Safe Pace",
        "type": "Reveal",
        "screenshot": "The pacing indicator in Like Butler showing likes going out slowly over time.",
        "caption": "🐢 The reason I stopped being scared of automation: the pace.\n\nIt doesn't dump 200 likes in five minutes and get me flagged. It trickles them out on the accounts I picked, at a rhythm that looks like a real person having a normal scroll.\n\nSlow really is the flex here. My account, my rules, my safety.\n\nWhat's your biggest fear about automating IG? Tell me below and I'll be honest about it 👇"
      },
      {
        "title": "The Brand Radar",
        "type": "Interactive (drop your handle)",
        "screenshot": "A brand account added to the Like Butler list with recent posts being liked.",
        "caption": "🎯 Tag one brand you WISH would notice you 👇\n\nBrands look at who engages before they DM. So I put the brands I want on my butler's list, and it keeps liking their recent posts so I'm a familiar name when I finally slide into their notifications.\n\nWarm first, pitch second. Way less cringe.\n\nDrop the brand below and let's manifest it together. 💛"
      },
      {
        "title": "No More Tapping",
        "type": "Relatable",
        "screenshot": "The Like Butler dashboard summarizing today's likes so you don't have to do them by hand.",
        "caption": "📱 My thumb genuinely used to hurt from doom-liking every night trying to stay relevant. 😂\n\nThat's not a strategy, that's just anxiety with extra steps.\n\nNow I choose the accounts once and my butler handles the daily likes, capped and paced, while I go live my life. Same visibility, zero thumb cramp.\n\nComment 📱 if your thumb has also suffered for this game."
      },
      {
        "title": "Consistency Wins",
        "type": "Reveal / Interactive",
        "screenshot": "A week of Like Butler runs showing steady daily activity on your chosen accounts.",
        "caption": "📈 Here's a full week of me staying warm with the creators I care about, without opening the app once.\n\nThe algorithm and real humans both reward showing up EVERY day, not once in a burst. That consistency is the part I could never do by hand.\n\nNow it just happens on the accounts I picked, gently and on schedule.\n\nWhat helps you stay consistent? Drop your best tip below 👇"
      }
    ]
  },
  {
    "slug": "close-friends-butler",
    "name": "Close Friends Butler",
    "cat": "Social & Outreach",
    "blurb": "Adds people to your Instagram Close Friends on a safe schedule for a higher-engagement channel.",
    "posts": [
      {
        "title": "The Green Ring Club",
        "type": "Reveal / Interactive",
        "screenshot": "The Close Friends Butler panel showing a queue of followers lined up to be added on a schedule.",
        "caption": "💚 The green ring hits different. 💚\n\nI'm building a Close Friends only deals channel because Instagram shows those Stories to WAY more of the people who actually opted in. But adding hundreds of people by hand? No thank you. 😩\n\nSo now my butler queues them up and adds a batch every day on a safe pace while I sleep. I just walk away.\n\nWould you run a Close Friends deals channel if the setup wasn't such a slog? Comment 💚 if yes."
      },
      {
        "title": "Add Them All Party",
        "type": "Interactive (drop your link)",
        "screenshot": "A Close Friends Butler run in progress, adding people to the Close Friends list one batch at a time.",
        "caption": "🎉 ADD-THEM-ALL PARTY! Drop your storefront link below 👇\n\nHere's the move nobody talks about: a Close Friends only channel gets crazy engagement because IG treats it like a VIP list. But growing that list manually is soul crushing.\n\nDrop your link and I'll show you how I queue people once and let it add them on autopilot, safely paced so my account stays happy.\n\nFree to see how it works, and we all eat when the whole group levels up. 💛"
      },
      {
        "title": "300 In A Week",
        "type": "Reveal / Relatable",
        "screenshot": "The Close Friends Butler summary showing the total number of people added over the past week.",
        "caption": "😴 While I was living my life this week, 300 people quietly got added to my Close Friends list.\n\nI didn't tap a single \"add\" button. I dropped names in the queue once, set a safe daily pace, and my butler handled the rest so my account never looked spammy.\n\nRaise your hand if you gave up on a Close Friends channel because adding people one by one was pure torture 🙋‍♀️ (same, it broke me lol)"
      },
      {
        "title": "Hours I Got Back",
        "type": "Reveal",
        "screenshot": "The Close Friends Butler panel showing people added automatically, with the manual work it replaced.",
        "caption": "⏰ Real talk: manually adding people to Close Friends was eating an hour of my night, every night.\n\nTap the name, tap add, scroll, repeat, until my thumb went numb and I lost track of who I'd already done. 😵\n\nNow it's a queue I set once and forget. The butler paces the adds so it stays safe, and I got my evenings back.\n\nWhat's the one influencer chore you'd hand off in a heartbeat? Tell me below 👇"
      },
      {
        "title": "Why My Stories Blew Up",
        "type": "Reveal / Relatable",
        "screenshot": "The Close Friends Butler list count climbing as people are added on schedule.",
        "caption": "📈 My deal Stories went from crickets to actual clicks, and it wasn't the content.\n\nI moved my drops to a Close Friends only channel. Instagram pushes those to the people who chose in, so way more of them actually see it. The hard part was building the list.\n\nMy butler fixed that: queue everyone once, it adds them a batch a day on a safe schedule, done.\n\nAre your deal posts getting seen or getting buried? Comment 🔥 if you feel the burial."
      },
      {
        "title": "Set It And Walk Away",
        "type": "Interactive",
        "screenshot": "The Close Friends Butler queue loaded with names, set to a safe daily add pace.",
        "caption": "🚶‍♀️ My favorite kind of task: the kind I set up once and never touch again.\n\nI loaded up everyone I wanted on my Close Friends deals list, picked a safe daily pace, and closed the laptop. Every day it adds the next batch while I'm off doing literally anything else.\n\nNo more sitting there tapping until my hand cramps.\n\nWhat would you automate first if you could clone yourself? Drop it below 👇"
      },
      {
        "title": "Slow Is Safe",
        "type": "Reveal",
        "screenshot": "The Close Friends Butler settings showing the safe, paced daily add limit.",
        "caption": "🐢 The reason I don't mass-add people to Close Friends in one go? Instagram does NOT like sudden bursts.\n\nMy butler paces it. A safe batch each day, steady and boring, exactly how you keep an account healthy. Slow and safe beats fast and flagged every single time.\n\nI queue the whole list once and let it drip out on schedule.\n\nEver had an account get weird after doing too much too fast? Tell me the story 👇"
      },
      {
        "title": "The VIP Room",
        "type": "Relatable / Interactive",
        "screenshot": "The Close Friends Butler building the list that powers a Close Friends only deals channel.",
        "caption": "🎟️ I basically built a VIP room for my best deals, and people are showing up.\n\nA Close Friends only channel feels exclusive, so the folks in it actually watch and tap. The catch was getting hundreds of people INTO the room without spending my whole week on it.\n\nEnter my butler: I queue them, it adds them safely a batch at a time, I relax.\n\nWould your audience join a VIP deals room? Comment 🎟️ if you'd open one."
      },
      {
        "title": "Set The Queue Once",
        "type": "Interactive (drop your link)",
        "screenshot": "The Close Friends Butler queue filled with names, waiting to add on its daily schedule.",
        "caption": "📝 Queue once, walk away, come back to a full Close Friends list. Drop your link below 👇\n\nThis is the whole workflow: I dump everyone I want on my VIP deals channel into the queue, set a safe daily pace, and my butler adds them batch by batch without me babysitting it.\n\nDrop your storefront link and I'll walk you through setting up your own channel the same way.\n\nWe all win when nobody's stuck doing this by hand. 💛"
      },
      {
        "title": "The Thumb Cramp Post",
        "type": "Relatable",
        "screenshot": "The Close Friends Butler adding people automatically so you never tap through the list yourself.",
        "caption": "🖐️ If you've ever tried to add 200 people to Close Friends by hand, you know the thumb cramp is REAL.\n\nTap, add, scroll, lose your place, start questioning your life choices. 😅 I did it for a week before I gave up.\n\nNow my butler does the adding on a safe daily schedule and my thumbs have fully recovered, thank you for asking.\n\nWhat's the most tedious task in your influencer routine? Vent it below 👇"
      }
    ]
  },
  {
    "slug": "instagram-email-collection",
    "name": "Instagram Email Collection",
    "cat": "Social & Outreach",
    "blurb": "Scans Instagram profiles and pulls business contact emails into one exportable list.",
    "posts": [
      {
        "title": "The List Nobody Wants to Build",
        "type": "Relatable",
        "screenshot": "The Instagram Email Collection list filling up with business contact emails pulled from profiles.",
        "caption": "🙃 Raise your hand if you've ever opened 60 Instagram profiles just to copy 60 business emails by hand... and gave up around number 12.\n\nThat was me. Now a butler scans the profiles for me and drops every public contact email into one clean list. No tab hopping, no eye strain, no rage quit. 😮‍💨\n\nWhat's the most tedious task you'd hand off in a heartbeat? Tell me below 👇"
      },
      {
        "title": "One Export, One List",
        "type": "Reveal",
        "screenshot": "The finished email list with the Export to CSV button visible.",
        "caption": "📇 This is what a brand outreach list looks like when you stop building it by hand.\n\nThe butler pulls the public business emails off Instagram profiles, stacks them in one place, and lets me export the whole thing to CSV in a click. Ready to drop straight into my outreach. 💌\n\nHow are you tracking your outreach contacts right now: spreadsheet, notes app, or vibes? 😅 Comment below!"
      },
      {
        "title": "The 3-Hour Sunday",
        "type": "Reveal / Relatable",
        "screenshot": "The Instagram Email Collection panel mid-scan showing emails being collected across profiles.",
        "caption": "⏳ I used to burn my whole Sunday copying brand emails one profile at a time. Three hours, iced coffee, mild despair.\n\nNow the butler scans profiles and their DMs, grabs the public contact emails, and hands me a finished list while I do literally anything else. Same list, minutes instead of hours. ☕️\n\nWhat would YOU do with 3 hours back this week? I need ideas 👇"
      },
      {
        "title": "Drop a Niche, Build a List",
        "type": "Interactive",
        "screenshot": "A batch of collected emails from creators in one niche shown in the list.",
        "caption": "🎯 Comment your niche below (beauty, home, fitness, whatever it is) 👇\n\nHere's the thing: the more targeted your outreach list, the more replies you get. This butler scans the profiles in your corner of Instagram and pulls their public business emails into one spot, ready to reach out.\n\nDrop your niche and I'll show you how I'd build a contact list around it. Let's go. 🔥"
      },
      {
        "title": "Copy-Paste Confession",
        "type": "Relatable",
        "screenshot": "The email list growing automatically as the butler works through profiles.",
        "caption": "🙋‍♀️ Confession: I have copied the same brand's contact email into three different spreadsheets because I forgot I already had it. Chaos.\n\nOne clean list fixes that. The butler collects the public emails off Instagram profiles and keeps them together so I'm not duplicating work or losing contacts in the void. 🗂️\n\nBe honest: how many half-finished contact spreadsheets are living on your desktop right now? 😂 Comment the number!"
      },
      {
        "title": "From Scroll to Spreadsheet",
        "type": "Reveal",
        "screenshot": "The Export to CSV step turning the collected list into a ready-to-use file.",
        "caption": "📤 Scroll → collect → export. That's the whole flow now.\n\nInstead of manually hunting profile by profile, the butler gathers the public business emails from Instagram and turns them into a CSV I can open anywhere. My outreach list goes from scattered to spreadsheet without me typing a single address. ✨\n\nWould a ready-to-go CSV of contacts actually save you time? Comment YES if you'd use it 👇"
      },
      {
        "title": "Profile by Profile Is Dead",
        "type": "Relatable",
        "screenshot": "The Instagram Email Collection panel showing multiple profiles scanned in one run.",
        "caption": "☠️ Opening profiles one by one to fish for the contact email? That method is officially retired in this house.\n\nThe butler sweeps through the profiles for me and pulls the public business emails into a single list. Same info, none of the manual clicking through bio after bio. 🙌\n\nWhat's one old-school manual task you refuse to do by hand anymore? Drop it below 👇"
      },
      {
        "title": "The Outreach-Ready List",
        "type": "Reveal",
        "screenshot": "The collected email list sitting ready for outreach with contacts lined up.",
        "caption": "💌 A cold pitch is only as good as the list behind it.\n\nThis butler builds that list for me: it scans Instagram profiles, grabs the public contact emails, and lines them all up in one place so I can start reaching out instead of hunting for addresses. Export to CSV and go. 🚀\n\nWho's on your dream outreach list right now? Comment a brand or creator you'd love to pitch 👇"
      },
      {
        "title": "Comment BUILD",
        "type": "Interactive (drop your niche)",
        "screenshot": "The list of business emails collected from a single scan session.",
        "caption": "👀 Comment BUILD and tell me who you're trying to reach.\n\nSo many of us have the pitch ready but no list to send it to. The butler handles the boring part: scanning profiles, pulling the public business emails, and stacking them into one export-ready list.\n\nYou bring the niche, I'll show you how I'd turn it into a contact list. Comment BUILD below 🔥"
      },
      {
        "title": "The Tab Graveyard",
        "type": "Relatable",
        "screenshot": "The single consolidated email list replacing what used to be dozens of open tabs.",
        "caption": "🪦 RIP to the 40 tabs I used to have open just to collect contact emails one at a time. You will not be missed.\n\nNow it's one list. The butler scans the profiles, grabs the public business emails, and keeps them together so I'm not drowning in tabs and sticky notes. 🧘‍♀️\n\nHow many tabs do you have open RIGHT NOW? No lying. Comment the number 👇"
      }
    ]
  },
  {
    "slug": "levanta-butler",
    "name": "Levanta Butler",
    "cat": "Social & Outreach",
    "blurb": "Messages brands in the Levanta network and pulls their contact emails for you.",
    "posts": [
      {
        "title": "Higher Commission Hunt",
        "type": "Reveal / Relatable",
        "screenshot": "The Levanta Butler panel mid-run, messaging brands in your Levanta feed.",
        "caption": "🤫 Little secret: some of the same products you already promote pay WAY more if you deal with the brand directly instead of taking the standard rate.\n\nLevanta Butler goes through my Levanta feed and messages those brands FOR me, one personalized note at a time, so I'm not copy-pasting the same pitch all afternoon. 😮‍💨\n\nRaise your hand if you had no idea direct brand deals paid better than the default 🙋‍♀️"
      },
      {
        "title": "The Inbox Wake-Up",
        "type": "Reveal",
        "screenshot": "The Levanta Butler run log showing brands contacted overnight.",
        "caption": "😴 I went to bed. Levanta Butler stayed up.\n\nIt worked through my Levanta feed, pulled the brand contacts, and sent each one a personalized message while I slept. I woke up to a run log full of brands reached and a couple of replies already sitting in my inbox. ✨\n\nWhat would YOU do with an assistant that pitches brands overnight? Tell me below 👇"
      },
      {
        "title": "Hours Back Flex",
        "type": "Relatable",
        "screenshot": "The Levanta Butler summary showing the number of brands messaged in one run.",
        "caption": "⏰ I used to lose whole evenings hunting brand emails and writing the same outreach message over and over.\n\nNow Levanta Butler pulls the contact emails straight from my Levanta feed and sends each brand its own note. One run did what used to eat my entire Sunday. 🫠\n\nDrop a 🔥 if you'd take those hours back in a heartbeat."
      },
      {
        "title": "Drop Your Niche",
        "type": "Interactive",
        "screenshot": "The Levanta Butler feed view listing brands available to contact.",
        "caption": "👀 Comment your niche below and I'll tell you if there are higher-paying direct brand deals waiting for you.\n\nSo many creators stick with the default commission and never realize the brand itself might pay more. Levanta Butler messages those brands from my feed automatically so I actually find out. 💌\n\nWhat's your niche? Drop it below 👇"
      },
      {
        "title": "Personalized, Not Spammy",
        "type": "Reveal",
        "screenshot": "Two different outreach messages Levanta Butler generated for two different brands.",
        "caption": "✍️ The thing that sold me: it doesn't blast the same copy-paste note to everyone.\n\nLevanta Butler writes each brand its own message from my Levanta feed, so the outreach actually reads like a human sent it. Feels personal, moves fast, keeps me sane. 💛\n\nComment 🙌 if 'personalized but automated' is exactly the combo you've been wanting."
      },
      {
        "title": "The Contact Email Struggle",
        "type": "Relatable",
        "screenshot": "The Levanta Butler panel pulling contact emails from the Levanta feed.",
        "caption": "🕵️‍♀️ Anyone else spend way too long digging for a brand's actual contact email? Just me? 😅\n\nLevanta Butler pulls those emails right out of my Levanta feed and reaches out for me, so I skip the detective work entirely and get straight to the pitch.\n\nWhat's the most annoying part of brand outreach for you? Vent below 👇"
      },
      {
        "title": "Default Rate Reality Check",
        "type": "Interactive",
        "screenshot": "The Levanta Butler feed showing brands flagged for direct outreach.",
        "caption": "💸 Quick gut check: are you still taking the standard commission on every product you promote?\n\nA direct brand deal can pay more for the SAME content. Levanta Butler messages those brands from my Levanta feed so landing the better rate isn't a 40-email chore anymore. 🙌\n\nComment 'RATE' if you're ready to stop leaving that money on the table."
      },
      {
        "title": "One Pitch, Every Brand",
        "type": "Reveal / Relatable",
        "screenshot": "The Levanta Butler run in progress, sending outreach to a list of brands.",
        "caption": "📝 I wrote my outreach ONCE.\n\nLevanta Butler takes it, tailors it per brand, and works down my Levanta feed sending each one its own version. No more retyping my whole pitch for the fiftieth time and losing my mind. 🫠\n\nHands up if you're still manually messaging brands one by one 🙋‍♀️"
      },
      {
        "title": "Direct Deal Party",
        "type": "Interactive (drop your link)",
        "screenshot": "The Levanta Butler summary listing brands reached in a single session.",
        "caption": "🎉 DIRECT DEAL PARTY! Drop your storefront link below 👇\n\nHalf of us are promoting brands that would happily pay us more directly, we just never ask. Levanta Butler messages those brands from my Levanta feed so the asking part is handled. 💌\n\nDrop your link and let's see who's got higher-commission brand deals hiding in their feed."
      },
      {
        "title": "Set It And Sip",
        "type": "Relatable",
        "screenshot": "The Levanta Butler panel running on its own while you step away.",
        "caption": "☕ Started a Levanta Butler run, closed my laptop, went and lived my life.\n\nWhile I was out, it worked through my Levanta feed, pulled the brand emails, and sent personalized outreach to each one. I came back to progress instead of a to-do list. 😌\n\nWhat would you rather be doing than chasing brand emails? Tell me below 👇"
      }
    ]
  },
  {
    "slug": "pitch-butler",
    "name": "Pitch Butler",
    "cat": "Social & Outreach",
    "blurb": "Unifies brand contacts from Levanta, Instagram, and Creator Connections into one pitch queue with follow-ups.",
    "posts": [
      {
        "title": "One Pitch Queue",
        "type": "Reveal",
        "screenshot": "The Pitch Butler queue showing brand contacts from Levanta, Instagram, and Creator Connections all in one list.",
        "caption": "😮‍💨 For a year my brand contacts lived in three different places: Levanta, my Instagram DMs, and Creator Connections. Warm leads just quietly died in the gaps.\n\nNow they all pour into ONE pitch queue. Every contact, every source, one screen. Nothing hides anymore.\n\nWhere do YOUR brand leads currently live? Drop your messiest one below 👇"
      },
      {
        "title": "Status Pills",
        "type": "Relatable",
        "screenshot": "The queue with colored status pills showing Not Pitched, Pitched, and Replied across several brand contacts.",
        "caption": "Raise your hand if you've pitched the same brand twice because you genuinely could not remember 🙋‍♀️ (guilty, so many times lol)\n\nEvery contact now wears a little status pill: not pitched, pitched, replied. One glance and I know exactly who's waiting on me.\n\nComment 🙋 if you've ever double-pitched a brand by accident too."
      },
      {
        "title": "The Follow-Up Nobody Sends",
        "type": "Reveal / Relatable",
        "screenshot": "A Pitch Butler contact card showing a scheduled follow-up reminder on a brand that hasn't replied.",
        "caption": "💡 Fun fact that stung: most deals happen on the SECOND message, and I was never sending it.\n\nPitch Butler flags every brand that went quiet and lines up the follow-up for me, so the ones sitting on the fence actually get a nudge.\n\nBe honest, how many warm brands have you never followed up with? Guess your number below 👇"
      },
      {
        "title": "No Lead Left Behind",
        "type": "Interactive",
        "screenshot": "The queue filtered to Not Pitched, revealing a stack of warm contacts that were never messaged.",
        "caption": "😳 I filtered my queue to just \"not pitched\" and found 23 warm brands I'd totally forgotten about. Twenty-three!\n\nThose are people who already know me, sitting there earning me nothing because I lost track.\n\nHow many forgotten leads do you think are hiding in YOUR contacts? Drop a guess 👇 mine shocked me."
      },
      {
        "title": "Inbox To Outbox",
        "type": "Reveal",
        "screenshot": "Instagram and Creator Connections contacts flowing into the Pitch Butler outbound queue as one combined list.",
        "caption": "📥 The problem was never finding brand contacts. It was that they scattered across my Instagram, Levanta, and Creator Connections and I could never work them like a real list.\n\nNow it's one outbound queue I actually run top to bottom. Warm leads finally get worked instead of buried.\n\nWhat's your go-to place for finding brand leads right now? Tell me below 👇"
      },
      {
        "title": "The Sunday Pitch Sprint",
        "type": "Relatable",
        "screenshot": "The Pitch Butler queue mid-session with several contacts moving from Not Pitched to Pitched.",
        "caption": "☕ My whole Sunday pitch routine used to be me tab-hopping across three sites trying to remember who I'd already contacted. Exhausting.\n\nNow I sit with one queue, work it top to bottom, and every brand gets a pitch and a follow-up on schedule. Calm instead of chaos.\n\nWhat does your outreach routine look like right now? Spill it below 👇"
      },
      {
        "title": "Hours Back",
        "type": "Reveal (hours saved)",
        "screenshot": "The unified queue showing dozens of contacts from all three sources gathered on one screen.",
        "caption": "⏱️ I used to burn an entire evening just gathering my brand contacts before I could pitch a single one. The gathering WAS the work.\n\nPitch Butler pulls Levanta, Instagram, and Creator Connections into one queue automatically, so that whole evening is just gone. I go straight to pitching.\n\nHow many hours a week do you lose to admin before you even reach out? Drop your number 👇"
      },
      {
        "title": "A Real CRM Finally",
        "type": "Reveal",
        "screenshot": "The Pitch Butler board showing status pills and follow-up reminders like a simple sales pipeline.",
        "caption": "💛 I always felt like the big creators had some secret system. Turns out it's just... a CRM. A place where every lead has a status and a next step.\n\nThat's exactly what this is now: contacts in, status pills on, follow-ups scheduled. My pitching finally feels like a pipeline, not a panic.\n\nDo you track your brand outreach anywhere right now, or is it all in your head? Be honest 👇"
      },
      {
        "title": "The Ghosted List",
        "type": "Interactive (drop your link)",
        "screenshot": "A Pitch Butler view of brands marked Pitched with pending follow-ups queued up.",
        "caption": "👻 Every brand that ghosts you isn't a no. Half the time they just got busy and forgot you existed.\n\nPitch Butler keeps a follow-up lined up for each one, so the quiet ones get a second, warm nudge instead of vanishing forever.\n\nDrop your storefront link below 👇 and I'll show you how a follow-up queue actually works. We all win when nobody leaves deals on the table."
      },
      {
        "title": "One Screen, Every Brand",
        "type": "Interactive",
        "screenshot": "The full Pitch Butler queue with sources, status pills, and follow-up dates all visible at once.",
        "caption": "🗂️ Genuine question for the group: how many separate places are you checking to keep up with brand leads right now?\n\nBecause I was up to three, and things kept slipping. Now it's one screen showing every contact, its status, and its next follow-up. My brain feels quieter.\n\nComment your number below 👇 1, 2, 3, more? Let's see who's got the messiest setup lol."
      }
    ]
  },
  {
    "slug": "facebook-group-builder",
    "name": "Facebook Group Builder",
    "cat": "Social & Outreach",
    "blurb": "AI-plans and builds a niche Facebook deals group, then hands it to the Deals Butler.",
    "posts": [
      {
        "title": "Own Your Audience",
        "type": "Reveal / Relatable",
        "screenshot": "The Facebook Group Builder panel showing a freshly generated group name, description, and rules set.",
        "caption": "😮 I stopped chasing the algorithm and built my OWN Facebook deals group instead.\n\nName, description, rules, welcome post, a full posting plan: all mapped out for me in one pass. Then it hands the group off to my Deals Butler to auto-post finds into. 🙌\n\nAn audience I OWN beats one I rent from a feed that hides my posts. Comment 🏡 if you're tired of renting your reach."
      },
      {
        "title": "Name My Group Party",
        "type": "Interactive",
        "screenshot": "The Group Builder showing several AI-suggested niche group names to pick from.",
        "caption": "🎉 Naming a Facebook group is the hardest part, so I let the butler do it.\n\nI told it my niche and it handed me a list of group names, a description, and rules ready to paste. No more staring at a blank box for an hour. 😅\n\nWhat niche would YOUR deals group be in? Drop it below 👇 and I'll tell you the name it came up with for mine."
      },
      {
        "title": "Rules Written For Me",
        "type": "Reveal",
        "screenshot": "The generated group rules and welcome post inside the Group Builder panel.",
        "caption": "📋 Every good Facebook group needs rules and a welcome post, and I was NOT about to write those from scratch.\n\nThe Group Builder wrote both for me, tuned to a deals niche, so new members know exactly what the group is for the second they join. 💛\n\nDo you run a group already, or thinking about starting one? Comment 🆕 or 👑 so I know where you're at."
      },
      {
        "title": "The Posting Plan",
        "type": "Reveal / Interactive",
        "screenshot": "The posting plan the Group Builder generated, showing what to post and when.",
        "caption": "🗓️ The reason most deals groups die? Nobody knows what to post, so they post nothing.\n\nMine came with a full posting plan built in: what kind of post, how often, in what order. Then the Deals Butler auto-drops the actual deals so the group never goes quiet. 🔥\n\nComment 🔥 if a plan-it-for-me posting schedule is exactly what you've been missing."
      },
      {
        "title": "From Zero In One Sitting",
        "type": "Relatable",
        "screenshot": "The Group Builder mid-plan, generating name, description, rules, and welcome content together.",
        "caption": "😮‍💨 I had put off starting a group for MONTHS. Too many decisions.\n\nThen I ran the Group Builder and walked away with the name, description, rules, welcome content, and a posting plan in one sitting. The blank-page paralysis just... vanished. 🙏\n\nWhat's the one thing you keep putting off in your creator biz? Drop it below 👇, no judgment here."
      },
      {
        "title": "Hours Back In My Week",
        "type": "Reveal / Relatable",
        "screenshot": "The completed Group Builder output: name, description, rules, welcome post, and posting plan on one screen.",
        "caption": "⏰ Planning a group from scratch used to be a whole weekend for me: naming, rules, welcome posts, figuring out a schedule.\n\nThe Group Builder did all of it in one pass and handed the finished group to my Deals Butler to fill. I got my weekend back. 🛋️\n\nIf you could buy back a weekend, what would you actually do with it? Tell me below 👇"
      },
      {
        "title": "The Handoff",
        "type": "Reveal",
        "screenshot": "The Group Builder handing the finished group off to the Deals Butler for auto-posting.",
        "caption": "🤝 My favorite part isn't building the group, it's the handoff.\n\nThe Group Builder plans the whole thing, then passes it straight to the Deals Butler, which auto-posts deals into it for me. Build once, then it feeds itself. 🍽️\n\nComment 🤖 if hands-off is the only way you'd actually keep a group alive (same, honestly)."
      },
      {
        "title": "Welcome Post Done",
        "type": "Interactive (drop your niche)",
        "screenshot": "The AI-written welcome post for a new deals group inside the Group Builder.",
        "caption": "👋 A warm welcome post is what turns a random member into a repeat commenter, and mine got written FOR me.\n\nTuned to my niche, ready to pin, sets the tone from minute one. New folks actually stick around. 💛\n\nDrop your niche below 👇 and I'll show you the welcome post it wrote for a group like yours."
      },
      {
        "title": "Rented Vs Owned",
        "type": "Relatable",
        "screenshot": "The finished group blueprint in the Group Builder: an audience you control, not one you rent.",
        "caption": "🏠 Real talk: posting on someone else's page is renting. Building your own group is owning.\n\nThe Group Builder planned mine end to end so I finally have a space the algorithm can't bury: my name, my rules, my members. 💪\n\nRented or owned right now? Comment 🏘️ for rented, 🔑 for owned, and let's see where this group stands."
      },
      {
        "title": "Start The Group Challenge",
        "type": "Interactive",
        "screenshot": "The Group Builder generating a full niche group plan from a single niche input.",
        "caption": "🚀 Little challenge for us: what deals niche would your Facebook group be in?\n\nKitchen gadgets? Baby finds? Pet stuff? Drop it and I'll run the Group Builder on it. It plans the name, rules, welcome post, and posting plan, then my Deals Butler keeps it fed. 🍰🐶\n\nDrop your niche in the comments 👇 and I'll reply with the group it built."
      }
    ]
  },
  {
    "slug": "deals-butler",
    "name": "Deals Butler",
    "cat": "Content & Deals",
    "blurb": "Finds hot deals, injects your promo codes, writes captions in your voice, and auto-posts across platforms.",
    "posts": [
      {
        "title": "The Hours I Got Back",
        "type": "Reveal",
        "screenshot": "The Deals workspace showing today's deals already posted across every platform.",
        "caption": "🛋️ I used to spend 2-3 HOURS every single day hunting deals, writing captions, dropping my codes, and posting them one platform at a time.\n\nToday I spent zero. My deals workspace found the deals, wrote the captions in my voice, dropped my promo codes in, and posted them everywhere on a schedule while I lived my life.\n\nBe honest: how many hours a day are you losing to manual deal posting right now? Drop the number 👇"
      },
      {
        "title": "One Deal, Six Platforms",
        "type": "Reveal (the big flex)",
        "screenshot": "One deal in the workspace fanned out to Instagram, Threads, Facebook groups + pages, Telegram, and Reddit.",
        "caption": "🌐 I posted ONE deal this morning. It went to Instagram, Threads, Facebook groups AND pages, Telegram, and Reddit. Automatically.\n\nSame deal, six audiences, six chances to earn, and I only touched it once.\n\nWhich platform are you NOT posting your deals to yet? Drop it below and let's fix that 👇"
      },
      {
        "title": "Scared of Reddit?",
        "type": "Relatable / Interactive",
        "screenshot": "The workspace with the Reddit destination toggled on, deals going out to subreddits.",
        "caption": "😅 Raise your hand if Reddit scares you. 🙋‍♀️\n\nI avoided it for a year because the rules felt like a minefield. Now my deals workspace posts my deals to Reddit for me, on a schedule, so I actually show up where buyers go to HUNT for deals.\n\nWhat platform have you been too intimidated to try? Drop it below 👇"
      },
      {
        "title": "My Codes Drop Themselves In",
        "type": "Reveal",
        "screenshot": "A deal-post preview with the creator's promo code auto-inserted into the caption.",
        "caption": "🎟️ Confession: I used to forget to add my promo code to half my deal posts. That's just free money I gave away. 😩\n\nNow my code drops into every single deal post automatically. Every platform, every time, no forgetting.\n\nHow many posts do you think you've made WITHOUT your code attached? 👀 Be honest 👇"
      },
      {
        "title": "It Catches Price Crashes While I Sleep",
        "type": "Reveal / Interactive",
        "screenshot": "The workspace flagging a sudden price drop and auto-queuing it as a deal post.",
        "caption": "📉 A product I love crashed 60% in price at 2am. By the time I woke up, my workspace had already caught it and posted it as a deal.\n\nPrice crashes don't wait for you to be awake. Now I don't miss them.\n\nWhat's the best price crash you've ever caught? Drop the % below 👇"
      },
      {
        "title": "90 Days of Deals, Zero Missed",
        "type": "Reveal / Relatable",
        "screenshot": "The workspace calendar showing an unbroken streak of daily deal posts.",
        "caption": "🔥 I've posted deals every single day for 90 days straight. Want to know how many I posted by hand? Zero.\n\nConsistency is what actually grows a deals audience, and consistency is the FIRST thing that dies when you're doing it manually.\n\nWhat's the longest posting streak you've ever kept up on your own? 👇"
      },
      {
        "title": "It Hunts the Deals For Me",
        "type": "Reveal",
        "screenshot": "The workspace pulling fresh deals and ASINs from deal-aggregator sites into the queue.",
        "caption": "🕵️‍♀️ I don't hunt for deals anymore. My workspace scans the deal sites, grabs the products, and lines them up ready to post.\n\nI went from 'what do I even post today??' to a queue that's already full before I open my laptop.\n\nWhere do you find your deals right now? Drop your method below 👇"
      },
      {
        "title": "Every Country to the Right Store",
        "type": "Reveal",
        "screenshot": "The workspace deep-link routing setting sending US / CA / UK / AU buyers to their local Amazon.",
        "caption": "🌎 Half my audience isn't even in the US. For years, every one of them clicked my link and hit the wrong Amazon store = no commission.\n\nNow my deal links auto-route every follower to THEIR country's store. Same post, more of my clicks actually converting.\n\nHow international is your audience? Drop the country mix in the comments 👇"
      },
      {
        "title": "My Telegram Runs Itself",
        "type": "Reveal / Interactive",
        "screenshot": "The workspace posting deals into a Telegram deals channel automatically.",
        "caption": "📢 I built a Telegram deals channel and honestly forgot it existed, because it runs itself. Every deal I schedule lands there automatically.\n\nTelegram buyers are RABID for deals and almost no creator is using it. Free real estate.\n\nAre you on Telegram yet? Comment 📢 if you want me to share how I set mine up 👇"
      },
      {
        "title": "The Captions Sound Like ME",
        "type": "Relatable / Reveal",
        "screenshot": "Two deal-post captions in the workspace written in the creator's own tone and voice.",
        "caption": "✍️ My biggest fear with automation was sounding like a spam bot. Hard pass.\n\nBut my workspace writes each deal caption in MY voice, my slang, my energy. My followers can't tell the difference, and honestly neither could I. 😂\n\nWhat's a word or phrase your audience knows is 100% YOU? Drop it below 👇"
      }
    ]
  },
  {
    "slug": "video-reload-butler",
    "name": "Video Reload Butler",
    "cat": "Content & Deals",
    "blurb": "Restores Amazon-removed videos, flips horizontal to vertical, and reloads them across marketplaces.",
    "posts": [
      {
        "title": "Turn Old Horizontal Videos Vertical",
        "type": "Reveal / Interactive",
        "screenshot": "The Video Reload Butler panel showing videos being restored, flipped horizontal to vertical, and reloaded to US/CA/UK/AU/SG.",
        "caption": "🎬 That old horizontal video collecting dust? It could be earning again, as a vertical.\n\nThis restores videos Amazon deleted, refreshes the titles, flips horizontal to vertical, AND reloads them to the US, Canada, UK, Australia, and Singapore. One old video, five countries, brand new life. 🌎\n\nWho's got a graveyard of old content they never repurposed? 🙋‍♀️ (guilty)"
      },
      {
        "title": "Back From the Dead",
        "type": "Reveal",
        "screenshot": "A Video Reload Butler run showing a video Amazon had removed, restored and back live.",
        "caption": "🪦 Amazon pulled one of my best videos and I thought it was gone forever. 😩\n\nTurns out it wasn't. My butler grabbed the old recording, restored it, and put it right back up earning again like nothing happened.\n\nAll those views I thought I lost? Back on the board. 📈\n\nHow many videos have YOU lost to a random takedown? Drop a number below 👇"
      },
      {
        "title": "One Video, Five Countries",
        "type": "Reveal / Relatable",
        "screenshot": "The Video Reload Butler panel re-uploading one recording across US, Canada, UK, Australia and Singapore storefronts.",
        "caption": "🌍 I used to post a video in ONE country and call it done. Rookie mistake.\n\nNow my butler takes a single recording and re-uploads it across the US, Canada, UK, Australia and Singapore. Same video, shoppers in five countries, five chances to earn. 💸\n\nWhy was I only selling to one storefront this whole time?? 🤦‍♀️\n\nWhich countries are you posting to right now? Tell me below 👇"
      },
      {
        "title": "The Title Facelift",
        "type": "Interactive",
        "screenshot": "A Video Reload Butler run refreshing the titles on a batch of older videos.",
        "caption": "✨ Same video. Brand new title. Suddenly it's getting found again.\n\nSo many of my old uploads had tired, boring titles that nobody was searching for. My butler refreshed them in a batch and a few stale videos started crawling back up. 📈\n\nTitles matter WAY more than I gave them credit for.\n\nDrop the title of a video that flopped and I'll tell you how I'd freshen it up 👇"
      },
      {
        "title": "My Whole Back Catalog Woke Up",
        "type": "Reveal",
        "screenshot": "The Video Reload Butler queue processing a full back catalog of old recordings at once.",
        "caption": "📼 I have YEARS of old recordings just sitting there doing nothing.\n\nInstead of filming new stuff, I pointed my butler at the whole pile. It restored the dead ones, refreshed titles, flipped a few to vertical, and re-uploaded them out to other countries.\n\nOld work, brand new life, zero new filming. 🙌\n\nHow many old videos are collecting dust in YOUR library? Guess a number below 👇"
      },
      {
        "title": "A Weekend Back",
        "type": "Relatable",
        "screenshot": "A Video Reload Butler summary showing the batch of videos reloaded and the countries they went out to.",
        "caption": "⏰ Reformatting old videos and re-uploading them country by country used to eat my entire weekend.\n\nDownload, re-crop, rename, re-upload, repeat. For every single storefront. I hated it. 😤\n\nMy butler does that whole loop while I'm making coffee. I got my Saturday back.\n\nWhat's the one Amazon task that steals YOUR weekend? Vent it below 👇"
      },
      {
        "title": "The Takedown Isn't the End",
        "type": "Relatable",
        "screenshot": "A Video Reload Butler run recovering a deleted video and putting a fresh title on it.",
        "caption": "💔 That gut-punch when you see 'this video has been removed' on a post that was actually earning.\n\nUsed to ruin my whole day. Now it barely registers. My butler pulls the old recording, gives it a fresh title, and re-uploads it. Back in business. 💪\n\nRaise your hand if Amazon has ever nuked one of your good videos 🙋‍♀️ (comment 🔥 if it stung)"
      },
      {
        "title": "Drop Your Storefront",
        "type": "Interactive (drop your link)",
        "screenshot": "The Video Reload Butler panel showing recovered and refreshed videos ready to re-upload.",
        "caption": "👇 Drop your Amazon storefront link below.\n\nI'll bet you've got removed videos, tired titles, or content stuck in just one country. That's money sitting still. 😴\n\nMy butler restores the dead ones, refreshes titles, and re-uploads across international storefronts so one old post earns in a bunch of places.\n\nDrop the link and I'll tell you what I'd reload first. Free to look 💛"
      },
      {
        "title": "Sold in One Country, Earning in Five",
        "type": "Reveal / Interactive",
        "screenshot": "A Video Reload Butler run pushing a single refreshed video out to multiple international storefronts.",
        "caption": "🛫 A shopper in Australia just clicked a video I filmed for the US and forgot about.\n\nMy butler had already refreshed it and re-uploaded it to the UK, Canada, Australia and Singapore. I did nothing. The recording was just sitting there before. 🤯\n\nAmazon influencing isn't only a US game and I wish someone told me sooner.\n\nWhat country are YOU leaving on the table? Name it below 👇"
      },
      {
        "title": "Reloaded, Not Refilmed",
        "type": "Reveal / Relatable",
        "screenshot": "The Video Reload Butler panel mid-run restoring, retitling and re-uploading a batch of old clips.",
        "caption": "🎬 Everyone says 'just post more videos' like filming is free. It's not, it's exhausting. 😮‍💨\n\nSo I stopped chasing new and started reloading old. Restore the removed ones, refresh the titles, flip the format, send them to more countries. My butler runs the whole thing.\n\nMore content, more storefronts, none of the filming. 🙌\n\nWould you rather film new or reload old? Comment NEW or OLD below 👇"
      }
    ]
  },
  {
    "slug": "photo-reload-butler",
    "name": "Photo Reload Butler",
    "cat": "Content & Deals",
    "blurb": "Re-posts your storefront photos to international storefronts with fresh tags, and reloads removed photos.",
    "posts": [
      {
        "title": "One Photo, Five Countries",
        "type": "Reveal",
        "screenshot": "The Photo Reload Butler panel showing a US photo cloned out to Canada, UK, Australia, and Singapore storefronts.",
        "caption": "📸 I took ONE photo I already posted to my US storefront and put it on my Canada, UK, Australia, and Singapore storefronts too.\n\nSame picture. Fresh country tags. Now the same shot has four more places to earn instead of just one. 🌍\n\nEvery country has shoppers, and most of us only ever post to the US and forget the rest even exist.\n\nComment 🌍 if you never once posted to your other-country storefronts."
      },
      {
        "title": "The Photos Amazon Deleted",
        "type": "Relatable",
        "screenshot": "A Photo Reload Butler run listing storefront photos Amazon had removed, queued to be reloaded.",
        "caption": "😩 Did you know Amazon quietly REMOVES some of your storefront photos? No email, no warning. You just stop earning on them and never know.\n\nThis found the ones of mine that got pulled and reloaded them so they're live and earning again.\n\nI had photos gone that I put real effort into. Gutting.\n\nDrop a 💔 if you've had content disappear on you and had no idea."
      },
      {
        "title": "Not Just Videos",
        "type": "Reveal / Relatable",
        "screenshot": "The Photo Reload Butler mid-run, reposting still photos across multiple country storefronts.",
        "caption": "🙄 Every tool out there only reposts your VIDEOS. Meanwhile my photos just sat on the US storefront doing nothing everywhere else.\n\nThis one actually does PHOTOS. It takes my storefront pics and reloads them to Canada, UK, Australia, and Singapore with fresh tags.\n\nMy photo content finally earns in more than one country. 📷\n\nRaise your hand 🙋‍♀️ if most of your storefront is photos, not video."
      },
      {
        "title": "Free Money Recheck",
        "type": "Interactive (drop your link)",
        "screenshot": "A Photo Reload Butler scan showing how many US photos are missing from a creator's other-country storefronts.",
        "caption": "👀 Drop your storefront link below 👇\n\nI'll show you how many photos you have on your US storefront that are NOT on your Canada, UK, Australia, or Singapore ones. That's earning content just sitting in one country.\n\nIt reloads them for you with fresh country tags so the same photos work in all five.\n\nFree to check, so drop your link and let's find your leftover money. 💛"
      },
      {
        "title": "Woke Up, Four New Storefronts",
        "type": "Reveal",
        "screenshot": "The Photo Reload Butler completion summary showing a batch of photos reposted overnight across four countries.",
        "caption": "😴 While I slept, every photo on my US storefront got copied to my Canada, UK, Australia, and Singapore storefronts with fresh tags.\n\nI didn't re-upload a single thing by hand. Woke up to four extra storefronts stocked with the content I already made. 🌎\n\nSame photos, four more countries earning.\n\nComment 🔥 if you'd take four extra storefronts for zero extra shooting."
      },
      {
        "title": "Hours I Got Back",
        "type": "Reveal / Relatable",
        "screenshot": "The Photo Reload Butler run log showing dozens of photos reposted across countries in one batch.",
        "caption": "⏰ Reposting my photos to four other-country storefronts by hand would've been an entire weekend of copy, tag, upload, repeat.\n\nThis did the whole batch for me while I made dinner. Every US photo now live on Canada, UK, Australia, and Singapore with fresh tags. 🍝\n\nI got my Saturday back AND four more storefronts earning.\n\nWhat would you do with a weekend back? Tell me below 👇"
      },
      {
        "title": "Your Photos Are Multi-Country",
        "type": "Interactive",
        "screenshot": "A Photo Reload Butler preview matching one US storefront photo to its new Canada, UK, Australia, and Singapore listings.",
        "caption": "🌍 Quick question: which countries is your storefront actually in?\n\nMost of us only post to the US and never touch Canada, UK, Australia, or Singapore. Those shoppers still scroll, and your photos could be there earning.\n\nThis takes the pics you already posted and reloads them across all of them with fresh tags.\n\nComment the country you'd want to earn in first 👇"
      },
      {
        "title": "Reload the Ghosts",
        "type": "Relatable",
        "screenshot": "A Photo Reload Butler results view counting removed photos it detected and put back live.",
        "caption": "👻 Ever notice a storefront photo of yours just... gone? Amazon pulls them sometimes and never tells you.\n\nThose are dead spots. Content you made, effort you spent, earning nothing because it's not even up anymore.\n\nThis found mine and reloaded them so they're live again. Felt like recovering lost work. 💾\n\nComment 👻 if you've ever caught a post of yours mysteriously missing."
      },
      {
        "title": "Same Shot, Fresh Tags",
        "type": "Reveal",
        "screenshot": "The Photo Reload Butler panel showing fresh country-specific tags applied to a reposted US photo.",
        "caption": "🏷️ Here's the part I love: it doesn't just dump my US photo onto the other storefronts, it puts FRESH tags on each one so the products match that country.\n\nSame photo, tags that actually work in Canada, UK, Australia, and Singapore. Now it's real earning content, not a broken copy. ✨\n\nComment 🏷️ if you never realized tags need to change per country."
      },
      {
        "title": "The Storefronts You Forgot",
        "type": "Interactive (drop your link)",
        "screenshot": "A Photo Reload Butler overview listing a creator's empty other-country storefronts next to their full US one.",
        "caption": "🤫 Confession: I forgot my UK and Australia storefronts even existed. Totally empty while my US one was packed.\n\nThen I ran this and it filled them with the photos I already had, fresh tags and all. Canada and Singapore too. 🌏\n\nBet you've got empty ones sitting there right now.\n\nDrop your link below 👇 and I'll show you which storefronts of yours are running on empty."
      }
    ]
  },
  {
    "slug": "retag-butler",
    "name": "Retag Butler",
    "cat": "Content & Deals",
    "blurb": "Finds content tagged to dead products and adds a live replacement link, up to 500 per run.",
    "posts": [
      {
        "title": "Dead Link Check",
        "type": "Interactive (drop your link)",
        "screenshot": "A Retag Butler run showing a count of dead links found and replaced.",
        "caption": "💀 DEAD LINK CHECK! 💀 Drop your storefront link below 👇\n\nSo many of us have old videos tagged to products Amazon already pulled. Views still coming in, but the link is dead = $0. 😩\n\nDrop your link and I'll show you how many of your old posts are pointing at nothing, then swap in a live product and that content starts earning AGAIN (up to 500 in one pass).\n\nFree to check, and we all win when nobody's leaving money on the table. 💛"
      },
      {
        "title": "The Zombie Post",
        "type": "Reveal",
        "screenshot": "A Retag Butler results list showing old posts flagged with a dead product and a live swap-in ready.",
        "caption": "🧟 I have zombie content and I didn't even know it. 😳\n\nOld reels still pulling views, but tagged to products Amazon quietly pulled. So the views come in, the link goes nowhere, and I earn a big fat $0. 💀\n\nRetag Butler found mine and dropped in a live product WITHOUT wiping my original tag, so nothing breaks. Comment 🧟 if you think you've got zombies too and I'll tell you how I hunted mine down."
      },
      {
        "title": "500 In One Run",
        "type": "Reveal / Relatable",
        "screenshot": "A Retag Butler run summary showing the batch count of content pieces scanned and retagged in a single pass.",
        "caption": "😮‍💨 I scanned hundreds of old posts for dead links in ONE run. Manually? That's weeks of clicking every single link to see if it still works.\n\nInstead it swept up to 500 pieces at once, flagged the dead ones, and added a live replacement product to each. My original tags stayed put too.\n\nHow many old posts are you sitting on right now? Drop a rough number below 👇 I bet it's more dead than you think."
      },
      {
        "title": "Found Money Friday",
        "type": "Relatable",
        "screenshot": "A Retag Butler panel showing the number of revived posts now pointing at live products again.",
        "caption": "💸 This felt like finding cash in an old coat pocket.\n\nContent I made months ago was still getting views but earning nothing because the tagged product was gone. I wasn't losing money on ads, I was leaving it on the table from stuff I ALREADY made. 😩\n\nOne pass revived a whole stack of them with fresh live links. What's the oldest post you've got that's still getting views? Tell me below 👇"
      },
      {
        "title": "Keep The Original",
        "type": "Reveal",
        "screenshot": "A Retag Butler before-and-after view showing the original tag kept and a live replacement product added alongside it.",
        "caption": "🙌 The part that sold me: it does NOT delete my original tag.\n\nI was scared a fix like this would wipe my work and tank the post. Nope. It keeps what's there and adds a live product link on top, so worst case nothing changes and best case a dead post starts earning again.\n\nWho else has been too nervous to touch their old content? Comment 🔥 if that's you and I'll walk you through it."
      },
      {
        "title": "The Slow Bleed",
        "type": "Relatable",
        "screenshot": "A Retag Butler scan showing a running tally of dead-link posts detected across a creator's back catalog.",
        "caption": "🩸 Nobody warns you about the slow bleed.\n\nEvery so often Amazon pulls a product, and one more of your old posts goes dark. You don't notice because there's no alert, no email, nothing. Just quiet $0 views piling up. 😮‍💨\n\nRetag Butler surfaced all of mine in one scan so I could actually SEE the damage. Comment BLEED and I'll show you how to check your own back catalog."
      },
      {
        "title": "Set It And Sweep",
        "type": "Reveal",
        "screenshot": "A Retag Butler run in progress, working through the queue of old content and swapping in live links.",
        "caption": "☕ Started a Retag sweep, made a coffee, came back to a list of revived posts. That's the whole story.\n\nIt worked through my old content, spotted the dead links, and slotted in live replacement products while I did literally nothing. My original tags never got touched.\n\nWhat would you do with the time back if your old posts just fixed themselves? Tell me below 👇"
      },
      {
        "title": "Views Without The Payout",
        "type": "Relatable",
        "screenshot": "A Retag Butler summary contrasting posts still getting traffic against the dead links they were pointing at.",
        "caption": "📈 Getting views but not getting paid is the most frustrating combo in this game. 😤\n\nTurns out a chunk of my traffic was landing on old posts whose products no longer exist. The audience showed up, the link was a dead end, I got nothing.\n\nRetag Butler matched each one with a live product so those views finally convert. Raise your hand 🙋‍♀️ if you've felt the pain of great views and a sad payout."
      },
      {
        "title": "Back Catalog Audit",
        "type": "Interactive (drop your link)",
        "screenshot": "A Retag Butler results screen listing a creator's older posts with dead-vs-live status marked for each.",
        "caption": "🔎 Doing a back catalog audit and honestly everyone should.\n\nMost of us obsess over the NEXT post and forget the dozens behind us quietly going dead. Retag Butler audited mine, flagged the broken ones, and added live products so they earn again.\n\nDrop your storefront or profile link below 👇 and I'll tell you roughly how much of your old stuff is pointing at nothing. Free to look."
      },
      {
        "title": "Reuse Don't Redo",
        "type": "Reveal / Relatable",
        "screenshot": "A Retag Butler panel showing revived older posts now linked to current in-stock products.",
        "caption": "♻️ Why film something new when the old post already has the views?\n\nI kept chasing fresh content while a pile of my past posts sat there dead, still getting seen but tagged to products that vanished. Retag Butler revived them with live links instead of me redoing the work.\n\nReuse beats redo every time. Comment ♻️ if you'd rather revive old content than film another video today."
      }
    ]
  },
  {
    "slug": "voiceover-butler",
    "name": "Voiceover Butler",
    "cat": "Content & Deals",
    "blurb": "Writes AI voiceover scripts in your voice with FTC disclosures baked in.",
    "posts": [
      {
        "title": "Blank Page Killer",
        "type": "Relatable",
        "screenshot": "The Voiceover Butler panel showing a finished script generated from a product, ready to record.",
        "caption": "✍️ Raise your hand if you've filmed the perfect clip and then stared at the ceiling for 20 minutes trying to write what to SAY over it 🙋‍♀️\n\nThat blank page used to end my whole filming day. Now I drop the product in and get a script back in my own tone, in my niche, ready to read out loud. FTC line already built in too.\n\nWhat's the video you keep putting off because of the voiceover? Tell me below 👇"
      },
      {
        "title": "The FTC Line Nobody Remembers",
        "type": "Reveal",
        "screenshot": "A generated script with the FTC disclosure line highlighted at the top.",
        "caption": "😬 Real talk: half of us forget the disclosure until the video is already posted.\n\nEvery script this writes has the FTC line baked in from the first sentence, so I'm not editing it in later or crossing my fingers. It also runs brand-safety checks on each line so I'm not saying something a brand will flag.\n\nComment ✅ if you've ever posted first and remembered the disclosure second (no judgment, we've all done it)."
      },
      {
        "title": "Say It In My Voice",
        "type": "Reveal / Relatable",
        "screenshot": "The tone and niche settings panel next to a script that matches that voice.",
        "caption": "🎙️ The thing that finally sold me: the scripts actually sound like ME.\n\nI set my tone, my niche, and who I'm talking to, and it writes to that instead of some stiff robot voice I'd have to rewrite anyway. I read it straight off the screen and it flows.\n\nHow would you describe YOUR on-camera voice in three words? Drop them below 👇 I'm curious."
      },
      {
        "title": "Fit Check Built In",
        "type": "Reveal",
        "screenshot": "A fashion item script that references the creator's own height and sizing.",
        "caption": "👗 Fashion creators, this one's for you.\n\nWhen it writes a script for a clothing item, it grounds it in MY actual fit, my height and my sizing, so I'm not guessing on camera or saying something that doesn't match my body. Way more honest, way less awkward.\n\nWhat's your go-to phrase for talking about fit in a try-on? Share it below 👇 let's swipe each other's best lines."
      },
      {
        "title": "Film Faster Friday",
        "type": "Relatable",
        "screenshot": "A batch of finished scripts lined up, each tied to a different product.",
        "caption": "⏱️ I used to spend more time writing what to say than actually filming.\n\nNow the script is done before the camera's even set up, so I batch three or four videos in the time one used to take. The words wait on the panel = I just read and record.\n\nHow long does writing a voiceover usually eat out of your filming day? Drop a number below 👇 I want to know I'm not alone."
      },
      {
        "title": "Brand-Safe Every Line",
        "type": "Reveal",
        "screenshot": "The Voiceover Butler flagging and rewording a risky claim before it reaches the final script.",
        "caption": "🛡️ Ever say something in a video and think later \"wait, was that a claim I'm not supposed to make?\"\n\nThis runs a brand-safety guard on every single line, so the risky wording gets caught and reworded before it ever hits my final script. Fewer takedowns, calmer nights.\n\nComment 🔥 if you've ever had a post flagged and had no idea which line did it."
      },
      {
        "title": "Drop A Product, Get A Script",
        "type": "Interactive (drop your product)",
        "screenshot": "The Voiceover Butler input field with a product pasted in and a script appearing beside it.",
        "caption": "🎬 Little experiment for the group.\n\nDrop ONE product below that you've been meaning to make a video about but couldn't figure out how to talk about it. 👇\n\nI'll show you the kind of script this spits back: your tone, your niche, disclosure already in, brand-safe. Sometimes seeing the words is all it takes to finally hit record.\n\nWho's brave enough to go first? 💛"
      },
      {
        "title": "The Time-Back Flex",
        "type": "Reveal / Relatable",
        "screenshot": "A stack of completed scripts with timestamps showing how quickly they were generated.",
        "caption": "😮‍💨 I got about two hours of my week back and I didn't change my posting schedule at all.\n\nAll of it came from not writing voiceovers from scratch anymore. Product in, script out in my voice, and I spend that saved time actually filming instead of chewing my pen.\n\nIf you got two hours back this week, what would you spend them on? Tell me below 👇 be honest, mine was a nap."
      },
      {
        "title": "Who's Your Audience Really",
        "type": "Interactive",
        "screenshot": "The audience setting selected, with a script written to speak directly to that viewer.",
        "caption": "🎯 One thing that changed my scripts overnight: telling it exactly WHO I'm talking to.\n\nWhen I set my audience, the words come back speaking straight to that person instead of \"hey guys\" into the void. Feels like a conversation, not an ad read.\n\nDescribe your ideal viewer in one sentence below 👇 I'll tell you what I set mine to, it might spark yours."
      },
      {
        "title": "From Clip To Post In Minutes",
        "type": "Relatable / Interactive",
        "screenshot": "A finished, ready-to-record script beside the product it was written for.",
        "caption": "🚀 The gap between \"I filmed something cute\" and \"it's actually posted\" used to be DAYS for me, all because of the voiceover.\n\nNow the script's ready in minutes, in my tone, disclosure in, brand-safe, so the clip doesn't die in my drafts folder.\n\nHow many unfinished videos are sitting in your camera roll right now? Comment the number below 👇 no shame, mine was scary."
      }
    ]
  },
  {
    "slug": "youtube-butler",
    "name": "YouTube Butler",
    "cat": "Content & Deals",
    "blurb": "Uploads your storefront videos to YouTube with your affiliate QR code stamped on.",
    "posts": [
      {
        "title": "Second Life For Old Videos",
        "type": "Reveal / Relatable",
        "screenshot": "The YouTube Butler panel showing a storefront video queued for upload with the affiliate QR code stamped on it.",
        "caption": "🎬 That storefront video you made months ago? It's still working for you right now.\n\nYouTube Butler grabs the videos I already posted to my Amazon storefront and uploads them to YouTube, with my affiliate QR code stamped right on the clip. Same content, brand new audience finding it. 👀\n\nI didn't film anything new. I just stopped letting old videos sit in one place doing nothing.\n\nWhat's a video you're proud of that only lives in ONE spot right now? Drop it below 👇"
      },
      {
        "title": "Free Reach Party",
        "type": "Interactive",
        "screenshot": "A YouTube Butler upload confirmation showing a storefront video now live on YouTube with the QR overlay.",
        "caption": "🥳 FREE REACH PARTY! Comment 🎥 if your storefront videos only live on Amazon right now.\n\nHere's the thing nobody tells you: the content you already made can pull views AND clicks from a whole second platform without you filming a single new thing.\n\nYouTube Butler reposts my storefront videos to YouTube and stamps my QR code on them, so people scanning from YouTube land on MY link.\n\nComment 🎥 and I'll walk you through how it works. 💛"
      },
      {
        "title": "The QR On The Video",
        "type": "Reveal",
        "screenshot": "A close-up of a video frame with the affiliate QR code overlay in the corner.",
        "caption": "📱 See that little code in the corner? That's my affiliate QR, stamped right onto the video.\n\nSomeone watching on YouTube can point their phone at the screen and land straight on my storefront. No caption link needed, no bio hunting, it's baked into the content itself. 🤯\n\nAnd I didn't design it or edit anything. YouTube Butler adds it when it uploads.\n\nWho else had no idea you could put your link INSIDE the video? Comment 🙋 if that's you."
      },
      {
        "title": "Hours I Got Back",
        "type": "Relatable",
        "screenshot": "The YouTube Butler queue showing a batch of storefront videos uploading at once.",
        "caption": "😮‍💨 Reuploading videos to YouTube one by one, writing titles, exporting, adding a link... I used to lose whole evenings to it.\n\nNow YouTube Butler takes the storefront videos I already have and pushes them to YouTube in a batch, QR code stamped on, while I go live my life.\n\nThat's hours back every single week for content I ALREADY filmed.\n\nRaise your hand if reposting content across platforms is the chore you keep putting off 🙋‍♀️"
      },
      {
        "title": "Two Platforms One Film Day",
        "type": "Reveal / Relatable",
        "screenshot": "A YouTube Butler run showing multiple Amazon storefront videos matched to new YouTube uploads.",
        "caption": "🎞️ I film once. Now that one video works on two platforms.\n\nMy storefront videos used to just sit on Amazon. YouTube Butler takes those same clips, uploads them to my channel, and stamps my affiliate QR right on the frame so YouTube viewers can click through too.\n\nSame effort, double the places people can find me. Feels a little like cheating honestly. 😅\n\nHow many platforms are you actually posting your videos to? Drop the number below 👇"
      },
      {
        "title": "Money Left On The Table",
        "type": "Relatable",
        "screenshot": "The YouTube Butler panel listing storefront videos that have not yet been posted to YouTube.",
        "caption": "💸 A video you already filmed, sitting on ONE platform, is money left on the table.\n\nThose Amazon storefront clips took real time to make. YouTube Butler sends them to YouTube with my affiliate QR stamped on, so they start pulling views and clicks from people who'd never have found my Amazon page.\n\nNo new filming. Just squeezing every drop out of content I already made. 🍋\n\nHow many old videos do you have just sitting in one place? Comment a rough number 👇"
      },
      {
        "title": "Drop Your Channel",
        "type": "Interactive (drop your link)",
        "screenshot": "A storefront video freshly published to a YouTube channel with the QR overlay visible in the thumbnail.",
        "caption": "🔗 Drop your YouTube channel below if it's been collecting dust 👇\n\nSo many of us have a channel we started and abandoned, meanwhile we've got a stack of good storefront videos elsewhere.\n\nYouTube Butler takes those existing videos, uploads them for you, and stamps your affiliate QR on each one so the views actually turn into clicks.\n\nDrop your channel and let's get some life back into it. We all win when nobody's content is going to waste. 💛"
      },
      {
        "title": "Woke Up To Views",
        "type": "Reveal",
        "screenshot": "A YouTube Butler completion summary showing a batch of storefront videos uploaded overnight.",
        "caption": "☀️ Woke up this morning and my storefront videos were already live on YouTube.\n\nI lined them up before bed. YouTube Butler uploaded them one by one with my affiliate QR stamped on each, and I didn't touch a thing. New platform, same videos, working while I slept. 😴\n\nContent I filmed weeks ago is now reaching people I never would've reached.\n\nComment 🔥 if the idea of your old videos earning on autopilot sounds good to you."
      },
      {
        "title": "Where's Your Content Hiding",
        "type": "Interactive",
        "screenshot": "The YouTube Butler dashboard showing storefront videos on the left and their new YouTube uploads on the right.",
        "caption": "🤔 Quick gut check: where are your product videos actually living right now?\n\nMost of us pour effort into storefront clips and then leave them stranded on one platform. YouTube Butler repurposes those exact videos onto YouTube and stamps my affiliate QR on them so a whole new crowd can click through.\n\nSame content, more doors for people to walk in. 🚪\n\nTell me in the comments: what platform are your videos NOT on yet? 👇"
      },
      {
        "title": "No Filming Required",
        "type": "Reveal / Interactive",
        "screenshot": "A YouTube Butler upload in progress with the affiliate QR code being applied to a storefront video.",
        "caption": "🎥 Best part of growing on YouTube this month? I filmed exactly zero new videos.\n\nYouTube Butler took my existing Amazon storefront clips, uploaded them to my channel, and stamped my affiliate QR right on the frame so viewers can scan and shop.\n\nIt's free extra reach from work I already did. That's my favorite kind of growth. 😌\n\nComment 🎬 if you'd repost your old videos too, if it were this easy."
      }
    ]
  },
  {
    "slug": "earnings-intelligence",
    "name": "Earnings Intelligence",
    "cat": "Earnings & Growth",
    "blurb": "Shows top earners, trends, and hidden winners, with a monthly breakdown by source.",
    "posts": [
      {
        "title": "The Receipts Post",
        "type": "Reveal",
        "screenshot": "The top HUD bar showing \"Hours Saved 93.5h / Money Saved $3,738.51.\"",
        "caption": "⏰ I added it up and almost fell out of my chair. 😳\n\n93 HOURS. That's how much time I've saved not manually tapping, refreshing, retagging, and posting this year. That's over TWO FULL WORK WEEKS handed back to me. 💛\n\nWe got into this to make content and money, not to be a full-time button-pusher for Amazon.\n\nWhat would you do with 93 extra hours? Drop it below 👇"
      },
      {
        "title": "Hidden Money Check",
        "type": "Reveal / Interactive",
        "screenshot": "The Earnings panel showing lifetime earnings per product broken out by source (Onsite, CC, Brand deals, Bonus, International).",
        "caption": "💰 Most creators have NO idea which of their old products quietly started paying them again. I sure didn't.\n\nThis breaks my lifetime earnings down per product by source, and it resurfaces past winners that came back to life. I found products I'd completely forgotten were still making me money. 👀\n\nWhat's the one product that's earned you the most all-time? Drop it below 👇"
      },
      {
        "title": "Top 3 Truth",
        "type": "Reveal",
        "screenshot": "The Earnings Intelligence top earners list ranked across dates, stores, and marketplaces.",
        "caption": "💡 Turns out 3 products were carrying my whole month and I had NO idea which ones.\n\nI always assumed my \"viral\" video was the moneymaker. Nope. This ranks every product I've ever tagged by what it actually paid, across all my stores and marketplaces, and the real top 3 shocked me. 😅\n\nTwo of them I'd basically stopped posting about. Guess who's making a fresh video today.\n\nComment 🔥 if you have NO clue what your actual top earner is right now."
      },
      {
        "title": "The Monthly Split",
        "type": "Reveal / Relatable",
        "screenshot": "A monthly breakdown splitting one month into Onsite, Creator Connections, Brand deals, Bonus, and International.",
        "caption": "📊 I finally know where my money actually comes from, month by month.\n\nEvery month gets split into buckets: Onsite, Creator Connections, brand deals, bonus, and international. Before this I just saw one lump number and shrugged. Now I can see Creator Connections quietly became a third of my income. 👀\n\nThat completely changed what I pitch this week.\n\nWhich income bucket do you think is your biggest? Drop your guess below 👇"
      },
      {
        "title": "Tax Time Flex",
        "type": "Relatable",
        "screenshot": "The Earnings Intelligence export button producing a clean CSV or Excel file.",
        "caption": "🧾 It used to take me a full weekend to pull my earnings together for my bookkeeper.\n\nDigging through every marketplace, copy-pasting numbers into a spreadsheet, crying a little. This year? One export button. Clean CSV or Excel, already split by month and source, done in about 10 seconds.\n\nThat's a whole Saturday I got back. ☕\n\nHow many hours does your earnings paperwork steal from you every month? Tell me below 👇"
      },
      {
        "title": "Passport Money",
        "type": "Reveal",
        "screenshot": "The International row in the monthly breakdown showing earnings from other marketplaces.",
        "caption": "🌍 I've been getting paid by shoppers in other countries and barely noticed.\n\nMy International bucket had a running total I never looked at because it lands separately from my main marketplace. Small amounts, sure, but they stacked up over the year into real money I was ignoring. 💸\n\nNow I actually make a couple videos with international shoppers in mind.\n\nDid you know your links earn overseas too? Comment 🌎 if this is news to you."
      },
      {
        "title": "The Comeback Kid",
        "type": "Interactive",
        "screenshot": "The trends view highlighting a product whose earnings climbed month over month.",
        "caption": "📈 One of my old products is climbing again and I would've missed it completely.\n\nThe trends view flags what's rising and what's fading across months, so instead of guessing I can see a product that started paying more with zero new effort from me. Probably went on sale or hit a season. 🎯\n\nPerfect excuse to repost it while it's hot.\n\nWhat's a product you'd repost TODAY if you knew it was trending up? Drop it below 👇"
      },
      {
        "title": "Onsite vs Connections",
        "type": "Interactive (drop your guess)",
        "screenshot": "The source breakdown comparing Onsite earnings against Creator Connections side by side.",
        "caption": "🤔 Quick gut check: do you make more from Onsite commissions or from Creator Connections?\n\nI would've bet everything on Onsite. Then I saw mine split side by side and Creator Connections was way bigger than I thought. That one number told me exactly where to spend my energy this month. 💪\n\nNo more guessing which effort actually pays.\n\nGuess your split in the comments, then check for real. What's your gut say? 👇"
      },
      {
        "title": "The Bonus Surprise",
        "type": "Reveal / Relatable",
        "screenshot": "The Bonus row in the monthly source breakdown showing bonus earnings for the month.",
        "caption": "🎁 Raise your hand if you forget bonus payouts are even a thing 🙋‍♀️\n\nI did. They land at random and blend into everything else, so I never gave them credit. Seeing bonuses broken out as their own line each month showed me they add up to more than I assumed over a year.\n\nLittle wins I was writing off completely. 😌\n\nComment 🎉 if a surprise bonus payout has ever made your whole week."
      },
      {
        "title": "Stop Guessing Party",
        "type": "Interactive (drop your link)",
        "screenshot": "The full Earnings Intelligence dashboard with top earners, trends, and the monthly source breakdown visible.",
        "caption": "🕵️‍♀️ Drop your storefront link below and let's talk real numbers 👇\n\nSo many of us are flying blind, posting product after product and just HOPING something sticks. I did that for a year. Then I saw my top earners, my trends, and my monthly source split all in one place and everything clicked. 🔑\n\nI stopped guessing what makes me money and started leaning into what already does.\n\nDrop your link and I'll tell you where I'd start digging first. We all win when nobody's guessing. 💛"
      }
    ]
  },
  {
    "slug": "goldmine-butler",
    "name": "Goldmine Butler",
    "cat": "Earnings & Growth",
    "blurb": "Scans creators' storefronts for #ad and #partner posts and hands you the brands to pitch.",
    "posts": [
      {
        "title": "Brand Hunt Party",
        "type": "Interactive (highest comment-driver)",
        "screenshot": "The Goldmine Butler results list showing brand names + ASINs pulled from a creator's storefront.",
        "caption": "🔥 BRAND HUNT PARTY! 🔥 Drop your niche below 👇\n\nI'm pulling up creators in your space and grabbing every brand that's ACTIVELY paying them right now, real names, real products, ready for you to pitch.\n\nComment your niche (beauty, home, fitness, toys, whatever) and I'll reply with a few brands already doing #ad and #partner deals in it. 💛\n\nNo more guessing who to email. The receipts are right there. 🙌"
      },
      {
        "title": "The Spy Report",
        "type": "Reveal",
        "screenshot": "A Goldmine Butler results list showing brand names and product titles pulled from other creators' #ad posts.",
        "caption": "🕵️‍♀️ I stopped guessing which brands to pitch and just looked at who's ALREADY paying creators in my niche.\n\nThis scans other storefronts for #ad and #partner posts and hands me the brand names, the exact products, and the ASINs. No cold guessing, just a list of brands with a proven habit of paying people like me.\n\nRaise your hand if you've ever pitched a brand that has NEVER worked with a creator 🙋‍♀️ (waste of a good email lol)\n\nWhat niche are you in? Drop it below 👇 and I'll tell you what kind of brands show up."
      },
      {
        "title": "Warm Leads Only",
        "type": "Relatable",
        "screenshot": "The Goldmine Butler panel highlighting a brand that appears across multiple creators' partnered posts.",
        "caption": "Cold pitching is soul-crushing. 😩 You write the perfect email, hit send, and it disappears into a void.\n\nSo I flipped it. Instead of pitching random brands, I only reach out to ones I can SEE are already paying creators. This pulls those brands straight off other people's #ad posts, so every name on my list has a track record.\n\nWarm leads feel completely different to pitch. My confidence went up overnight. 💛\n\nComment 🔥 if you're done cold-pitching brands that were never going to say yes."
      },
      {
        "title": "Steal Their Rolodex",
        "type": "Reveal / Interactive",
        "screenshot": "A Goldmine Butler scan of a single creator's storefront listing every brand they've tagged in partnered content.",
        "caption": "There's a creator in your niche who did the hard work of landing 15 brand deals. 👀\n\nInstead of reinventing the wheel, I scan their storefront and it hands me every brand they've partnered with, plus the products and ASINs. Those brands clearly pay creators AND clearly like this exact style of content.\n\nIt's not stealing, it's a shortcut to a proven target list. 😅\n\nTag or name a creator you'd love to 'borrow the brand list' from, drop it below 👇"
      },
      {
        "title": "Two Hours, One List",
        "type": "Reveal",
        "screenshot": "A completed Goldmine Butler run showing a full list of brands gathered from a batch of creator storefronts.",
        "caption": "⏱️ I used to spend HOURS scrolling storefronts, screenshotting brands, and building a pitch list by hand.\n\nNow this does the digging for me. It scans creator storefronts, finds the #ad and #partner posts, and hands me a clean list of brands, products, and ASINs while I make coffee. ☕\n\nAll that time back, and the list is honestly better than the one I built manually.\n\nHow long do YOU spend building a brand pitch list? Tell me below, I want to feel less alone 👇"
      },
      {
        "title": "Who's Getting Paid",
        "type": "Interactive",
        "screenshot": "The Goldmine Butler brand column with product titles next to each brand it found in partnered posts.",
        "caption": "Real talk: half the brands people pitch have never paid a single creator. 🫠 You're basically volunteering.\n\nThis flips the whole thing. It surfaces the brands that ARE cutting checks, because it finds them inside real #ad and #partner posts from creators in your space.\n\nSo now my list is just 'people who already pay for this.' Way better hit rate. 🎯\n\nComment the ONE brand you're dying to land a deal with 👇 let's see who shows up the most."
      },
      {
        "title": "The Copycat Advantage",
        "type": "Relatable",
        "screenshot": "A Goldmine Butler result showing the same brand tagged across several different creators.",
        "caption": "When I see one brand show up in a bunch of creators' partnered posts, that's not a coincidence. 🧠 That brand has a budget and a habit of saying yes.\n\nThis catches those patterns for me. It scans storefronts, spots the brands that keep appearing in #ad content, and hands me the names and products. The repeat offenders are my hottest leads.\n\nCopy what works, right? 😌\n\nWhat's a product category you WISH more brands would pay creators to promote? Drop it below 👇"
      },
      {
        "title": "Your First 10 Pitches",
        "type": "Reveal / Interactive",
        "screenshot": "A fresh Goldmine Butler list of ten brands with product titles, ready to build a pitch list from.",
        "caption": "Starting out and don't know which brands to email? Same, I was totally lost. 🫤\n\nInstead of Googling 'brands that work with influencers' for the hundredth time, I let this scan creators in my niche. It handed me my first real list of brands, complete with the exact products and ASINs they're already paying to promote.\n\nTen warm names beat a hundred random guesses every single time. 💛\n\nAre you a beginner or a veteran at brand deals? Comment BEGINNER or VET below 👇"
      },
      {
        "title": "The Pattern Nobody Sees",
        "type": "Reveal",
        "screenshot": "A Goldmine Butler run surfacing a niche brand hidden in a small creator's partnered posts.",
        "caption": "The best brands to pitch aren't the huge ones everyone fights over. 🙅‍♀️ They're the smaller ones quietly paying mid-size creators.\n\nThis finds those hidden gems. It scans storefronts, digs into the #ad and #partner posts, and surfaces the under-the-radar brands with real budgets that nobody's flooding with pitches yet.\n\nLess competition, more replies. That's the whole game. 🎯\n\nDrop your niche below 👇 and I'll tell you the kind of sneaky-good brands that tend to pop up."
      },
      {
        "title": "Proof, Not Guesses",
        "type": "Relatable",
        "screenshot": "The Goldmine Butler panel showing a brand name linked to the actual partnered post it was found in.",
        "caption": "I wasted a whole month pitching a 'dream brand' that, turns out, has never once paid a creator. 🤦‍♀️ Pure guessing.\n\nNow every brand on my list comes with proof: it was pulled from a real #ad or #partner post, so I KNOW they pay. No hoping, no vibes, just names, products, and ASINs backed by evidence.\n\nPitching feels so much better when you're not just crossing your fingers. 💛\n\nWhat's the wildest 'brand ghosted me' story you've got? Spill it below 👇"
      }
    ]
  },
  {
    "slug": "ads-goldmine-butler",
    "name": "Ads Goldmine",
    "cat": "Earnings & Growth",
    "blurb": "Surfaces products Amazon is actively pushing by scoring ad and sponsor-density signals.",
    "posts": [
      {
        "title": "Follow The Ad Money",
        "type": "Reveal",
        "screenshot": "The Ads Goldmine Butler results list with ASINs sorted by ad-density score, top products at the top.",
        "caption": "💰 What if you only promoted products brands are ALREADY paying to sell?\n\nThis butler scores Amazon products on real ad signals: Lightning Deals, Creator Connections, Sponsored Products, brand-search activity. The higher the score, the more money is behind that product right now.\n\nI stopped guessing what to post. I just promote what the brands are already advertising for me. 🙌\n\nComment 🔥 if you're done promoting stuff nobody's pushing."
      },
      {
        "title": "The Sponsor-Density Score",
        "type": "Reveal / Relatable",
        "screenshot": "A single ASIN's detail view showing the breakdown of ad signals that make up its sponsor-density score.",
        "caption": "Ever pick a product, make a whole video, and it just... goes nowhere? 😩 Same.\n\nTurns out the products that pop are usually the ones brands are spending ad money on. This butler shows me a sponsor-density score for each product, built from Lightning Deals, Sponsored ads, and Creator Connections activity.\n\nNow I check the score BEFORE I film. Wild concept, I know. 😂\n\nWhat's the last product you promoted that flopped? Tell me below 👇"
      },
      {
        "title": "Brands Are Already Spending",
        "type": "Reveal",
        "screenshot": "The Ads Goldmine Butler panel highlighting a product flagged for active Creator Connections and Sponsored Products signals.",
        "caption": "🎯 Here's a product with real ad money behind it right now.\n\nThe butler caught it because brands are running Creator Connections AND Sponsored Products on it at the same time. That's a brand actively trying to sell, which means my content lands in warm demand instead of dead air.\n\nI'd rather ride a wave someone's already funding than start one alone. 🌊\n\nComment 🎯 and I'll show you how to find these in your niche."
      },
      {
        "title": "Lightning Deal Radar",
        "type": "Interactive",
        "screenshot": "The results filtered to products with active Lightning Deals surfaced by their ad-signal score.",
        "caption": "⚡ Lightning Deals = a brand pouring budget into moving units FAST.\n\nThis butler surfaces products with live Lightning Deals near the top of the list, because a deal that hot is basically a signal the brand wants creators pushing it today.\n\nI catch these while the ad spend is still live, not after it's over. ⏳\n\nDrop your niche below 👇 and let's see what's getting the ad push right now."
      },
      {
        "title": "Hours I Got Back",
        "type": "Relatable",
        "screenshot": "The Ads Goldmine Butler mid-scan, working through a batch of ASINs and scoring their ad signals.",
        "caption": "⏰ I used to spend HOURS scrolling Amazon trying to guess what to promote.\n\nOpen a product, check if there's a deal, dig for sponsor signals, repeat forever. It was soul-crushing and I still guessed wrong half the time.\n\nNow the butler scans a whole batch and hands me a scored list of what has real ad money behind it. Minutes, not a lost afternoon. 😮‍💨\n\nHow many hours a week do you spend just PICKING products? Guess below 👇"
      },
      {
        "title": "The Brand-Search Signal",
        "type": "Reveal / Interactive",
        "screenshot": "A product entry showing brand-search activity contributing to its ad-density score.",
        "caption": "🔎 One of my favorite signals this butler tracks: brand-search activity.\n\nWhen a brand is actively driving searches to a product, that's ad money working behind the scenes. The butler folds that into the score, so I can spot products with momentum I couldn't see on my own.\n\nIt basically shows me where the marketing budgets are pointing. 📈\n\nComment 🔎 if you want to see how this one reads your niche."
      },
      {
        "title": "Promote The Push",
        "type": "Reveal / Relatable",
        "screenshot": "The top of the Ads Goldmine Butler list showing the highest-scoring ad-backed product of the day.",
        "caption": "💡 Simple rule that changed my content: promote what brands are already advertising.\n\nThis butler ranks products by how much ad and sponsor activity is behind them. The one at the top today is the product with the most money pushing it. So that's the one I'm making content on. 🎬\n\nNo more coin flips. I just read the list and go.\n\nWhat product is at the top of YOUR list right now? Drop it below 👇"
      },
      {
        "title": "Sponsored Products Goldmine",
        "type": "Interactive (drop your niche)",
        "screenshot": "The Ads Goldmine Butler results filtered to ASINs with heavy Sponsored Products ad activity.",
        "caption": "📢 If a brand is running Sponsored Products ads on something, they WANT it selling.\n\nThis butler flags those products and scores how heavy the sponsor activity is, so I can align my content with what brands are already funding. Their ad budget does the warming up, my content does the closing. 🤝\n\nDrop your niche in the comments 👇 and let's find the ones getting the ad push."
      },
      {
        "title": "Stop Guessing Party",
        "type": "Relatable",
        "screenshot": "The scored list side by side, showing a high ad-signal product next to a near-zero one.",
        "caption": "🙋‍♀️ Raise your hand if you've ever promoted a random product on vibes alone. (Me. Constantly.)\n\nLook at this: two products, one lit up with ad signals, one basically silent. Same effort to make content on either, but only one has brand money pushing demand.\n\nThe butler makes that difference impossible to miss. I finally stopped guessing. 😅\n\nComment 🙋‍♀️ if you've been guessing too, no judgment here."
      },
      {
        "title": "Where The Ad Budgets Point",
        "type": "Reveal / Interactive",
        "screenshot": "The full Ads Goldmine Butler dashboard with ASINs ranked by combined ad and sponsor-density score.",
        "caption": "🗺️ Think of this as a map of where Amazon's ad budgets are pointing.\n\nThe butler pulls together Lightning Deals, Creator Connections, Sponsored Products, and brand-search signals into one score, then ranks every product. The stuff near the top has real money behind it, today.\n\nI just follow the map instead of wandering. 🧭\n\nWant me to run your niche through it? Drop it below 👇"
      }
    ]
  },
  {
    "slug": "collab-butler",
    "name": "Collab Butler",
    "cat": "Earnings & Growth",
    "blurb": "Gives every brand deal a card that moves itself from shipment to filmed to published.",
    "posts": [
      {
        "title": "How Do You Track Your Collabs?",
        "type": "Relatable / Interactive",
        "screenshot": "The Collab Butler board with cards moving through Awaiting shipment → In progress → Submitted → Published → Archived.",
        "caption": "📋 Serious question: how are you tracking your brand deals right now? Spreadsheet? Notes app? Pure vibes and prayer? 🙈\n\nEvery brand I message turns into a card automatically and moves itself: shipment → filming → submitted → published → paid. I never re-type a thing, and nothing falls through the cracks.\n\nTell me your tracking system below, I want to see who else is running on chaos like I used to 😂👇"
      },
      {
        "title": "The Ghosted Box",
        "type": "Relatable",
        "screenshot": "The Collab Butler board with a card sitting in the Awaiting shipment column past its due date.",
        "caption": "📦 That brand promised to ship weeks ago and now... crickets. 😬\n\nI used to completely forget which brands still owed me product until my content calendar had a hole in it. Now every deal gets a card that sits in Awaiting shipment with a due date, so the ghosters are impossible to miss.\n\nMy board tells me exactly who to nudge instead of me trying to remember at 11pm.\n\nWho's the brand that ghosted YOU after the yes? 👇"
      },
      {
        "title": "Stages On Autopilot",
        "type": "Reveal",
        "screenshot": "A single collab card being dragged from In progress into Submitted on the Collab Butler board.",
        "caption": "✨ Every brand deal I have is a little card that moves itself through stages: Awaiting shipment → In progress → Submitted → Published → Archived.\n\nI'm not keeping any of it in my head anymore. I glance at the board and I instantly know what's shot, what's edited, what I still owe.\n\nThe best part: every brand I message with Amazon Butler shows up here on its own. Zero manual setup.\n\nComment 🔥 if your collab tracking is currently just a vibe and a prayer."
      },
      {
        "title": "Deadline Rescue",
        "type": "Reveal / Relatable",
        "screenshot": "The Collab Butler board sorted by due date with the nearest deadline card at the top.",
        "caption": "😅 Confession: I once missed a paid deadline because I genuinely forgot it existed.\n\nNever again. Every card carries the due date the brand gave me, and my board floats the soonest one to the top. I open it in the morning and the most urgent deal is staring right at me.\n\nNo more scrolling old DMs trying to remember what I promised and when.\n\nWhat's the closest you've come to blowing a brand deadline? Tell me I'm not alone 👇"
      },
      {
        "title": "Nothing Falls Through",
        "type": "Reveal",
        "screenshot": "The Collab Butler board showing a new card that appeared automatically from an Amazon Butler brand message.",
        "caption": "🤯 I message a brand with Amazon Butler and a collab card just APPEARS on my board. I didn't type a thing.\n\nSo the deal I said yes to at midnight isn't living in a DM I'll never scroll back to. It's a card, in a stage, with a home.\n\nThat's the whole reason I stopped losing track of deals. The tracking starts itself.\n\nHow many brand convos are buried in your DMs right now that you totally forgot about? 👇"
      },
      {
        "title": "Sunday Board Reset",
        "type": "Interactive",
        "screenshot": "The full Collab Butler board showing cards spread across all five stage columns.",
        "caption": "☕ My Sunday ritual: coffee, then one look at my collab board.\n\nAwaiting shipment, In progress, Submitted, Published, Archived. In about 30 seconds I know exactly where every brand deal stands and what my week actually needs from me. No spreadsheet archaeology.\n\nIt turned my Sunday scaries into a calm little planning moment lol.\n\nDrop a ☕ if you'd steal this Sunday reset for your own deals."
      },
      {
        "title": "Hours Back",
        "type": "Reveal (hours saved)",
        "screenshot": "The Collab Butler board with a stack of active cards visible across the In progress and Submitted columns.",
        "caption": "⏳ I used to burn an hour every week just figuring out where each brand deal stood. Rereading DMs, cross-checking notes, panicking a little.\n\nNow it's a board. Cards move through the stages, due dates and notes live right on them, and new deals add themselves from Amazon Butler. The status IS the tracking.\n\nThat hour goes back into actually making content now.\n\nHow much time do you lose every week just tracking your collabs? 👇"
      },
      {
        "title": "The Notes That Stay Put",
        "type": "Relatable",
        "screenshot": "A Collab Butler card opened to show the notes field with deliverables and brand details filled in.",
        "caption": "📝 \"Wait, did they want one reel or two? And what was the discount code again?\"\n\nI used to lose those details in random Notes app files and screenshots. Now every collab card holds its own notes, so the deliverables and brand asks live right on the deal they belong to.\n\nWhen the brand follows up, I'm not scrambling. It's all right there on the card.\n\nWhat detail do you ALWAYS forget about a collab? Drop it below 👇"
      },
      {
        "title": "Published And Proud",
        "type": "Interactive",
        "screenshot": "A Collab Butler card being moved into the Published column, then Archived.",
        "caption": "🎉 There is genuinely nothing better than dragging a card into Published and then tucking it into Archived. Deal DONE.\n\nMy board keeps the finished ones out of the way so I only see the deals that still need me. Clean list, clear head.\n\nAnd because every brand I message shows up as a card automatically, my \"done\" pile actually reflects everything I've shipped.\n\nComment ✅ for every collab you've fully wrapped this month. Let's see those numbers 👇"
      },
      {
        "title": "The In-Progress Pileup",
        "type": "Relatable / Interactive",
        "screenshot": "The In progress column of the Collab Butler board holding several cards at once.",
        "caption": "😵‍💫 Raise your hand if you've said yes to five brand deals and then completely lost track of which one you were even filming. 🙋‍♀️\n\nThat used to be me every single time. Now the In progress column shows me exactly what's mid-shoot, so nothing sits half-done for three weeks.\n\nCards move themselves along as I work, and forgotten deals just don't happen anymore.\n\nHow many active collabs are you juggling right now? Drop the number 👇"
      }
    ]
  },
  {
    "slug": "content-butler",
    "name": "Content Butler",
    "cat": "Earnings & Growth",
    "blurb": "A calendar and per-brand coverage matrix for your deliverables, so you know what to film and when.",
    "posts": [
      {
        "title": "What Do You Still Need to Film?",
        "type": "Relatable",
        "screenshot": "The Content Butler calendar + per-brand coverage matrix showing what's due and what's still needed.",
        "caption": "📅 The scariest question in this business: \"wait… what do I still owe brands this month?\" 😬\n\nI stopped guessing. Every deliverable sits on a calendar with a per-brand coverage matrix, so I know exactly what I still need to film and when it's due. No more missed deadlines, no more 11pm panic edits.\n\nHow many pieces are you behind on right now? Drop it below, let's normalize the chaos 😅👇"
      },
      {
        "title": "The Whole Month at a Glance",
        "type": "Reveal",
        "screenshot": "The Content Butler monthly calendar with brand deliverables laid out across the weeks.",
        "caption": "🗓️ This is every brand deliverable I owe this month, all on one calendar.\n\nI used to keep it in my head and a messy notes app, then wonder why I felt anxious all the time. Turns out my brain was quietly tracking 14 due dates 24/7. 😮‍💨\n\nSeeing it laid out like this actually made me calmer. I know what is coming and when.\n\nHow many brand deadlines are you tracking right now? Drop the number below 👇"
      },
      {
        "title": "Due This Week",
        "type": "Relatable",
        "screenshot": "The Content Butler weekly view showing this week's deliverables and their due dates.",
        "caption": "Monday me, opening the weekly view: ok, three videos due by Friday, I can breathe. 😌\n\nBefore this I would get to Thursday, feel fine, then suddenly remember TWO things I forgot to film. Cue the panic scramble.\n\nNow every deliverable sits on the day it is due, so nothing sneaks up on me anymore.\n\nRaise your hand if a forgotten deadline has ruined your week 🙋‍♀️ tell me I am not alone lol"
      },
      {
        "title": "Search by ASIN",
        "type": "Interactive (drop your product)",
        "screenshot": "The Content Butler search bar pulling up a deliverable by product name or ASIN.",
        "caption": "🔍 Little thing that saves me so much time: I can search my deliverables by product name OR ASIN.\n\nBrand emails asking about a specific item? I type the ASIN, it pulls up exactly which deliverable it belongs to and when it is due. No more scrolling my whole calendar in a cold sweat.\n\nDrop a product you are filming this week below and I will show you how fast it finds it 👇"
      },
      {
        "title": "How Many Brands Are You Juggling?",
        "type": "Interactive",
        "screenshot": "The Content Butler calendar color-tagged by brand across several campaigns.",
        "caption": "Every deliverable here is tagged by brand, so I can see all my color-coded chaos at once. 🌈\n\nWhen I only had one brand this felt like overkill. At six brands? Absolute lifesaver. I can filter to one brand and instantly see everything I owe them.\n\nBe honest: how many brands are you working with right now? Comment your number 👇 I want to see who is drowning with me 😂"
      },
      {
        "title": "Got My Sunday Back",
        "type": "Reveal / Relatable",
        "screenshot": "The Content Butler monthly view replacing what used to be a manual deliverables spreadsheet.",
        "caption": "⏰ I used to spend an hour every Sunday rebuilding a deliverables spreadsheet from scratch. Every. Single. Week.\n\nNow it just lives on the calendar and updates itself. That hour went back into actually filming, or honestly, a nap. 😴\n\nThe time I was losing to admin was wild once I added it up.\n\nWhat is the one task eating your weekend right now? Tell me below 👇"
      },
      {
        "title": "Morning Coffee, Daily View",
        "type": "Relatable",
        "screenshot": "The Content Butler daily view showing exactly what is due today.",
        "caption": "☕ My new morning routine: coffee, then open the daily view to see what is actually due today.\n\nThat is it. No mental gymnastics, no five open browser tabs, no vague dread. Just today's list, clear and small enough to not scare me.\n\nStarting the day knowing my ONE priority instead of a fuzzy pile of everything has been a whole vibe.\n\nWhat does your content morning routine look like? Share it below 👇"
      },
      {
        "title": "Everything Tagged by Brand",
        "type": "Reveal",
        "screenshot": "The Content Butler deliverables list filtered down to a single brand's campaign.",
        "caption": "🏷️ Filtered my whole calendar down to just one brand in one click, and there is every single thing I owe them.\n\nSo when they email asking for a status update, I am not frantically digging through old DMs and my camera roll trying to remember what I promised. It is all right there.\n\nLooking this organized in front of a brand is honestly its own flex. 💅\n\nWhat brand are you most excited to work with right now? Drop it below 👇"
      },
      {
        "title": "Nothing Slips Through",
        "type": "Reveal / Interactive",
        "screenshot": "The Content Butler calendar with upcoming due dates lined up and none missed.",
        "caption": "The scariest part of this job was never the filming. It was the fear that I forgot something a brand paid me for. 😬\n\nNow every deliverable has a home and a due date on the calendar, so I stopped waking up at 2am doing math about what I might owe someone.\n\nPeace of mind is underrated.\n\nComment 🔥 if a missed deadline anxiety has ever kept YOU up at night."
      },
      {
        "title": "From Chaos to Calendar",
        "type": "Relatable",
        "screenshot": "The Content Butler monthly calendar full of organized, tagged deliverables.",
        "caption": "📌 Six months ago my deliverable system was: sticky notes, three group chats, and pure hope.\n\nNow it is one calendar with every brand deliverable tagged, dated, and searchable. Same messy creator brain, way better container for it. 🧠\n\nI did not get more disciplined, I just stopped relying on memory to do a spreadsheet's job.\n\nWhat is YOUR current system for tracking deliverables? Roast yourself in the comments 👇 I will go first lol"
      }
    ]
  }
];
