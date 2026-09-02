# Grow Together Creator Bundle: run-of-show playbook

Everything you need to recruit creators, coordinate the write, and run launch week.
The site machinery (recruitment page, application form, tracker, drips) is built; this
doc is the human side: who to ask, what to post, and the calendar-driven emails the
sequences deliberately do not send for you.

**Key dates (edit in `src/app/grow-together/_data/bundleMeta.ts`, then update copy here):**

| Milestone | Date |
| --- | --- |
| Recruiting opens | Sep 2, 2026 |
| Applications close | Sep 19, 2026 |
| Chapters due | Oct 3, 2026 |
| Assembly + buffer | Oct 4 to 10, 2026 |
| Launch week | Oct 13 to 17, 2026 |

**Where things live**
- Recruitment page (share this link): `/grow-together`
- Reader download page (goes live at launch): `/grow-together/get`
- Your tracker: `/dashboard/admin/bundle` (Bundle in the admin sidebar)
- Contributor + reader drips: Admin > Emails > Sequences ("Grow Together: ...", start paused)

**Before you send anyone the link:**
1. Apply the two migrations in Supabase (`20260905_bundle_contributors.sql`,
   `20260905_grow_together_sequences.sql`).
2. Create a **public Supabase Storage bucket named `bundle-headshots`** (Storage > New bucket >
   Public). This is where contributor photos land; without it, the submission form falls back to a
   paste-a-link field.
3. **Activate** the "Grow Together: Contributor onboarding" sequence. Activate the "Grow Together:
   Reader nurture" sequence before launch week.

**How submissions work (fully automated):** each contributor's onboarding email contains a private,
no-login link to their own submission page. They fill in their photo, intro, chapter, and closing
answer right there, and can edit until the deadline. Nothing to chase by email. When you are ready to
build the PDF, open the tracker and click **Export submissions for PDF (JSON)**, then hand that file
(and the template `docs/grow-together-bundle-template.html`) to Cowork to assemble the bundle.

**Roster cap:** the bundle is capped at 25 contributors (change `MAX_CONTRIBUTORS` in
`bundleMeta.ts`). The 26th applicant is told the round is full and to join the waitlist.

---

## 1. Who to ask (build your shortlist)

You do not need famous creators. You need creators with an **engaged, relevant audience**
who will actually promote. Aim for 12 to 25 contributors. Quality of promotion beats
follower count every time.

**Best sources, in order:**
1. **Your existing network.** The Influencer Butler Facebook group, past collab partners,
   creators you already DM with, and anyone who was in a bundle with you before (including the
   original Live Sweet "Girls Grow Together" contributors, some of whom moved into Amazon).
2. **Amazon and Walmart storefront creators** you already follow. Look at who shows up in
   Creator Connections, LTK, and ShopMy in your niche.
3. **Adjacent-but-not-competing niches.** A food creator, a home-decor creator, a mom-life
   creator, and a beauty creator do not compete for the same audience, so cross-promotion is
   pure upside for everyone.
4. **Creator Facebook groups and Discords** you are already a member of (post, do not spam
   groups you have never contributed to).

**Screen each candidate against a quick bar:**
- Engaged audience (comments and saves, not just a follower count).
- Posts consistently (they will not flake on launch week).
- A topic on the list they can genuinely teach.
- Someone you would be happy to send your own subscribers to.

**Aim for a spread of platforms** (Instagram, TikTok, Pinterest, YouTube, blog) and a spread of
**audience sizes**. A few big accounts give reach; lots of mid-size accounts give engaged,
buyer-ready subscribers. Both matter.

**Shortlist worksheet** (copy this into a sheet):

| Name | Handle | Platform + size | Topic they could write | How you know them | Asked? | Reply |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

Fill 30 to 40 rows so that a normal 30 to 50 percent yes-rate lands you 12 to 20 contributors.

---

## 2. Facebook / group recruitment posts

### Post A: your own audience / group (warm)

> I am putting together something fun and I want a handful of creators in on it. 🎉
>
> The Grow Together Creator Bundle is a free guide, written BY creators, FOR creators, on
> growing an audience and turning it into real income (Amazon, Walmart, brand deals, all of it).
> You write one short chapter on the thing you are great at. Then we all share the finished
> bundle with our audiences during one launch week.
>
> The payoff: every download opts in to hear from the contributors, so you grow your email
> list from everyone else's reach, not just your own. It is the fastest, most fun way I know to
> add subscribers.
>
> Spots are limited so chapters stay fresh. If you are in, claim your topic here: [link]

### Post B: creator groups you are active in (slightly more context)

> Creators: want to grow your email list without running ads or gaming the algorithm?
>
> I am hosting a free collaborative bundle. A group of us each write one short chapter (a few
> pages, your best advice on your topic), we combine it into one polished guide, and then we all
> promote it to our audiences during launch week. Everyone who downloads becomes a shared lead
> for the contributors.
>
> Topics range from Amazon storefronts and Creator Connections to short-form video, Pinterest,
> email lists, TikTok Shop, and brand deals. Free to join, and you keep the credit and the
> connections.
>
> Claim a topic (limited spots): [link]

### Post C: short punchy version (Stories / quick post)

> Free bundle collab for creators 📸💰 Write one chapter, promote once, grow your email list
> from every other creator's audience. Limited spots, claim your topic: [link]

Tips: pin Post A in your group, reshare to Stories with the link sticker, and post B in two or
three creator groups you actually contribute to. Reply to every comment quickly while interest
is hot.

---

## 3. Direct outreach (the real engine)

Most yeses come from personal DMs, not public posts. Keep it warm, specific, and short.

### DM template: someone you know

> Hey [name]! I am putting together a free creator bundle, a guide written by a group of us,
> each on the thing we are best at, and then we all share it with our audiences during one launch
> week so everyone grows their email list together. You came straight to mind for [their topic],
> you are so good at it. Want a spot? Here is the rundown + you can claim your topic here: [link]

### DM template: a creator you admire but do not know well

> Hi [name]! I love your content on [specific thing]. I am organizing a free collaborative bundle
> for creators: you write one short chapter on your specialty, we combine it into one guide, and
> the whole group promotes it during launch week so everyone grows their list from each other's
> audiences. No cost, and I would be honored to have you cover [topic]. Details + claim a topic:
> [link]. Totally understand if the timing is not right!

### Email template: more formal / bigger creators

> Subject: Invitation: contribute to a free creator bundle (launching mid-October)
>
> Hi [name],
>
> I am Liz Dean, founder of Influencer Butler. I am hosting the Grow Together Creator Bundle, a
> free guide written by a group of creators, each covering one topic we know well. Contributors
> write one short chapter, we assemble it into a polished PDF, and the whole group promotes it to
> their audiences during launch week (Oct 13 to 17). Every reader opts in to hear from the
> contributors, so each of us grows our email list from the combined reach.
>
> I would love to have you cover [topic]. It is a light lift (a few pages, due Oct 3) with a real
> upside in new subscribers and cross-promotion. You can read the details and claim your topic
> here: [link].
>
> Either way, thank you for the work you put out. It is genuinely great.
>
> Liz Dean
> Influencer Butler / The Social Media Posse

**Follow up once** after 4 to 5 days if there is no reply ("Just floating this back up in case it
got buried, no worries if it is not for you!"). One nudge, then let it go.

---

## 4. The write (Sep 19 to Oct 3)

The **Contributor onboarding** sequence handles this automatically once someone applies: welcome +
their private submission link + the exact checklist + deadline (day 0), chapter tips (day 3), check-in
(day 7). You do not need to send those by hand, and contributors submit through the portal, so there
are no Google Docs or attachments to collect.

Your job during this window:
- Watch the tracker. Move creators applied to confirmed once they reply and commit. Rows flip to
  "submitted" automatically when a contributor submits through the portal.
- Answer any questions. Use **Export submissions for PDF (JSON)** whenever you want to preview what
  has come in.
- Chase anyone who goes quiet with a friendly personal DM near the deadline.

### Calendar-driven reminders (send as one-off campaigns to the `bundle-contributor` tag)

The drip counts days from when each person signed up, so these date-specific nudges are sent by
you from **Admin > Emails**, as a campaign to the `bundle-contributor` segment, on the dates below.

**Sep 26 (one week left):**
> Subject: One week to send your Grow Together chapter
>
> Hi, it is Liz. Quick reminder that chapters are due October 3. If yours is ready, send it over
> whenever (just reply with a Google Doc link or your text). If you need anything, an outline, a
> second look, more time, reply and tell me. I want this to be easy for you. Thank you!

**Oct 1 (final stretch):**
> Subject: Chapters due in 2 days (Grow Together)
>
> Hi, it is Liz. We are almost there. Chapters are due October 3 so I can lay everything out for
> launch week. If yours is in, thank you! If not, even a rough draft by the 3rd works, I can help
> polish. Reply and send it over. Cannot wait to show you the finished bundle.

**Oct 3 (deadline day, only if some are still out):**
> Subject: Last call for your chapter today
>
> Hi, it is Liz. Today is the day. If your chapter is still in progress, send me what you have and
> I will work with it, I do not want you left out of the bundle after you claimed a spot. Reply
> here. If you have already sent yours, ignore me and thank you!

---

## 5. Launch week (Oct 13 to 17)

Before launch: assemble the PDF, drop it at `public/guides/grow-together-creator-bundle.pdf`,
and **Activate the Reader nurture sequence**. Confirm `/grow-together/get` reveals the download.

### Promo-assets campaign (send to `bundle-contributor` around Oct 10)

> Subject: Your Grow Together launch kit is here 🎉
>
> Hi, it is Liz. The bundle looks gorgeous and it is all because of you. Launch week is Oct 13 to
> 17. Here is your copy-paste kit so promoting takes five minutes:
>
> - The download link to share: https://www.influencerbutler.com/grow-together/get
> - Graphics (feed + Stories sizes): [link to the shared folder]
> - Suggested captions for Instagram, Stories, and email: [link]
> - Suggested schedule: post once in feed Mon or Tue, Stories with the link sticker 2 to 3 times
>   across the week, and one email to your list.
>
> Tag @influencerbutler and the other creators so we can reshare you. Reply if you need a
> different size or a tweak to the captions. Thank you for making this happen!

### Swipe copy to include in the kit

Adapted from the original Live Sweet bundle's swipe files, but reframed for a FREE download (our
payoff is the shared list via co-registration, not a $25 sale). Tell contributors to reword the
[bracketed] parts and add their own emoji and voice.

**Instagram + Facebook, version 1:**
> What if I told you I had the secret to that THING you have always wanted to launch? The storefront,
> the shop, the blog, [add in your business here] - I have JUST the thing to help you grow it.
>
> When I first started [add in your business here] I felt LOST. I needed help but everyone I reached
> out to was too busy or would not give real feedback.
>
> So when I was asked to join the Grow Together Creator Bundle, I KNEW I had to be in. It is a guide
> that shows you EVERYTHING about growing an audience and turning it into income, from a whole group
> of creators who are actually doing it.
>
> And the best part? It is completely FREE. Click the link in my [stories / bio] to grab your copy.

**Instagram + Facebook, version 2:**
> Raise your hand if you feel absolutely LOST when it comes to growing your audience or turning it
> into income. [hand-raising emoji]
>
> Because you are NOT alone. A few years ago, that was me. That is why I am so excited about the
> Grow Together Creator Bundle: a free guide where a group of us each share what we do best, from
> [list a few topics].
>
> If I had had a guide like this when I started, I would be years ahead. And it is FREE. Click the
> link in my bio to download it.

**Instagram + Facebook, version 3:**
> EVER WANTED TO PICK MY BRAIN? I get DMs all the time asking HOW to start and grow. What if I said I
> partnered with a group of other creators to answer ALL of those questions in one free guide?
>
> The Grow Together Creator Bundle covers storefronts, short-form video, email lists, brand deals,
> and SO much more. It is completely free. Click the link in my bio to grab a copy!

**Stories:** "Free creator bundle just dropped [link sticker] I wrote the chapter on [topic]!"

**Newsletter copy:**
> Hey [first name],
>
> Have you ever wanted to grow your audience and actually earn from it, but the advice out there feels
> underwhelming (at best)? Years ago, that was me too.
>
> That is why I am so excited to share the Grow Together Creator Bundle: a free guide with the best
> advice from a whole group of creators who are actually doing this. Each of us shares what we know
> best, from storefronts to short-form video to brand deals.
>
> It is completely free. You will get the PDF the moment you sign up. [LINK]
>
> Xo, [your name]

One honest note on the newsletter/reader flow: because this is free with co-registration, when
someone downloads they are told their email is shared with the contributors. That disclosure is what
makes the shared list legitimate, so keep it in place.

### After launch (send to `bundle-contributor`, ~Oct 20)

> Subject: Thank you + here is your shared list
>
> Hi, it is Liz. That was a fantastic launch. Thank you for showing up for it. As promised, here
> is the shared subscriber list from everyone who downloaded the bundle: [attach the CSV from the
> tracker's "Export shared reader list" button].
>
> A few gentle asks so it stays classy: send them something genuinely useful (an intro + your best
> free resource is perfect), do not hammer them, and always include an unsubscribe. These readers
> opted in knowing they would hear from the contributors, so a warm welcome goes a long way.
>
> Let us do it again. Reply with any topic ideas for the next one.

**Getting the shared list:** in `/dashboard/admin/bundle`, click **Export shared reader list
(CSV)**. It excludes anyone who has unsubscribed. Send it to contributors after launch, once
enough downloads have come in.

---

## 6. Compliance reminders

- The reader download form **discloses** that emails are shared with contributors. That
  disclosure is what makes sharing the list legitimate. Do not remove it.
- All bundle emails go through the compliant marketing sender: unsubscribe + your postal address
  are appended automatically. Never paste them into the body.
- Remind contributors (in the after-launch email) that the shared readers are people, not a list
  to blast: useful content, reasonable frequency, always an unsubscribe.
- No em dashes anywhere in bundle copy (house style).
