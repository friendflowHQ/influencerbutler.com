/**
 * Summary: Hand-curated product facts fed to the autopilot writer so posts
 *   never invent features. Descriptions are distilled from the tutorial
 *   summaries in content/tutorials/_index.json and the free/pro split in
 *   lib/entitlements.ts (FREE_BUTLER_SLUGS). Deliberately a static constant:
 *   lib/landing-features.ts reads public/index.html with fs at runtime, and
 *   importing it here would trace public/ into the serverless bundle (the
 *   known 300MB Vercel failure). Update this file when butlers change.
 */

export const PRODUCT_FACTS = `Influencer Butler is automation software for Amazon Influencer Program creators. It has two parts:
- A desktop app (Windows and Mac) where "butlers" automate repetitive creator work. Download at /go/download.
- A free Chrome extension (no login needed) that shows Amazon intel while you browse: influencer vs brand video counts on product pages, content gaps in your own orders, storefront checkups, Creator Connections campaign radar with fill meters, a money-first search overlay, and per-product earnings badges. Get it via the Chrome Web Store (link on /extension).

Pricing: a Free tier (forever), a free Pro trial with no auto-charge, and paid Pro plans. Do not state specific prices; link to /pricing instead.

FREE FOREVER butlers (work on any account, even lapsed): Orders Butler, Storefront Butler, CC Check, Like Butler, Benable Like Butler, Instagram Like Butler. Everything else needs the Pro trial or a Pro plan.

Desktop butlers (accurate one-liners; never claim capabilities beyond these):
- Orders Butler (free): pulls your real Amazon purchase and commission history so the rest of the app has accurate ASIN signal.
- Storefront Butler (free): syncs photos, videos, idea lists, and media collections from your Amazon storefront into one searchable feed.
- CC Check (free): checks your ASINs against live Creator Connections catalogs, accepts campaigns, and submits content from one results table.
- Like Butler (free): auto-likes brand Creator Connections storefront content on a cadence to stay visible to brands.
- Benable Like Butler (free) and Instagram Like Butler (free): auto-like other creators' Benable collections / Instagram posts on a schedule with caps and delays.
- Deals Butler (Pro): end-to-end deal posting - filters Amazon deals on price, discount, and commission, builds posts from your template, and posts to your social destinations on a schedule (Facebook groups and pages, Telegram, Instagram broadcast channels, and more). Includes a Guided Setup that configures it for you.
- Amazon Butler (Pro): automated Creator Connections outreach to the brands behind your top-selling ASINs.
- Daily Commission Butler (Pro): auto-accepts the right Creator Connections campaigns based on what you actually sold yesterday.
- Campaign Deals (Pro): tracks which products in your accepted campaigns are on sale right now.
- Pricecrash Butler (Pro): scans Amazon on a schedule for extreme pricing errors and hands catches to Deals Butler.
- Black Friday Butler (Pro): monitors your storefront for time-limited and Black-Friday-flagged deals.
- Prime Day Butler (Pro): surfaces Prime Day deals from content you already made and products you own, ranked by estimated earnings.
- Goldmine Butler (Pro): scans other creators' storefronts for #ad and #partner content to find brands already paying creators in your niche.
- Ads Goldmine (Pro): scores ASINs by ad and sponsorship density signals to find products worth featuring or pitching.
- Instagram Goldmine (Pro): research crawler that finds brands running paid partnerships on Instagram in your niche.
- Pitch Butler (Pro): one CRM for every brand pipeline - prospects flow in from the Goldmines, Levanta, and Creator Connections; connect Gmail to send pitches and auto-track replies.
- Instagram Butler (Pro): sends first-touch outreach DMs to brands on Instagram with rotating templates, follower filters, and a do-not-message list.
- Messenger Butler (Pro): personalized opening DMs to creators in your Instagram Butler queue.
- Instagram Close Friends Butler (Pro): auto-adds new followers to your Close Friends list with strict rate limits.
- Instagram Email Collection (Pro): harvests brand emails hiding in your Instagram DMs into a reusable contact list.
- YouTube Butler (Pro): cross-posts your shoppable Amazon videos to YouTube with affiliate links and automatic Shorts handling.
- Video Reload Butler (Pro): re-encodes and re-uploads storefront videos across 13 Amazon marketplaces with translated titles and local-language captions.
- Photo Reload Butler (Pro): re-posts storefront photos to Canada, the UK, Australia, and Singapore with fresh tags.
- Retag Butler (Pro): finds published content pointing at out-of-stock ASINs and tags replacements automatically.
- Relink Butler (Pro, beta): swaps affiliate link providers across already-published content.
- Link Butler (Pro): branded, tracked short links that open the Amazon shopping app, with a health ledger.
- Foyer Butler: a shoppable link-in-bio page at links.influencerbutler.com/@handle built from tracked Butler Links, with product tiles, headings, a booking tile, an announcement banner, a hero image, social icons, affiliate disclosure switches, a Today's Deals grid fed by the user's Deals Butlers (Amazon, Walmart, TikTok Shop; Deal Packs, deal source, best sellers, deal priority, mix of stores, category sorting), double opt-in Email capture, a free ($0) Digital Products download tile (priced checkout "coming soon"), Page Analytics, and a newsletter built from live deals (Send now or Send automatically daily/2-3 days/weekly; Send to someone else up to 100 with permission; own-domain sending on paid plans). The page and subscriber list are free to keep on any plan; sending newsletters needs Pro after the trial. Amazon items in emails show percent off, never a price. Tutorial: /help/tutorials/foyer-butler.
- Walmart Butler (Pro group; one shared Walmart Creator sign-in from its Settings, plus a per-category commission rate card): Collection Builder reads a public Amazon idea list (or a whole storefront in bulk mode), matches each item to the identical Walmart product or the closest popular pick (Both / Same product only / Similar picks only), writes a similar name and description (or keeps the Amazon wording), shows an expected commission Rate per pick, stock-checks right before building, builds the collection on the Walmart Creator storefront after review (no review step in bulk mode; Review first per list), can post collections to Facebook via Deals Butler or add them to the Deals queue (cover from product photos, {name}/{count} caption, a collection link needs no affiliate link), and removes out-of-stock items from existing collections. Video Repost and Photo Repost republish Amazon storefront videos/photos to Walmart only on an exact UPC/GTIN match, with a Set it up wizard, review or auto mode, per-run caps, schedules and Post cleanup. Walmart Research tracks price history, approximate rank, estimated monthly sales (~) and stock for every Walmart product the app looks up, refreshed daily. Walmart Performance is read-only and reads Sales (whole carts), Commissionable sales (paying categories only; grocery, pharmacy, household pay 0%), Commission, per-item rates, storefront vs affiliate-link split, collections with out-of-stock flags, post clicks and traffic, once or every day. Tutorials: /help/tutorials/walmart-collection-builder, /help/tutorials/walmart-repost, /help/tutorials/walmart-research, /help/tutorials/walmart-performance.
- Shopping Butler: searches Amazon and Walmart for what the user types and ranks results by price, product quality and the commission they would earn.
- Voiceover Butler (Pro): FTC-compliant voiceover scripts generated from ASINs, validated against Amazon video rules.
- Benable Butler (Pro, beta): researches Amazon from a niche keyword and publishes AI-built collections to Benable.
- Benable Comment Butler (Pro): AI-written, product-specific comments on Benable collections.
- Collab Butler (Pro): Kanban board tracking every brand collaboration from pitched to paid.
- Content Butler (Pro): drag-and-drop calendar for planning what to film next, fed from Orders Butler.
- Product Research (Pro): price and sales-rank history for products you browse, built from your own browsing with the extension.
- Group Invite Butler (Pro): invites harvested creator emails into your Facebook group at a human pace with caps.
- Facebook Group Builder (Pro): AI-plans a niche Facebook group, generates its assets, and hands it to Deals Butler.
- Facebook Inviter (Pro): invites people who reacted to group posts to follow your Facebook Page.
- Delete Posts & Comments (Pro): bulk-cleans old deal posts and expired promo comments on a schedule with a protect list.
- Levanta Butler (Pro): pitches Levanta-approved brands on autopilot and harvests brand contact emails.
- Action Queue: one inbox where any butler that needs a human decision parks it instead of blocking the run.
- Focus Mode: a calmer, ADHD-friendly workspace mode (Ctrl+.).
- AI Concierge: live voice/text product walkthrough and setup help, 24/7.
- Keywords & Filters: outreach filters plus AI-generated seasonal keyword lists ranked against your Creator Connections catalog.
- API Integrations: one panel for Amazon Creators API, OpenAI, Levanta, deeplink providers, Telegram, YouTube, and more. The AI features need the user's own OpenAI API key (platform.openai.com), not a ChatGPT subscription.
- Runs great on an always-on cloud PC (see the /blog cloud PC guide) so butlers keep working while your laptop is closed.

Useful internal pages: /pricing, /extension, /go/download, /help (tutorials), /course/amazon-influencer (free 11-part course), feature pages under /features/ (e.g. /features/deals-butler, /features/orders-butler, /features/pitch-butler, /features/walmart-butler).`;
