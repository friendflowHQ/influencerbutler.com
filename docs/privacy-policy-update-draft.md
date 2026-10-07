# Privacy policy update: DRAFT (review before publish)

Target file: `public/legal/privacy.html` (currently "Last Updated: August 13, 2026").

This is a draft, deliberately kept out of the live policy so nothing publishes before sign-off, same convention as `docs/catalogue-disclosure-drafts.md`. Every block below is ready-to-paste HTML, keyed to the existing section numbers so existing cross-references (§2.3, §3, §7) keep working. Anything marked **[CONFIRM: ...]** is a fact I could not verify from the code and you or a lawyer need to fill in. Not legal advice; have counsel review before publishing.

Repo copy rule followed: no em dashes anywhere.

## Why this update is needed

The current policy was written around the desktop app. It says the Software "runs on your computer", that the cloud endpoints are "minimal in scope (licensing, transactional email, feedback)", and that the three categories in §2 are "exhaustive". That is no longer accurate. The product now also has a web account and dashboard, a Chrome extension that syncs to it, an AI Assistant, recorded calls and live events, an affiliate program with payouts and tax forms, and marketing email. None of those, and none of the processors behind them, are in the policy.

### Contradictions to fix (highest priority)

1. **Platform credentials.** §2.2 says we do not receive "your platform credentials, your AI provider API keys". But the extension's Creator API vault (`src/lib/creator-api-creds.ts`) stores users' Amazon Creator API credentials on our servers (secret encrypted AES-256-GCM, write-only). The extension privacy page (`src/app/extension/privacy/page.tsx`) also says provider keys are "never" sent to Influencer Butler. Both statements are untrue for that feature. Block D below fixes the website policy; the extension page needs the same correction (see Appendix B).
2. **"Exhaustive" claim.** §2 intro says "if it isn't listed here, the Software does not collect it". Block C removes this.
3. **"We do not use your data to train AI models"** (§2.3 and §4). This is fine as our own commitment, but now that we send call transcripts and AI Assistant conversations to Groq and OpenAI, confirm the API terms you operate under exclude training on API data. **[CONFIRM: Groq and OpenAI API plans/settings are no-training.]**

### One correction to what I told you earlier

I said Google "Limited Use" language would be required for the Google integrations. After reading the code, that is not the case. The Calendar (`calendar.events`, `calendar.freebusy`) and YouTube (`youtube.upload`) scopes connect **your own** Google accounts (the scheduling calendar and the event YouTube channel, connected from the admin pages). GA4 and Search Console are also your own. No end user signs in with Google or grants us access to their Google data. The policy should still disclose the Calendar/Meet and YouTube use (attendee emails go on calendar invites; recordings are published publicly), but the Limited Use statement is only needed if you ever add "Sign in with Google" or connect user Google accounts. Block E covers the disclosure without it.

---

## Block A: intro notice (replace the paragraph inside `.legal-notice`)

```html
<p><strong>PLEASE READ CAREFULLY.</strong> This Privacy Policy describes how <strong>The Social Media Posse LLC</strong> ("Company," "we," "us," or "our") collects, uses, discloses, and safeguards personal data when you use the <strong>Influencer Butler</strong> desktop application, the <strong>Influencer Butler Chrome extension</strong>, the <code>influencerbutler.com</code> website and your online account and dashboard, our AI Assistant, scheduled calls and live events, our affiliate program, the Cloudflare-hosted licensing / authentication / feedback Workers, and any related features (collectively, the "Software"). The Chrome extension also has its own <a href="/extension/privacy">Extension Privacy Policy</a>, which should be read together with this one. This Privacy Policy is incorporated by reference into our <a href="eula.html">End-User License Agreement (EULA)</a> and our <a href="terms.html">Terms of Service</a>. By installing or using the Software, you consent to the practices described here. If you do not agree, do not install or use the Software.</p>
```

## Block B: §1 closing paragraph (replace "We are a small US-based independent software vendor...")

```html
<p>We are a small US-based independent software vendor. Much of the desktop application runs on your computer, and we keep what the Software sends to us as limited as we can. But the Software also includes an online account and dashboard, a Chrome extension that can sync to it, and a few hosted features (an AI Assistant, scheduled calls and live events, an affiliate program, and email). Each is described below, along with the service providers behind it.</p>
```

## Block C: §2 intro (replace the paragraph beginning "We organize our data practices by destination")

```html
<p>We organize our data practices by <strong>destination</strong>, because much of what the desktop application touches never leaves your device. Sections 2.1 to 2.9 describe the data we handle and where it goes. If you believe we handle something that is not described here, tell us at <a href="mailto:privacy@influencerbutler.com">privacy@influencerbutler.com</a> and we will correct this policy or our practice.</p>
```

## Block D: §2.2 closing paragraph (replace "We do **not** receive: ...")

```html
<p>Through the desktop application and the Workers above, we do <strong>not</strong> receive: the contents of your messages to third-party platforms, your login credentials for third-party platforms, your AI provider API keys, the contents of your workspace bundles, your screenshots, or any cookies beyond the magic-link auth cookie issued by our own Worker. The optional features in §2.5 to §2.9 send us additional data, as described there. In particular, if you choose to save your Amazon Creator API credentials to your account for use with the Chrome extension, we store them (see §2.5).</p>
```

## Block E: new subsections (insert after §2.4, before §3)

### §2.5 Website account, dashboard, and Chrome extension sync

```html
<h3>2.5 Your online account, dashboard, and Chrome extension sync</h3>
<p>When you create an account or sign in on <code>influencerbutler.com</code>, or start a trial, we store your account in our database (hosted with Supabase). We process the following, for the reasons given:</p>
<ul>
    <li><strong>Account and subscription data</strong>: email address, name (if you give one), sign-in method, plan, trial and subscription status, license keys and seats, and the dates of key events such as sign-up and cancellation. Used to run your account and enforce your plan (contract performance).</li>
    <li><strong>Dashboard data you choose to sync</strong>: if you sign in to the Chrome extension or the desktop application with your license key and leave sync on, the data described in our <a href="/extension/privacy">Extension Privacy Policy</a> is sent to your dashboard (product scans, content gaps, order-history results including the price you paid, storefront checkup results, deals you send, and, if you use "Sync to web" in the desktop app, your earnings summaries and top products). This is shown only to you in your dashboard. You can turn sync off in the extension or desktop settings (contract performance, and consent where you turn on an optional sync).</li>
    <li><strong>Amazon Creator API credentials (optional)</strong>: if you save these to your account so the extension can fetch product data, we store the Credential ID, version, Associates tag, and Credential Secret per marketplace. The secret is encrypted before it reaches our database, is write-only (we never display it back to you or to any client), and is decrypted only on our servers to request product data from Amazon on your behalf. You can remove it at any time and we will delete it (contract performance).</li>
    <li><strong>Usage counts</strong>: the action counts described in §3.3.</li>
    <li><strong>Cross-device relay</strong>: if you link two of your devices so that the extension on one can send deals to the desktop application on the other, the deal data passes through a relay on our Cloudflare Workers and is delivered to the linked device. It is not kept after delivery. <strong>[CONFIRM: relay message retention on the Worker.]</strong> Settings and secrets are never relayed.</li>
</ul>
<p>Our website and its server functions are hosted on Vercel. See §2.3 and §9.</p>
```

### §2.6 AI Assistant and AI-assisted features

```html
<h3>2.6 AI Assistant and AI-assisted features that we operate</h3>
<p>Separate from the AI providers you connect yourself (§2.3), we operate a few AI features that use our own provider accounts:</p>
<ul>
    <li><strong>AI Assistant</strong> (voice and text) in your dashboard. What you say or type is sent to our AI providers to produce replies: OpenAI for voice, and Groq (with OpenAI as a fallback) for text. We store the session, including your account email and the transcript, so we can show your history, support you, and improve the Assistant (contract performance and legitimate interest). Please do not share passwords or payment-card numbers with the Assistant.</li>
    <li><strong>Call and event summaries</strong>: recordings you take part in (see §2.7) are transcribed and the transcript is summarized, and support issues raised on a call may be filed as tickets, using Groq or OpenAI.</li>
    <li><strong>Drafting help</strong> for our own blog, event announcements, and similar content. These do not use your personal data.</li>
</ul>
<p>We use these providers under their API terms. <strong>[CONFIRM: API terms or settings with Groq and OpenAI exclude training on our API data.]</strong> We do not use your data to train AI models, and we do not allow our providers to do so on our behalf.</p>
```

### §2.7 Scheduled calls, live events, and recordings

```html
<h3>2.7 Scheduled calls, live events, and recordings</h3>
<p>If you book a call or register for a live event, we collect your name, email address, chosen time, and any topic you enter. Calls are held on Google Meet. We create the calendar event on our Google Calendar, so your email address is sent to Google as an invitee, and we read only our own calendar's busy times to offer open slots (we do not access your Google account).</p>
<p><strong>Recordings.</strong> Calls and live events may be recorded. We use <strong>Recall.ai</strong> to send a recording bot into the Google Meet, which records the session and produces a transcript. You are told before you join, and by registering and joining you consent to being recorded. Call recordings and transcripts are used internally to follow up with you, summarize the call, and file support tickets. Recordings of <strong>live events</strong> may be shared publicly, including as a replay on our website, on YouTube (we upload to our own channel using Google's YouTube API), and as clips on social media, and may show your name, voice, and anything you say or show on screen. If you do not want to appear in a public replay, email <a href="mailto:privacy@influencerbutler.com">privacy@influencerbutler.com</a> before the event, or ask us afterward and we will remove you from the replay where we can. Lawful basis: your consent to be recorded, and contract performance.</p>
<p>Event registrants may also receive an invitation, reminder, and replay email (see §2.8).</p>
```

### §2.8 Support, email, and community

```html
<h3>2.8 Support, email, and community</h3>
<ul>
    <li><strong>Support and feedback</strong>: when you contact us (form, email, in-app, or extension feedback) we keep your message, attachments and screenshots you send, your email address, and context you include such as page, app or extension version, and browser. Attachments are stored in Cloudflare R2. Some first replies may be drafted or sent automatically. Lawful basis: contract performance and legitimate interest in supporting you.</li>
    <li><strong>Product and marketing email</strong>: with your account we send transactional email (sign-in links, receipts, alerts). If you sign up for our newsletter, a freebie, or a webinar, or if you are a customer or trial user, we may also send you product tips, offers, and event invitations. We send these through Resend. Marketing email contains an unsubscribe link, and we honor unsubscribes; if you unsubscribe we keep your address on a suppression list so we do not email you again. Our emails record when they were delivered, opened, and clicked so we can see what is useful (consent where required, otherwise legitimate interest). Email opens are measured with a small image and can be blocked by your email client.</li>
    <li><strong>Public posts</strong>: community Q&amp;A posts, testimonials, and reviews you submit may be shown publicly with the name you choose. Testimonials are shown only with your permission.</li>
    <li><strong>Surveys</strong>: if you cancel, we may ask why. Your answers are linked to your account and used to improve the product.</li>
</ul>
```

### §2.9 Affiliate program, payouts, and tax forms

```html
<h3>2.9 Affiliate program, payouts, and tax forms</h3>
<p>If you join the Influencer Butler affiliate program, we process your referral link and the sign-ups and purchases attributed to it, your payout details, and your commission history. Referral attribution uses a first-party cookie or the code in your link, and for people you refer we record that they were referred by you.</p>
<ul>
    <li><strong>Payouts</strong>: we pay commissions through PayPal. PayPal receives your payout email address and the payout amount.</li>
    <li><strong>Tax forms</strong>: if you earn above the reporting threshold, U.S. law requires us to collect a tax form (IRS Form W-9, or W-8BEN / W-8BEN-E for non-U.S. affiliates). We store your legal name, business name, tax classification, address, signature and date, and only the <strong>last four digits</strong> of your tax ID. We use this to file information returns (such as Form 1099-NEC) and for tax compliance (legal obligation). <strong>[CONFIRM: full tax ID is never stored by us.]</strong></li>
    <li><strong>Public leaderboard</strong>: the public "Top Affiliates" page shows a count of referrals. Your name appears only if you opt in; otherwise only your initials are shown.</li>
</ul>
<p>We do not tell the people you refer anything about your earnings.</p>
```

### §2.10 Shared product catalogue (opt-in): HOLD

Do not publish this until the feature is live in a public extension build and counsel has signed off. Text is carried over from `docs/catalogue-disclosure-drafts.md`, section 2a:

```html
<h3>2.10 Shared product catalogue (optional, off by default)</h3>
<p>If you use the Chrome extension and turn on the optional shared product catalogue, product facts the extension reads on Amazon product pages you visit (ASIN, marketplace, price, best-seller rank, the "bought in past month" figure, category, brand, and carousel video placements) are sent to us and pooled de-identified for the shared catalogue feature. These are product facts, not personal data. We keep a record of which account contributed for security and abuse prevention only; it is never shown to other users. If the toggle is off, none of this is sent.</p>
```

## Block F: §2.3 additions (add these bullets to the processor list)

```html
<li><strong>Vercel, Inc.</strong>: hosting and serverless functions for the <code>influencerbutler.com</code> website, your online account, and the dashboard. Processes request metadata (IP address, user-agent) and the data you submit through the site.</li>
<li><strong>Supabase, Inc.</strong>: managed database and authentication for your online account, dashboard data, and the other data described in §2.5 to §2.9. <strong>[CONFIRM: Supabase project region.]</strong> Their privacy practices: <a href="https://supabase.com/privacy" target="_blank" rel="noopener">supabase.com/privacy</a>.</li>
<li><strong>OpenAI and Groq</strong> (as used by us, in addition to the providers you connect yourself): the AI Assistant, call and event summaries, and support-ticket extraction described in §2.6.</li>
<li><strong>Recall.ai, Inc.</strong>: records Google Meet calls and events we host, and produces transcripts (§2.7). Their privacy practices: <a href="https://www.recall.ai/privacy" target="_blank" rel="noopener">recall.ai/privacy</a>. <strong>[CONFIRM: URL and DPA.]</strong></li>
<li><strong>Google LLC (Google Calendar, Google Meet, YouTube)</strong>: hosts our calls, receives your email address as a calendar invitee, and hosts event replays we publish to our YouTube channel. This is in addition to the Google Analytics use described below.</li>
<li><strong>PayPal, Inc.</strong>: affiliate commission payouts (§2.9).</li>
<li><strong>Residential proxy provider you connect</strong> (for example Decodo or IPRoyal): if you configure a residential proxy in the desktop application for Facebook posting, the traffic of that feature goes through the proxy you choose, and that provider sees it. Company has no relationship with the provider on your behalf. If you do not configure one, nothing is sent.</li>
```

Also update the Resend bullet in §2.3 to add: "and marketing email, newsletters, and event emails (§2.8), including delivery, open, and click events."

And the Lemon Squeezy bullet: add "Lemon Squeezy also supplies the license keys and subscription status we use for your account."

## Block G: §3 cookies (add paragraph at the end of §3, before 3.1)

```html
<p>Beyond the analytics and advertising cookies above, the website sets a small number of first-party cookies that it needs to function, such as keeping you signed in, remembering a referral or discount code that brought you to the site so it can be applied at checkout (<code>ib_ref</code>, <code>ib_promo</code>, <code>ib_aff_src</code>), a visitor identifier used to decide which welcome offer applies (<code>ib_pv</code>), and a short-lived token used after checkout (<code>ib_welcome_token</code>). These are listed in full, with their lifetimes, in our <a href="cookies.html">Cookie Policy</a>.</p>
```

## Block H: §4 how we use information (add bullets)

```html
<li>Run your online account and dashboard, and show you the data you sync to it.</li>
<li>Provide AI Assistant, call, and event features, including recording, transcription, and summaries.</li>
<li>Run the affiliate program: attribute referrals, pay commissions, and meet tax-reporting obligations.</li>
<li>Send you product and marketing email you have not opted out of, and measure how it performs.</li>
```

(Leave the closing "we never use it for model training" sentence.)

## Block I: §7 retention (add bullets)

All durations marked CONFIRM need a decision from you; I did not find retention rules in the code for these.

```html
<li><strong>Account and dashboard data</strong>: for the life of your account. When you delete your account or ask us to, we delete or anonymize it within <strong>[CONFIRM: 30]</strong> days, except records we must keep for tax, fraud, or legal reasons.</li>
<li><strong>Stored Amazon Creator API credentials</strong>: until you remove them or delete your account.</li>
<li><strong>AI Assistant transcripts</strong>: <strong>[CONFIRM: retention period]</strong>.</li>
<li><strong>Call recordings and transcripts</strong> (private calls): <strong>[CONFIRM: retention period]</strong>. <strong>Live event recordings</strong>: kept for as long as the replay is offered; we will remove you from a replay on request where we can.</li>
<li><strong>Support tickets and attachments</strong>: <strong>[CONFIRM: retention period]</strong>.</li>
<li><strong>Marketing email events and suppression list</strong>: opens and clicks for <strong>[CONFIRM]</strong> months; unsubscribe records indefinitely so we honor them.</li>
<li><strong>Affiliate payout records and tax forms</strong>: 7 years after the tax year, to meet U.S. recordkeeping rules. <strong>[CONFIRM]</strong></li>
```

Also update the existing line "Transactional email metadata (Resend logs): 30 days" if marketing events are kept longer in our own database.

## Block J: §9 international transfers (replace first paragraph, then adjust the SCC sentence)

```html
<p>Personal data we collect is processed in the <strong>United States</strong> (including by LemonSqueezy, Resend, Vercel, Supabase, Recall.ai, OpenAI, Groq, Google, and PayPal, and our Cloudflare account home region) and in <strong>Cloudflare's global edge network</strong>, which may process request metadata in any region where Cloudflare operates.</p>
```

The existing SCC sentence says SCCs are "included in our data-processing agreements with LemonSqueezy, Resend, and Cloudflare." Extend that list only to providers whose DPA you have actually signed. **[CONFIRM: DPAs/SCCs with Vercel, Supabase, Recall.ai, OpenAI, Groq, Google, PayPal.]** If you have not signed them, accept each provider's standard online DPA (most have one) before publishing, or word the sentence as "to the extent required".

## Block K: §11 and the date

- "Last Updated": change to the publish date.
- §11 says a material change bumps `PRIVACY_VERSION` in the desktop application to trigger a re-acceptance prompt. This update is material (new data practices), so that constant in the **desktop repo** needs a bump when you release. Not editable from this repo.

---

## Appendix A: Cookie Policy follow-ups (`public/legal/cookies.html`)

The Cookie Policy lists `ib_ads_consent`, `ib_trial_ping`, Supabase auth, Cloudflare, `_ga`, and the Meta cookies. Cookies the site also sets (from the code) that are not listed:

| Cookie | Purpose | Lifetime |
|---|---|---|
| `ib_pv` | visitor id for the welcome offer | 2 years |
| `ib_promo` | remembers a promo code for checkout | 90 days |
| `ib_aff_src` | affiliate code carried to checkout | 30 days |
| `ib_ref` | friend-referral attribution | **[CONFIRM]** |
| `ib_welcome_token` | exchanges post-checkout for license data (HttpOnly) | 1 hour |
| `ib_login_link` | 60-second cooldown on sign-in emails | 60 seconds |

Decision for you: `ib_pv` (a persistent 2-year visitor identifier) and the attribution cookies are not strictly "necessary" in the ePrivacy sense for EU visitors. Either list them as functional and accept the risk, or gate `ib_pv` behind the consent banner. Counsel should weigh in. I did not change the banner or any code.

## Appendix B: Extension Privacy Page follow-ups (`src/app/extension/privacy/page.tsx`)

This is a Chrome Web Store requirement and the extension was taken down on 2026-07-09 for exactly this kind of mismatch, so it is more urgent than the website policy.

1. "API keys and credentials ... never to Influencer Butler" is wrong for the Creator API vault. Add a section on saved Creator API credentials (same language as §2.5 above).
2. "Parties your data may be shared with" names only Cloudflare and Lemon Squeezy. The extension's sync, vault, and relay run on our Vercel and Supabase stack too.
3. The cross-device relay (Settings > "Send to another computer") and desktop earnings sync are not described.
4. The shared catalogue and video-intelligence disclosures stay on hold per `docs/catalogue-disclosure-drafts.md`.
5. Effective date is July 17, 2026; bump it.

## Appendix C: decisions for you

1. **Instagram Goldmine** (self-hosted extension build only) harvests creators' public emails from Instagram and sends them to `/api/extension/instagram-creators`. That is third-party personal data. It is not in the public build, so I left it out of the policy. If that build is ever distributed to customers, it needs its own disclosure and probably a legal check on Instagram's terms.
2. **Deal Sites Harvester auto-harvest/badge** is deliberately unannounced. It collects no personal data, so the policy does not need to mention it.
3. **Lawful-basis wording** (legitimate interest vs. consent for marketing email and AI Assistant history) is my best guess. Counsel should confirm.
4. **Retention periods** marked CONFIRM above. I did not invent numbers.
5. **Account deletion**: is there a self-serve delete, or only by email? The policy currently promises a 30-day response to email requests; if there is a self-serve option, mention it in §5 and §6.
