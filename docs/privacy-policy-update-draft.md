# Privacy policy update: DRAFT (review before publish)

Target file: `public/legal/privacy.html` (currently "Last Updated: August 13, 2026").

This is a draft, deliberately kept out of the live policy so nothing publishes before sign-off, same convention as `docs/catalogue-disclosure-drafts.md`. Every block below is ready-to-paste HTML, keyed to the existing section numbers so existing cross-references (§2.3, §3, §7) keep working. Anything marked **[CONFIRM: ...]** is a fact I could not verify from the code and you or a lawyer need to fill in. Not legal advice; have counsel review before publishing.

Repo copy rule followed: no em dashes anywhere.

## Why this update is needed

The current policy was written around the desktop app. It says the Software "runs on your computer", that the cloud endpoints are "minimal in scope (licensing, transactional email, feedback)", and that the three categories in §2 are "exhaustive". That is no longer accurate. The product now also has a web account and dashboard, a Chrome extension that syncs to it, an AI Assistant, recorded calls and live events, an affiliate program with payouts and tax forms, and marketing email. None of those, and none of the processors behind them, are in the policy.

### Contradictions to fix (highest priority)

1. **Platform credentials.** §2.2 says we do not receive "your platform credentials, your AI provider API keys". But the extension's Creator API vault (`src/lib/creator-api-creds.ts`) stores users' Amazon Creator API credentials on our servers (secret encrypted AES-256-GCM, write-only). The extension privacy page (`src/app/extension/privacy/page.tsx`) also says provider keys are "never" sent to Influencer Butler. Both statements are untrue for that feature. Block D below fixes the website policy; the extension page needs the same correction (see Appendix B).
2. **"Exhaustive" claim.** §2 intro says "if it isn't listed here, the Software does not collect it". Block C removes this.
3. **"We do not use your data to train AI models"** (§2.3 and §4). This is fine as our own commitment, but now that we send call transcripts and AI Assistant conversations to Groq and OpenAI, you confirmed the OpenAI data-sharing toggle was never turned on, and both are used through business API accounts.

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
    <li><strong>Cross-device relay</strong>: if you link two of your devices so that the extension on one can send deals to the desktop application on the other, the deal data passes through a relay on our Cloudflare Workers and is delivered to the linked device. It is held only as long as needed to deliver it. Settings and secrets are never relayed.</li>
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
<p>We use these providers through their business API, under their API terms. We do not use your data to train AI models, and we do not allow our providers to do so on our behalf.</p>
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
    <li><strong>Tax forms</strong>: if you earn above the reporting threshold, U.S. law requires us to collect a tax form (IRS Form W-9, or W-8BEN / W-8BEN-E for non-U.S. affiliates). We store your legal name, business name, tax classification, address, signature and date, and only the <strong>last four digits</strong> of your tax ID. We use this to file information returns (such as Form 1099-NEC) and for tax compliance (legal obligation).</li>
    <li><strong>Public leaderboard</strong>: the public "Top Affiliates" page shows a count of referrals. Your name appears only if you opt in; otherwise only your initials are shown.</li>
</ul>
<p>We do not tell the people you refer anything about your earnings.</p>
```

### §2.10 Shared product catalogue (opt-in): INCLUDED (your decision)

You chose to include this now. It describes a feature that is off by default and not yet in a public extension build, and your lawyer review of docs/catalogue-disclosure-drafts.md is still pending. Text is carried over from `docs/catalogue-disclosure-drafts.md`, section 2a:

```html
<h3>2.10 Shared product catalogue (optional, off by default)</h3>
<p>If you use the Chrome extension and turn on the optional shared product catalogue, product facts the extension reads on Amazon product pages you visit (ASIN, marketplace, price, best-seller rank, the "bought in past month" figure, category, brand, and carousel video placements) are sent to us and pooled de-identified for the shared catalogue feature. These are product facts, not personal data. We keep a record of which account contributed for security and abuse prevention only; it is never shown to other users. If the toggle is off, none of this is sent.</p>
```

## Block F: §2.3 additions (add these bullets to the processor list)

```html
<li><strong>Vercel, Inc.</strong>: hosting and serverless functions for the <code>influencerbutler.com</code> website, your online account, and the dashboard. Processes request metadata (IP address, user-agent) and the data you submit through the site.</li>
<li><strong>Supabase, Inc.</strong>: managed database and authentication for your online account, dashboard data, and the other data described in §2.5 to §2.9. Our project is hosted in the United States. Their privacy practices: <a href="https://supabase.com/privacy" target="_blank" rel="noopener">supabase.com/privacy</a>.</li>
<li><strong>OpenAI and Groq</strong> (as used by us, in addition to the providers you connect yourself): the AI Assistant, call and event summaries, and support-ticket extraction described in §2.6.</li>
<li><strong>Recall.ai, Inc.</strong>: records Google Meet calls and events we host, and produces transcripts (§2.7). Their privacy practices: <a href="https://www.recall.ai/privacy" target="_blank" rel="noopener">recall.ai/privacy</a>. <strong>[CONFIRM: Recall.ai privacy URL.]</strong></li>
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

Durations below are your decisions. IMPORTANT: no automatic cleanup job enforces any of them yet (see Appendix D).

```html
<li><strong>Account and dashboard data</strong>: for the life of your account. If you ask us to delete your account (email <a href="mailto:privacy@influencerbutler.com">privacy@influencerbutler.com</a>), we delete or anonymize it within 30 days, except records we must keep for tax, fraud, or legal reasons.</li>
<li><strong>Stored Amazon Creator API credentials</strong>: until you remove them or delete your account.</li>
<li><strong>AI Assistant transcripts</strong>: 12 months, then deleted.</li>
<li><strong>Call recordings and transcripts</strong> (private calls): 12 months, then deleted. <strong>Live event recordings</strong>: kept for as long as the replay is offered; we will remove you from a replay on request where we can.</li>
<li><strong>Support tickets and attachments</strong>: 3 years, then deleted.</li>
<li><strong>Marketing email events and suppression list</strong>: opens and clicks for 24 months; unsubscribe records indefinitely so we honor them.</li>
<li><strong>Affiliate payout records and tax forms</strong>: 7 years after the tax year, to meet U.S. recordkeeping rules.</li>
```

Also update the existing line "Transactional email metadata (Resend logs): 30 days" if marketing events are kept longer in our own database.

## Block J: §9 international transfers (replace first paragraph, then adjust the SCC sentence)

```html
<p>Personal data we collect is processed in the <strong>United States</strong> (including by LemonSqueezy, Resend, Vercel, Supabase, Recall.ai, OpenAI, Groq, Google, and PayPal, and our Cloudflare account home region) and in <strong>Cloudflare's global edge network</strong>, which may process request metadata in any region where Cloudflare operates.</p>
```

You said you are not sure whether DPAs are signed and chose to treat them as accepted under each provider's terms. Suggested replacement for the SCC sentence:

```html
<p>If you are located in the European Economic Area, the United Kingdom, or Switzerland, transfers of your personal data outside those regions are protected by the <strong>Standard Contractual Clauses (SCCs)</strong> adopted by the European Commission, to the extent required, under the data processing terms of each provider named in §2.3.</p>
```

Action for you before publishing (about 20 minutes): accept the standard online DPA in each provider's dashboard or legal page (Vercel, Supabase, Recall.ai, OpenAI, Groq, PayPal, Google), so that sentence is true.

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
| `ib_ref` | friend-referral attribution | see `src/lib/referral-program.ts` |
| `ib_welcome_token` | exchanges post-checkout for license data (HttpOnly) | 1 hour |
| `ib_login_link` | 60-second cooldown on sign-in emails | 60 seconds |

Your decision: list `ib_pv` and the attribution cookies as functional and keep them as they are. Small risk for EU visitors; counsel can weigh in. No banner or code change.

## Appendix B: Extension Privacy Page follow-ups (`src/app/extension/privacy/page.tsx`)

This is a Chrome Web Store requirement and the extension was taken down on 2026-07-09 for exactly this kind of mismatch, so it is more urgent than the website policy.

1. "API keys and credentials ... never to Influencer Butler" is wrong for the Creator API vault. Add a section on saved Creator API credentials (same language as §2.5 above).
2. "Parties your data may be shared with" names only Cloudflare and Lemon Squeezy. The extension's sync, vault, and relay run on our Vercel and Supabase stack too.
3. The cross-device relay (Settings > "Send to another computer") and desktop earnings sync are not described.
4. The shared catalogue and video-intelligence disclosures: you chose to include the catalogue now, so mirror it here (draft in `docs/catalogue-disclosure-drafts.md`, section 1).
5. Effective date is July 17, 2026; bump it.

## Appendix C: your decisions (recorded 2026-10-07)

1. Account deletion: you will build self-serve delete first. Until then the policy says "email us, deleted within 30 days", which is true today (an admin can delete).
2. Tax IDs: last 4 digits only. Tax records kept 7 years.
3. Retention: AI chats 12 months, private call recordings 12 months, support tickets 3 years, email open/click events 24 months.
4. Supabase hosted in the US. OpenAI "share inputs and outputs" was never turned on.
5. DPAs: treat as accepted under provider terms; accept each provider's standard DPA before publishing (Block J).
6. Visitor cookie `ib_pv`: keep as is, list as functional.
7. Marketing email basis: legitimate interest plus unsubscribe. Counsel should confirm.
8. Cross-device relay: "held only as long as needed to deliver"; worth verifying in the desktop/Worker repo.
9. Shared product catalogue: included now (see the §2.10 note).
10. Instagram Goldmine (self-hosted build only) and the Deal Sites Harvester badge: left out of the policy, as before.

## Appendix D: policy promises the product does not enforce yet

Publishing the retention periods makes them commitments. Today none is enforced by code (no cleanup jobs found for AI chats, recordings, tickets, attachments, or email events), and customers cannot self-delete. Build these before or soon after publishing:

1. Self-serve account deletion, which also deletes AI sessions, call transcripts, tickets, and stored Creator API credentials.
2. Scheduled cleanup: AI chats and call recordings at 12 months, support tickets and R2 attachments at 3 years, email events at 24 months.

Status update (2026-10-18): items built and committed, NOT yet deployed or run against production. AI chats: `/api/cron/purge-ai-sessions` (daily, this repo) plus the desktop chat history prune. Call recordings: `/api/cron/purge-call-recordings` (daily; deletes the Recall.ai media, then clears the booking's recording fields). Support tickets and R2 attachments: hourly purge in the feedback Worker (`workers/feedback/src/retention.js`, 3 years from last activity). Still open: email events at 24 months, group-event recordings, and self-serve deletion of tickets/R2/Recall data. Before the first live run, call each cron with `?dry=1` (feedback Worker: `RETENTION_DRY_RUN=1`) and check the counts.

---

## Update 2026-10-19: Mobile companion app (brand new this week, currently undisclosed everywhere)

**Not mechanical. Do not publish without sign-off.** This is a first disclosure of a new product surface, plus a new instance of the "we store a credential/session server-side" pattern that §2.2/§2.5 already treat carefully for Creator API credentials. Flagging per the standing rule: a new instance of that pattern gets the same careful treatment, not a rubber stamp.

### What shipped

Between 2026-10-18 15:51 and 2026-10-19 10:38 (desktop repo: `app/mobile-bridge/`, `mobile-web/`, `workers/mobile-hub/`, `docs/developer/mobile-protocol.md`), a full mobile companion web app shipped: a installable PWA at `m.influencerbutler.com` that pairs to the desktop app and lets you check butler status, pause/stop butlers, approve share-sheet actions, and get push notifications, from a phone. **Zero mentions of "mobile" exist today in `public/legal/privacy.html`, `public/legal/terms.html`, or `src/app/extension/privacy/page.tsx`.** The legal-notice paragraph's definition of "the Software" also does not list it.

### New data this introduces (verified against the code, not guessed)

1. **Pairing by QR code** (`POST /mobile/pair/start` + `/claim`): the phone generates a P-256 keypair and sends its public key to the hub; no email involved. The account id sent is `sha256(license key)`, never the raw key.
2. **Pairing by email sign-in** (`POST /auth/request-magic-link` with `client: "phone"`, then `POST /license/phone-key`): the phone's **email address** is now tied to a new server-side credential, `IBPHONE-*`, stored in the licensing Worker's KV (`workers/licensing/src/routes/phoneDeviceKey.js`): `{ acct, email, variantId, status, keyHash, deviceId, label, createdAt, expiresAt, revoked }`. Lives 90 days, silently refreshable, with a hard 1-year cap that forces a fresh sign-in. This is a new server-side credential record, the same pattern as the Creator API vault, for a new purpose.
3. **Device records in the mobile hub** (a Cloudflare Durable Object, one per account): device id, label, public key, `enrolledVia` (`qr` or `signin`), pending/approved state, and for signed-in phones, the email. The hub relays commands and status between phone and desktop end-to-end encrypted (the hub cannot read the content), but it does see device metadata, timestamps, and command ids for replay protection.
4. **Push notification tokens** (new, `mobile-web/public/js/lib/push.js` + `workers/mobile-hub/src/lib/push.js`): the phone registers an FCM token (Firebase Cloud Messaging; APNs for iOS is reached through Firebase, so no separate Apple credential). The hub stores `{ token, platform }` per phone and calls Firebase's HTTP v1 API to deliver a short title/text the desktop chose. **This is a new subprocessor (Google Firebase) and a new data category (device push token) that is not in §2.3 or §2.1/§2.2 anywhere.** Per the code's own comment, this path is "NOT VERIFIED against real FCM yet... no Firebase project exists" so it may not be live-sending yet, but the token collection and storage code is.
5. **App Lock** (keypad + fingerprint/face): this appears to be local-only, using the phone OS's own biometric unlock APIs (WebAuthn/platform credential), not sending biometric data anywhere. Worth a one-line confirmation from whoever reviews this that no biometric template or image ever reaches `mobile-web`'s own code before this gets stated as fact in the policy.
6. **Everything else** (multi-select pause/stop, per-butler mute/quiet hours, share-sheet actions for campaign alert / creator watch / pitch / sample / idea list, "sign out everywhere", revoke-all) is control-plane traffic over the same encrypted relay, surfacing data categories already disclosed elsewhere (butler status, the five listed workspaces' own data) through a new destination (the phone). The new fact worth a sentence is that this data now also reaches a phone, not just the desktop and dashboard.

### Why this isn't mechanical

- First disclosure of a new mobile-app capability (explicit "never auto-publish" criterion).
- New server-side storage of a credential/session record (`IBPHONE-*`, device records) tied to an email address, for a new purpose. Same pattern as the Creator API vault, which required careful §2.5 language rather than a rubber stamp.
- New subprocessor (Google Firebase/FCM) whose addition is bundled with a new data category (push token), so it does not qualify for the "add a subprocessor when purpose+URL are the only new facts" mechanical carve-out.
- Retention for device records, phone-key records (120-day KV TTL per `RECORD_TTL_SECONDS` in `phoneDeviceKey.js`), and push tokens is not yet promised anywhere in §7, and no one but Liz/counsel should decide what to promise.

### Proposed blocks (ready to paste once approved)

**Block L: legal-notice paragraph (privacy.html and terms.html).** Add "the Influencer Butler mobile companion app" to the list of surfaces the Software definition covers, alongside the desktop app, extension, and website.

**Block M: new §2.11 (privacy.html, insert after §2.10, before §3):**

```html
<h3>2.11 Mobile companion app</h3>
<p>If you pair a phone to the Influencer Butler mobile companion app (a web app you can install from <code>m.influencerbutler.com</code>), we process the following so it can show your butlers' status and relay your taps back to your computer:</p>
<ul>
    <li><strong>Pairing by QR code</strong>: your phone generates its own encryption key on the device. We never see your license key; we see a one-way hash of it (the same account identifier used elsewhere) and your phone's public key.</li>
    <li><strong>Pairing by signing in with your email</strong>: if you pair by email instead of a QR code, we issue a phone-specific sign-in credential tied to your email address, separate from your license key, that expires and must be renewed (contract performance).</li>
    <li><strong>Device information</strong>: a label you or your phone chooses (for example a device name), and whether the device is approved. You can see and remove paired phones, and sign out all phones at once, from Settings.</li>
    <li><strong>Push notifications</strong>: if you allow notifications, your phone registers a push token with Google Firebase Cloud Messaging so we can deliver a short alert (for example, that a butler needs your attention). The alert text is limited to what is safe to show on a lock screen; the detailed status and commands between your phone and computer are end-to-end encrypted, so our servers relay them without being able to read them.</li>
    <li><strong>What you already see on your computer or dashboard</strong>: status, counts, and controls for the butlers and features described elsewhere in this policy (for example §2.2, §2.5) also become visible on your paired phone. Pairing a phone does not create a new category of data about those features; it adds a new place you can view and act on it.</li>
</ul>
<p>[CONFIRM: retention period for device records, phone sign-in credentials, and push tokens after a phone is removed or inactive.] [CONFIRM: whether App Lock (phone PIN/biometric unlock) ever sends biometric data to us -- our reading of the code is no, it uses the phone's own OS unlock, but this should be confirmed before we state it as fact.]</p>
```

**Block N: §2.3 addition (new subprocessor line):**

```html
<li><strong>Google LLC (Firebase Cloud Messaging)</strong>: delivers push notifications to the mobile companion app (§2.11). Receives a device push token; does not receive the content of your butlers' status or commands, which travel end-to-end encrypted. This is separate from the Google Calendar/Meet/YouTube/Analytics uses described above. [CONFIRM: Firebase's privacy policy URL to cite -- https://firebase.google.com/support/privacy or Google's main policy, whichever you prefer to cite.]</li>
```

**Block O: §7 retention addition:**

```html
<li><strong>Mobile companion app</strong>: device records and phone sign-in credentials, until you remove the phone or it is inactive for [CONFIRM: a chosen period -- the phone sign-in credential itself expires after 90 days unless renewed, with a 1-year hard cap forcing re-sign-in; code does not yet define a cleanup period for removed/revoked device records]. Push tokens: deleted when you remove the phone or turn off notifications.</li>
```

**Block P: §9 international transfers:** add Google (Firebase) to the list of US-processed providers if Block N is accepted; it already names "Google" for Calendar/Meet/YouTube/GA4, so this may just need a parenthetical rather than a new entry.

### Smaller, lower-priority item noticed in the same sweep

**Target.com rate-card lookups (extension).** This week's Target parity work (`extension/src/background/rate-card.ts`, `/api/extension/target-rate-card`) sends Target product IDs (TCINs) to our own server for a commission-rate lookup, the same pattern already disclosed for Amazon ASINs in the extension privacy page's "Lookups that do not need an account" section, just for a new retailer and product-id shape. Judgment call on whether this needs its own sentence or is already covered by the existing general wording; flagging rather than deciding, per the "first disclosure" caution for retailer-specific flows. If you'd rather treat this one as mechanical and just add "and Target TCINs" to the existing sentence, say so and it can go out with the next mechanical batch.

### What to do with this section

Liz/counsel should: (1) decide the retention periods marked [CONFIRM] above, (2) confirm the Firebase citation, (3) confirm the App Lock biometric claim, (4) decide the Target TCIN item, then these blocks can be pasted into `privacy.html`, `terms.html`, and (if the mobile app ever gets its own store listing) a mobile-app-specific privacy page. Until then nothing here touches the live files.
