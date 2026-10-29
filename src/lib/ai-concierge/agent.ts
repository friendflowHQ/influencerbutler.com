/**
 * Butler AI concierge - the shared "brain" for both the voice (OpenAI Realtime)
 * and text (Groq chat) surfaces of the instant AI demo/support call.
 *
 * It reuses knowledge that already lives in the repo rather than inventing a new
 * store:
 *   - persona/instructions stay lean (Groq free-tier TPM is tight); feature and
 *     pricing facts are fetched on demand via list_features / get_pricing,
 *   - `search_help` grounds "how do I set up X" answers in the tutorial keyword
 *     index (loadSearchIndex, the same index the /help search box uses),
 *   - `list_features` / `get_pricing` / `get_earnings_summary` reuse the MCP
 *     TOOL_REGISTRY handlers.
 *
 * Dependencies: ../mcp/tools, ../mcp/feature-catalog, ../tutorials,
 * ../mcp/auth, ../scheduling-server, ../entitlements.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { callTool } from "@/lib/mcp/tools";
import type { Principal } from "@/lib/mcp/auth";
import { loadSearchIndex, loadManifest } from "@/lib/tutorials";
import { getAdmin } from "@/lib/scheduling-server";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { tierForSubscriptionStatus } from "@/lib/entitlements";
import { isPlaceholderCompEmail } from "@/lib/comp-codes";

export const BOOK_CALL_PATH = "/dashboard/book";
const SITE = "https://www.influencerbutler.com";
const SEARCH_RESULT_LIMIT = 4;
const MAX_HIT_IMAGES = 3;

/**
 * The desktop app's left menu, in display order, so the model can give exact
 * click paths ("In the left menu, click API Integrations"). Mirrors the nav in
 * the desktop repo's renderer/index.html; groups are hub entries that expand
 * into sub-tools. Each item carries its data-section key in [brackets] in the
 * rendered map: the start_walkthrough tool's `steps[].section` must use those
 * keys. Update this list when the desktop nav changes.
 */
type NavLeaf = { label: string; key: string };
const DESKTOP_NAV: Array<{ label: string; key?: string; items?: NavLeaf[] }> = [
  { label: "Dashboard", key: "dashboard" },
  {
    label: "Amazon Butler",
    items: [
      { label: "Message Brands", key: "outreach" },
      { label: "Keywords & Filters", key: "ai-keyword-generator" },
      { label: "Orders Butler", key: "orders-butler" },
      { label: "Daily Commission Butler", key: "harvest" },
      { label: "Storefront Butler", key: "storefrontbutler" },
      { label: "CC Check", key: "cc-check" },
      { label: "Campaign Deals", key: "cc-deals" },
      { label: "Campaign Alert Butler", key: "campaign-alert-butler" },
      { label: "Brand Release Butler", key: "brand-release-butler" },
      { label: "Data Refresh Butler", key: "data-refresh-butler" },
      { label: "Like Butler", key: "like-butler" },
      { label: "Goldmine Butler", key: "goldmine-butler" },
      { label: "Earnings Intelligence", key: "earnings-intelligence" },
      { label: "Black Friday Butler", key: "black-friday" },
      { label: "Prime Day Butler", key: "prime-day-butler" },
      { label: "Video Reload Butler", key: "video-reload-butler" },
      { label: "Photo Reload Butler", key: "photo-reload-butler" },
      { label: "Retag Butler", key: "retag-butler" },
      { label: "Ads Goldmine", key: "ads-goldmine" },
      { label: "Product Research", key: "product-research" },
      { label: "YouTube Butler", key: "youtube-butler" },
    ],
  },
  {
    label: "Instagram Butler",
    items: [
      { label: "Instagram Close Friends Butler", key: "closefriends-butler" },
      { label: "Instagram Message Followers", key: "instagram-outreach" },
      { label: "Instagram Email Collection", key: "instagram-email" },
      { label: "Instagram Goldmine", key: "instagram-goldmine" },
      { label: "Instagram Like Butler", key: "instagram-like-butler" },
    ],
  },
  {
    label: "Messenger Butler",
    items: [
      { label: "Messages", key: "messenger" },
      { label: "Templates", key: "messenger-templates" },
    ],
  },
  { label: "Collab Butler", key: "collab" },
  { label: "Content Butler", key: "content-butler" },
  { label: "Pitch Butler", key: "pitchbutler" },
  {
    label: "Deal Posting",
    items: [
      { label: "Deal Posting", key: "deals" },
      { label: "Best Seller Butler", key: "best-seller-butler" },
      { label: "Pricecrash Butler", key: "pricecrash-butler" },
    ],
  },
  { label: "Social Posting Butler", key: "social-posting-butler" },
  {
    label: "Collage Butler",
    items: [
      { label: "Collage Butler", key: "collage-butler" },
      { label: "Keywords & Filters", key: "collage-keywords" },
      { label: "Collage Gallery", key: "collage-gallery" },
      { label: "Collage Templates", key: "collage-templates" },
    ],
  },
  {
    label: "Levanta Butler",
    items: [
      { label: "Message Brands", key: "levanta-message-brands" },
      { label: "Email Extractor", key: "levanta-email-extractor" },
    ],
  },
  { label: "Action Queue", key: "action-queue" },
  { label: "Pinterest Butler", key: "pinterest-butler" },
  { label: "Voiceover Butler", key: "voiceover-butler" },
  {
    label: "Facebook Butler",
    items: [
      { label: "Facebook Inviter", key: "facebook-influencer" },
      { label: "Group Invite Butler", key: "group-invite-butler" },
      { label: "Facebook Group Builder", key: "facebook-group-builder" },
      { label: "Facebook Message Butler", key: "facebook-message-butler" },
      { label: "Delete Posts & Comments", key: "delete-posts-comments" },
    ],
  },
  {
    label: "Benable Butler",
    items: [
      { label: "List Publishing", key: "benable-butler" },
      { label: "Benable Like Butler", key: "benable-like-butler" },
      { label: "Comment Butler", key: "benable-comment-butler" },
    ],
  },
  {
    label: "Deeplink Butler",
    items: [
      { label: "Influencer Deeplink Butler", key: "link-butler" },
      { label: "Relink Butler", key: "relink-butler" },
    ],
  },
  { label: "Content Planner", key: "content-planner" },
  { label: "Sheetsyncer Butler", key: "google-sheets-export" },
  { label: "Temu Butler", key: "temu" },
  { label: "API Integrations", key: "api-integrations" },
  { label: "Console", key: "audit" },
  { label: "Feedback", key: "feedback" },
  { label: "AI Assistant", key: "ai-assistant" },
  { label: "Help & Tutorials", key: "help" },
  { label: "Settings", key: "settings" },
];

/**
 * The generated nav map: every workspace/sub-panel with its EXACT click path
 * and one-line description, produced from the desktop's live nav tree by
 * `scripts/help/build-nav-map.js` in the desktop repo and published here as
 * content/nav-map.json. This supersedes the hand-maintained DESKTOP_NAV above
 * (kept only as a fallback), so the concierge's click paths stay correct and
 * complete as the app adds workspaces. Read once at module load.
 */
type NavMapEntry = { section: string; label: string; path: string; description?: string };
const NAV_MAP: NavMapEntry[] = (() => {
  try {
    const raw = readFileSync(join(process.cwd(), "content", "nav-map.json"), "utf8");
    const parsed = JSON.parse(raw) as { entries?: NavMapEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
})();

function navMapLines(): string {
  // Prefer the generated map: one line per screen with its full path + the
  // [section] key start_walkthrough steps must use, plus what it does.
  if (NAV_MAP.length) {
    return NAV_MAP.map((e) =>
      `- ${e.path} [${e.section}]${e.description ? `: ${e.description}` : ""}`,
    ).join("\n");
  }
  // Fallback to the hand-maintained tree if the generated map is unavailable.
  const leaf = (l: { label: string; key?: string }) =>
    l.key ? `${l.label} [${l.key}]` : l.label;
  return DESKTOP_NAV.map((entry) =>
    entry.items && entry.items.length
      ? `- ${entry.label} (group): ${entry.items.map(leaf).join(", ")}`
      : `- ${leaf(entry)}`,
  ).join("\n");
}

/**
 * Curated desktop walkthrough tours (defined in the desktop repo's
 * renderer/hud/assistant-tours.js). The model prefers one of these ids;
 * anything else falls back to AI-composed section steps.
 */
const WALKTHROUGH_TOURS: Array<{ id: string; about: string }> = [
  { id: "deals-setup", about: "Deal Posting filters, post builder, destinations, scheduler" },
  { id: "deals-harvest", about: "Deal Posting deal harvest and send" },
  { id: "api-integrations", about: "API Integrations and DeepLink Routing setup" },
  { id: "deeplink-mint", about: "Mint a short Butler Link in Deeplink Butler" },
  { id: "daily-commission-harvest", about: "Daily Commission Butler run and schedule" },
  { id: "feedback-report", about: "Send feedback from the Feedback panel" },
  { id: "instagram-goldmine-harvest", about: "Instagram Goldmine: harvest follower emails from accounts or hashtags" },
  { id: "group-invite-butler-setup", about: "Group Invite Butler: invite harvested people to a Facebook group" },
  { id: "ig-to-fb-group", about: "Full flow: harvest Instagram followers then invite them to a Facebook group" },
  { id: "facebook-message-setup", about: "Facebook Message Butler: message group or page members and schedule it" },
  { id: "content-butler-plan", about: "Content Butler: quick-add products and plan them on the calendar" },
  { id: "messenger-setup", about: "Messenger Butler: harvest conversations and schedule it" },
  { id: "pitch-butler-setup", about: "Pitch Butler: import brands into the CRM and add them by hand" },
  { id: "like-butler-setup", about: "Like Butler: like posts on creator storefronts, run and schedule" },
  { id: "storefront-butler-harvest", about: "Storefront Butler: harvest your storefront products, lists and videos" },
  { id: "benable-butler-setup", about: "Benable Butler: publish a niche list to Benable and schedule it" },
  { id: "collab-butler-setup", about: "Collab Butler: track brand collaborations in the CRM board" },
  { id: "orders-butler-harvest", about: "Orders Butler: harvest your Amazon order history" },
  { id: "retag-butler-setup", about: "Retag Butler: rescan posts to retag products, run and schedule" },
  { id: "prime-big-deal-days", about: "Prime Day and Prime Big Deal Days prep: load the event deals, refresh orders, build and print the content list in Prime Day Butler" },
];

/**
 * Richer descriptions for tours that only newer desktop builds ship. They are NOT
 * in WALKTHROUGH_TOURS or BASE_TOUR_IDS (older builds cannot resolve them); the
 * desktop's live catalog is what makes them selectable, and walkthroughListLine
 * swaps its bare title for this description when the id is in that catalog.
 */
const DESKTOP_ONLY_TOUR_ABOUT: Record<string, string> = {
  "prime-day-deals-setup": "Prime Day Deals workspace and Prime Day mode: Search Deals, catalogue, caption formulas, calls to action, then the switch that posts the event queue",
  "prime-day-foyer": "Choose whether the Foyer page shows Prime Day deals during the event",
  "move-to-new-computer": "Move to a new computer: where to save the file on the old computer, how to open it on the new one, and the Mac and Windows specifics, on screen",
};

/**
 * The curated tour ids the model may always pass, even when the desktop sends
 * no catalog. This is the single source for the start_walkthrough enum below.
 * The desktop's LIVE catalog (window.ibAssistantTours.list(), sent on every
 * chat turn) is unioned on top of this at request time, so a tour newly shipped
 * in the desktop build becomes selectable here without editing this list. Keep
 * these in sync with the always-present tours in the desktop registry.
 */
export const BASE_TOUR_IDS: string[] = [
  "deals-guided-setup", "deals-setup", "deals-harvest", "api-integrations",
  "deeplink-mint", "daily-commission-harvest", "feedback-report",
  "instagram-goldmine-harvest", "group-invite-butler-setup", "ig-to-fb-group",
  "facebook-message-setup", "content-butler-plan", "messenger-setup",
  "pitch-butler-setup", "like-butler-setup", "storefront-butler-harvest",
  "benable-butler-setup", "collab-butler-setup", "orders-butler-harvest",
  "retag-butler-setup", "prime-big-deal-days",
];

/** One catalog entry the desktop sends: a tour id and its human title. */
export type TourCatalogEntry = { id: string; title?: string };

/**
 * Normalize the desktop-sent tour catalog (window.ibAssistantTours.list()).
 * Drops junk, dedupes, and caps length so a tampered payload cannot bloat the
 * tool schema or the system prompt.
 */
export function sanitizeTourCatalog(raw: unknown): TourCatalogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TourCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const row of raw as Array<Record<string, unknown>>) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 60) : "";
    if (!id || seen.has(id)) continue;
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 120) : "";
    seen.add(id);
    out.push(title ? { id, title } : { id });
    if (out.length >= 200) break;
  }
  return out;
}

/** BASE_TOUR_IDS unioned with the desktop's live catalog ids (deduped). */
function tourIdEnum(extra: TourCatalogEntry[]): string[] {
  const ids = new Set<string>(BASE_TOUR_IDS);
  for (const t of extra) ids.add(t.id);
  return [...ids];
}

/**
 * The "prefer a curated tour" prompt line: the curated tours (with their rich
 * descriptions) plus any extra tours the desktop shipped that we do not describe
 * here, listed by title so the model knows what each one is for.
 */
function walkthroughListLine(extra: TourCatalogEntry[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const t of WALKTHROUGH_TOURS) {
    parts.push(`${t.id} (${t.about})`);
    seen.add(t.id);
  }
  for (const t of extra) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const about = DESKTOP_ONLY_TOUR_ABOUT[t.id] || t.title;
    parts.push(about ? `${t.id} (${about})` : t.id);
  }
  return parts.join("; ");
}

/**
 * The system prompt / persona shared by voice and text. Kept factual and short;
 * the deep how-to knowledge is fetched on demand via the search_help tool rather
 * than dumped in here.
 */
/**
 * One line telling the model what kind of computer the desktop app is running on. The desktop sends
 * process.platform ("darwin" / "win32" / "linux"); anything else (website, extension) adds nothing.
 */
export function platformLine(platform?: string): string {
  const p = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (p === "darwin") return "The user's computer is a Mac. When steps differ between Mac and Windows, give the Mac steps.";
  if (p === "win32") return "The user's computer is a Windows PC. When steps differ between Mac and Windows, give the Windows steps.";
  return "";
}

export function buildInstructions(
  persona?: { butlerName?: string; firstName?: string },
  tours: TourCatalogEntry[] = [],
  platform?: string,
): string {
  const firstName = persona && typeof persona.firstName === "string" ? persona.firstName.trim() : "";
  const butlerName = persona && typeof persona.butlerName === "string" ? persona.butlerName.trim() : "";
  return [
    "You are Butler AI, the friendly on-demand concierge for Influencer Butler, a desktop app by",
    "The Social Media Posse LLC that helps Amazon creators and influencers automate Creator",
    "Connections, brand outreach, commission harvesting, deal posting, and storefront and content",
    "management. The individual tools are called \"butlers.\"",
    "",
    firstName ? `The user's first name is ${firstName}. Address them by their first name naturally, not in every sentence.` : "",
    butlerName ? `The user has named their assistant "${butlerName}". You ARE ${butlerName}: refer to yourself as ${butlerName} when it reads naturally, and do not call yourself "Butler AI" to them.` : "",
    (firstName || butlerName) ? "" : "",
    platformLine(platform),
    "Your job: give a live product demo and answer setup questions in real time, like a helpful",
    "pre-sales and onboarding specialist. Be warm, concise, and concrete. In voice mode, speak in",
    "short spoken sentences. Ask a clarifying question when the user's goal is unclear.",
    "",
    "Language:",
    "- Always reply in the language the user's own messages are written in. Match them exactly:",
    "  English question, English answer.",
    "- If you cannot tell what language the user is using (a short greeting, a product name, or",
    "  unclear audio), default to English. Never guess a language the user has not used.",
    "- Never switch languages mid-conversation unless the user switches first.",
    "- In voice mode, if you could not hear the user clearly, ask them to repeat in the language",
    "  they last spoke, or in English if they have not spoken yet.",
    "",
    "Grounding rules:",
    "- For any specific how-to, setup, or troubleshooting question, CALL the search_help tool and",
    "  base your answer on what it returns. Do not guess steps.",
    "- For pricing or plan questions, call get_pricing. For what a feature (butler) does and its",
    "  tier, call list_features.",
    "- When the signed-in user asks about their own earnings or plan, call get_earnings_summary or",
    "  get_subscription. Only share their data with them.",
    "- Never invent features, numbers, or steps. If you are not sure, say so and offer to point them",
    "  to a tutorial or book a human call.",
    "- For why a butler paused or stopped, or when it will post again after a platform rate limit or",
    "  block, answer from the \"When a butler pauses\" facts below. Do not guess a resume time and do",
    "  not send the user to a platform status page.",
    "",
    "Answering setup questions (be the fix, not a redirect):",
    "- Your first job is to actually solve the user's problem in the chat. For a setup, how-to, or",
    "  troubleshooting question, call search_help, then give concrete numbered steps with the exact",
    "  click path. Do not reply with only a link to a tutorial page or only \"book a call\": answer it.",
    "- When search_help returns a tutorial that has a videoId, call show_video with that tutorialId so",
    "  the user gets a tappable video card next to your steps. Prefer the video that matches the exact",
    "  butler the user asked about. Mention it in one short phrase (\"here is the quick video too\"); do",
    "  not paste a YouTube url into your text, the card carries it.",
    "- Only offer a human (offer_human_call) or an in-chat booking (offer_booking) AFTER you have given",
    "  the self-serve answer, and mainly when the user is still stuck, asks for a person, or wants",
    "  hands-on onboarding. Leading with \"book a call\" instead of answering is exactly what we are",
    "  trying to stop.",
    "",
    "The Chrome extension and the phone app (cover these too):",
    "- Chrome extension: a companion browser extension that shows money intel while the user browses",
    "  (Butler Scores, price and video history, Campaign Radar and SPCC on Creator Connections, Video",
    "  Money on the Creator Hub, deal and idea-list signals, deep links, the Global Maximizer). It",
    "  signs in with the same license, syncs with the desktop app, and has its own Ask Butler AI chat.",
    "  Install it from the Chrome Web Store, then sign in with the license email. For how-to detail,",
    "  call search_help (the extension tutorials) and link /help/tutorials/extension.",
    "- Phone app (mobile companion): a phone web app the user pairs to the desktop to watch butlers,",
    "  approve actions, and share. To pair: on the desktop, open Settings, then Mobile, then Show",
    "  pairing code, and scan the QR with the phone, or open the pairing link. It is paired to the",
    "  account, not a second login. For detail, call search_help and link the mobile companion tutorial.",
    "",
    "AI butlers and the user's own OpenAI key:",
    "- The AI butlers (for example Voiceover Butler, Benable Butler, the AI keyword generator, and AI",
    "  captions and titles) use the user's own OpenAI API key. It is separate from a ChatGPT",
    "  subscription, which does not work, and OpenAI bills them directly for what they use, usually",
    "  pennies. You (the concierge) and the extension's free caption engine are included with no key.",
    "  When it comes up, link /help/tutorials/openai-api-setup.",
    "",
    "When a butler pauses (platform rate limits and blocks):",
    "- Facebook, Instagram, and TikTok sometimes limit how often an account can post. When that",
    "  happens Butler pauses that butler, rests, and starts again on its own. The user does not need",
    "  to do anything to resume it.",
    "- A soft rate limit (the \"we limit how often you can post\" message) is short. Butler rests about",
    "  2 hours the first time, and only steps up to longer rests (about 8, then 12, then 24 hours) if",
    "  it keeps happening several times in a row. A harder block (\"you're temporarily blocked\", a",
    "  feature block, a checkpoint, or a security check) lasts longer, often a day or more.",
    "- Butler shows its own restart time in the app, and it retries automatically at that time. That",
    "  is the time to trust.",
    "- A soft rate limit does NOT show up on Facebook's status page or the account quality page. Those",
    "  only list hard blocks and checkpoints, so seeing \"no issues, no dates\" there is normal and does",
    "  not mean the pause is a mistake. Butler does not watch Facebook's status to decide when to",
    "  resume; it rests on its own timer. Never tell the user to check Facebook's status or account",
    "  quality page to learn when a soft limit lifts, because the answer is not there.",
    "- These limits are not only about how much the user posted. How fast they post, the account's",
    "  history, and factors outside their control can trip one on a normal day. Reassure them it is",
    "  not a sign they did anything wrong.",
    "- If a \"Live app status\" note appears in this conversation, it has this user's REAL current",
    "  pauses and restart times. When they ask why a butler stopped or when it posts again, answer",
    "  from that note (name the butler and its actual restart time) instead of the general timing",
    "  above. If the note shows nothing paused, tell them everything is running and nothing is on hold.",
    "",
    "Finding coupon and promo-code deals (Deal Posting):",
    "- Clippable Amazon coupons (the \"clip this coupon\" kind) are an OPT-IN source that is OFF by",
    "  default. To turn it on: in Deal Posting, in the Search Deals area, open the \"Amazon coupons\"",
    "  panel and switch on \"Include Amazon coupon deals.\" The search then also scans Amazon's coupons",
    "  page and keeps the coupon products that pass the user's deal filters.",
    "- Yes, Butler does scan (scrape) Amazon's own coupons page for these, because Amazon's product",
    "  data feed does not expose clippable coupons. For it to pull anything the user must be signed in",
    "  to Amazon in the app's browser, and the coupon items still have to clear their deal filters",
    "  (min percent off, etc.). If they turned it on and see nothing, check both of those first.",
    "- Promo CODES (the kind typed at checkout) are different from coupons. Amazon retired its public",
    "  promo-codes page, so NO tool can scan Amazon for codes anymore (that is an Amazon change, not a",
    "  Butler limit, and it applies to every competitor too). Amazon codes now come only from brands",
    "  directly. Butler pulls them from the user's OWN Creator Connections campaigns: in the Promo Code",
    "  Hub, the \"Scan my Amazon campaigns\" button reads codes from the brands they are accepted with,",
    "  and they can also paste or add codes they find. Many campaigns carry no code, so a scan finding",
    "  few or none is normal.",
    "",
    "Prime Day and Prime Big Deal Days (Amazon's two big deal events):",
    "- Prime Day is the summer event and Prime Big Deal Days is the October one. Amazon announces the",
    "  exact dates and the deal prices itself, so never state dates or prices as fact. The app shows a",
    "  banner at the top before each event, and when a \"Live app status\" note has a Prime Day block it",
    "  names the event that is on, its countdown, and each Deal Posting's real Prime Day mode state.",
    "  Use that block to answer \"is my Prime Day mode on?\" instead of guessing.",
    "- Four tools work together. (1) Prime Day Butler > Deal Finder finds what to post and film: it",
    "  ranks Amazon deals by estimated earnings from your storefront content, products you own",
    "  (Orders Butler), fresh Creators API finds and the Amazon Deals Hub (including upcoming deals).",
    "  Buckets are Upcoming, Quick wins (you already have content) and Last-minute (you own it, no",
    "  content yet). Print content list shows what to film, Print repost list what to resurface, and",
    "  picks go to Deal Posting as drafts or ready to post. It ships hidden: click Show / Hide",
    "  Butlers in the left menu, switch on Prime Day Butler. (2) Prime Day Deals is a separate Deal Posting queue so",
    "  event deals never mix with regular ones. Search Deals there returns only event deals, the Promo",
    "  Code Hub has a Prime Day Deals Catalogue tab, and Build Your Post has Prime Day caption formulas",
    "  and calls to action. Every Deal Posting clone has its own Prime Day Deals queue that posts",
    "  through that clone's destinations. (3) Prime Day mode is the switch that posts the event queue:",
    "  in the left menu, Deal Posting, Scheduler tab, the Prime Day mode card, tick \"Post my Prime Day",
    "  deals instead.\" While it is on the regular deals pause by design. (4) The browser extension can",
    "  also send a deal to Prime Day Deals on event days.",
    "- The usual plan: before the event, run Deal Finder, print the content list, film, and send picks",
    "  to Prime Day Deals. The day before, turn Prime Day mode on and check auto-post is on in the",
    "  Scheduler (or tick \"Start Prime Day mode by itself when the event begins\"). During the event,",
    "  re-run Deal Finder every 2 to 4 hours because prices flip. Prime Day mode turns itself off when",
    "  the event ends or the Prime deals run out, and regular deals resume. They can also click Turn",
    "  off Prime Day mode in the banner at the top of Deal Posting.",
    "- Common answers. Prime deals not posting: check Prime Day mode is on, auto-post is on in that",
    "  Deal Posting's Scheduler, the Prime Day Deals queue actually has deals, destinations are",
    "  connected (Prime posts use the main Deal Posting's Social Destinations), and nothing is paused",
    "  (see the live status). Upcoming deals are embargoed: the app asks to confirm before queuing one,",
    "  and they should wait until the deal is live. Deal Finder wants fresh orders, so the Prime Big",
    "  Deal Days walkthrough refreshes a stale Orders Butler first. Walmart during Prime Day mode: a",
    "  dropdown on the card keeps the Walmart Fall Deals Event deals, keeps all Walmart deals, or",
    "  pauses Walmart too. Amazon promo codes and coupons do not apply to event deals.",
    "- Foyer page: in newer app versions, Foyer Butler, Today's Deals storefront, has a \"Prime Day",
    "  deals on this page\" choice (ask me, yes, or no). Yes makes the public page show only that Deals",
    "  Butler's Prime Day deals during the event and go back by itself when it ends. If the user does",
    "  not see that setting, tell them to update the app.",
    "- Questions first: when someone asks for help with Prime Day or Prime Big Deal Days with no",
    "  specifics, ask ONE short question with three choices: finding what to post and film, setting up",
    "  posting, or something not working. Then answer and offer the matching walkthrough: finding and",
    "  filming is prime-big-deal-days; posting, Prime Day mode, or the queue is prime-day-deals-setup;",
    "  the Foyer page is prime-day-foyer; stale orders is orders-butler-harvest. Use the Prime Day ids",
    "  only when they appear in the curated tours list above; otherwise compose steps from the menu map.",
    "- Do not call Black Friday Butler a Prime Day tool. It is the separate Black Friday and Cyber",
    "  Monday radar.",
    "",
    "Moving to a new computer (desktop app):",
    "- Use this whenever someone asks how to move, switch, transfer or migrate Influencer Butler to a new",
    "  laptop, Mac or Windows PC, or asks how to keep their setup on a new computer. Reply in the language",
    "  they wrote in. NEVER tell them to copy the data folder by hand, and do not point them to the old",
    "  \"Full transfer archive\" card unless they specifically ask about it: it has no import button and",
    "  leaves out their saved connections. The way is the Move to a new computer card.",
    "- Where it is: In the left menu, click Settings, then Data & Backup, then Move to a new computer. The",
    "  card has two sides. On the OLD computer click Save a move package. On the NEW computer, signed in",
    "  with the same license, click Choose a move package, check where the file came from, then click",
    "  Import and restart. It also has a Guide me through it button and a Show me where button.",
    "- The order matters, especially for a plan with ONE seat: (1) update the app on both computers; (2)",
    "  on the old computer click Save a move package and save the file outside the Influencer Butler",
    "  folder (Desktop or a USB drive); (3) copy the file to the new computer; (4) only AFTER saving, if the",
    "  new computer says the plan is full, open Settings, Devices & Seats on the OLD computer and remove it",
    "  there; (5) on the new computer install the app, sign in with the license email, then Choose a move",
    "  package and Import and restart; (6) finish the Finish your move checklist at the top of the app.",
    "- The file is locked with their license key, so it only opens when the new computer is signed in with",
    "  the same license. Nothing is changed or deleted on the old computer. The import checks the whole file",
    "  first, takes a few minutes for a big setup (keep the window open), saves anything it replaces to a",
    "  backup folder, then restarts the app by itself. If the app does not reopen, open it again.",
    "- What comes along: settings, templates, keywords, queues, schedules, images, saved lists, saved",
    "  connections (like their OpenAI key and connected accounts) and progress. What does NOT travel: browser",
    "  logins to Amazon, Instagram, Facebook, Walmart and other sites (they sign in again with the Sign in",
    "  buttons in the checklist; Chrome, Brave or Edge must be installed), the license seat, the Chrome",
    "  extension and phone pairing (pair again from Settings), and videos and very large files (they copy",
    "  those folders themselves). Folder locations from the old computer are listed in the checklist to pick",
    "  again, and ALL of them need picking again when moving between a Mac and a Windows PC.",
    "- Schedules start PAUSED on the new computer, on purpose, so nothing runs before they have signed in and",
    "  the old and new computers never post from the same accounts together. The checklist has steps to quit",
    "  the app on the old computer and then Turn schedules back on.",
    "- Quitting matters: clicking the window's close button only hides Influencer Butler, and its schedules",
    "  keep running. On a Mac, click Influencer Butler in the menu bar then Quit Influencer Butler (or press",
    "- On-screen names in other languages (use these exact words when the user writes in that language):",
    "  Spanish: Ajustes, then Datos y copia de seguridad, then Mover a un ordenador nuevo; buttons Guardar un",
    "  paquete de traslado, Elegir un paquete de traslado, Importar y reiniciar; the panel Devices & Seats is",
    "  called Dispositivos y plazas. French: Paramètres, then Données et sauvegarde, then Passer à un nouvel",
    "  ordinateur; buttons Enregistrer un paquet de transfert, Choisir un paquet de transfert, Importer et",
    "  redémarrer; the panel is called Appareils et places. The tray menu item is always the English word Quit.",
    "  Command+Q), or click its menu bar icon and choose Quit. On Windows, right-click the Influencer Butler",
    "  icon in the notification area next to the clock (click the small up arrow if it is hidden) and choose",
    "  Quit.",
    "- MAC steps: save the file to the Desktop or a USB drive; to bring it over, use a USB drive (eject it in",
    "  the Finder sidebar first), AirDrop (Mac to Mac only, Finder > AirDrop), or a cloud folder. To install on",
    "  the new Mac: influencerbutler.com/dl/mac for Apple chip Macs (M1 or newer) or",
    "  influencerbutler.com/dl/mac-intel for Intel Macs (Apple menu > About This Mac shows Chip or",
    "  Processor); open the downloaded file, drag Influencer Butler onto Applications, open it from",
    "  Applications and click Open if macOS asks about an app downloaded from the internet. It needs macOS 11",
    "  Big Sur or newer. If they open it from the download window the app offers to move itself to",
    "  Applications; say yes.",
    "- WINDOWS steps: save the file to the Desktop or a USB drive (File Explorer, then use Safely Remove",
    "  Hardware near the clock before unplugging), or a cloud folder; AirDrop does not exist on Windows. To",
    "  install on the new PC: influencerbutler.com/dl/win downloads Influencer Butler Setup; run it and click",
    "  Yes if Windows asks to allow changes.",
    "- Give the steps for the computer they are on (the first line of this prompt may say Mac or Windows PC).",
    "  If you do not know their system and the answer depends on it, ask \"Are you on a Mac or a Windows",
    "  PC?\" before giving steps. If they are moving between a Mac and a PC, give each computer its own",
    "  system's steps.",
    "- Keep the chat answer short: the key order, then the Mac or Windows specifics for the computer they",
    "  are on. If a walkthrough with the id move-to-new-computer is in the curated list, END by calling",
    "  start_walkthrough with it so they get the Show me each step button. The full guide, with both systems",
    "  side by side, is at /help/tutorials/move-to-a-new-computer. If a step fails, point them to Report a",
    "  bug in the chat bubble.",
    "",
    "Giving directions:",
    "- When you tell the user how to do something in the desktop app, give the exact click path,",
    "  starting from the left menu. Example: In the left menu, click API Integrations. Sub-tools",
    "  live under their group hub, for example: In the left menu, open Instagram Butler, then click",
    "  Instagram Goldmine.",
    "- Every screen with its EXACT click path from the left menu and what it does. Give the user",
    "  the full path verbatim, for example: In the left menu, open Amazon Butler, then Message",
    "  Brands, then Keywords & Filters. The [section-key] on each line is what start_walkthrough",
    "  steps must use. Never shorten a path or send the user to a generic Settings screen:",
    navMapLines(),
    "",
    "Screenshots:",
    "- search_help results may include screenshots as images with url and alt. In text chat, when a",
    "  screenshot shows the screen you are describing, attach the single most helpful one by putting",
    "  its markdown form ![alt](url) on its own line at the end of your answer, with no lead-in",
    "  sentence. Never write \"here is a screenshot\" or otherwise announce an image in prose: either",
    "  attach the markdown silently or say nothing about screenshots.",
    "- Never invent image urls; only use urls returned by search_help. If search_help returned no",
    "  image for the screen, do not mention screenshots at all; offer a guided walkthrough instead.",
    "- In voice mode, never read out urls. Describe where things are in words instead.",
    "",
    "Guided walkthroughs (desktop app only):",
    "- After you answer a how-to, setup, or demo question about a butler, END your reply by offering",
    "  to walk them through it on screen, and call start_walkthrough. Say it plainly, for example:",
    "  \"Want me to walk you through it? I can show you each step, or fast-track it and set it up for",
    "  you.\" Keep the text answer to one or two sentences; the walkthrough carries the detail.",
    "- The app renders the buttons. A step-by-step spotlight navigates to each screen and highlights",
    "  the control while the user clicks Next. A fast-track wizard asks a few questions and writes the",
    "  settings for them. The app shows the Fast track button only where a wizard exists, so you do",
    "  not need to work out which modes are available; just call start_walkthrough with the tour id.",
    `- Prefer a curated tour when one matches: ${walkthroughListLine(tours)}.`,
    "- Use deals-guided-setup when the user wants deal posting set up for them, or is struggling to",
    "  configure the Deal Posting (destinations, schedule, keywords); it opens the",
    "  question-driven wizard. Offer it proactively to strugglers.",
    "- If no curated tour fits, compose up to 8 short steps yourself. Each step needs section (a [key]",
    "  from the menu map above), a short title, and one sentence of body text.",
    "- Never offer or call start_walkthrough for website or extension users; give written steps instead.",
    "",
    "Filing feedback:",
    "- When the user reports a bug, describes something broken, or wishes for a feature that does",
    "  not exist, offer to file it with the team for them using submit_feedback.",
    "- First show a short draft: the type (bug or feature), a one line title, and a one or two",
    "  sentence description. Ask for an explicit yes. Only call submit_feedback AFTER the user",
    "  confirms. Never file without confirmation, and never file the same report twice.",
    "- After filing, confirm it was sent and that the team reads every report and replies by email.",
    "- If the filing result comes back with needsContactEmail, the account has no address the team",
    "  can reply to. Say so plainly, ask whether they would like to add one for the reply, and if",
    "  they give you an address call submit_feedback again with the same title and contact_email set.",
    "  Never tell the user to expect a reply when needsContactEmail came back true.",
    "",
    "Booking a call in chat:",
    "- The user can book a 1:1 call with the team without leaving the chat: call offer_booking and an",
    "  in-app booking card with live times appears. There are two call types. The free Setup call",
    "  (callType 'demo') is a relaxed session where we set the app up with them, and it is open to",
    "  everyone, signed in or not. The Priority 1:1 (callType 'support') is a focused troubleshooting",
    "  call that is part of a paid plan.",
    "- Decide which to offer. For general confusion, onboarding, or \"can someone just set this up with",
    "  me\", offer the free Setup call ('demo'). Only offer the Priority 1:1 ('support') to a user you",
    "  have confirmed is on a paid plan (call get_subscription first); if they are on the free tier,",
    "  offer 'demo' and mention the Priority call comes with a plan. Use 'both' only when a paid user",
    "  would genuinely choose between them.",
    "- Always answer the actual question first. offer_booking is for when self-serve is not enough, not",
    "  a reflex. The user picks the time and confirms the booking themselves in the card; you never",
    "  book it for them. offer_human_call (a plain link to the booking page) stays the fallback for a",
    "  surface that cannot show the card.",
    "",
    "Boundaries:",
    "- You cannot access the user's Amazon or Instagram accounts and cannot click inside their",
    "  desktop app for them. Give exact click paths; they do the clicking.",
    "- No financial or investment advice. If asked, say you are not a licensed advisor.",
    "- Never name or compare against specific competitor products by name.",
    "- Do not use em-dashes. Use a colon, comma, or two sentences instead.",
    "- When you cannot help, or the user wants a person, call offer_human_call and let them know they",
    `  can book a human demo or support call at ${SITE}${BOOK_CALL_PATH}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tools (OpenAI function-calling). One canonical list, adapted to the two
// slightly different shapes the chat and realtime APIs expect.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
type AgentTool = { name: string; description: string; parameters: JsonSchema };

const NO_ARGS: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "search_help",
    description:
      "Search the Influencer Butler tutorials and help content for setup steps, how-tos, and troubleshooting. Call this for any specific 'how do I...' question and ground your answer in the results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A few keywords describing what the user wants to do." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_features",
    description: "List every Influencer Butler feature (butler) with its title, description, and tier.",
    parameters: NO_ARGS,
  },
  {
    name: "get_pricing",
    description: "Return the current pricing tiers (free, Pro monthly/annual, team, agency) and the free trial.",
    parameters: NO_ARGS,
  },
  {
    name: "get_earnings_summary",
    description: "Return the signed-in user's own affiliate earnings summary. Only use when they ask about their earnings.",
    parameters: NO_ARGS,
  },
  {
    name: "get_subscription",
    description: "Return the signed-in user's own subscription tier and plan. Only use when they ask about their plan or account.",
    parameters: NO_ARGS,
  },
  {
    name: "offer_human_call",
    description: "Signal that the user should book a human demo or support call. Returns the booking link to share.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Why a human call is being offered." } },
      additionalProperties: false,
    },
  },
  {
    name: "offer_booking",
    description:
      "Offer to book a 1:1 call with the Influencer Butler team RIGHT HERE in the chat (an in-app booking card with live times, on every surface). Use this after you have given the self-serve answer, when the user is still stuck, asks for a person, or wants hands-on onboarding. Pass callType 'demo' for the free Setup call (open to anyone), 'support' for the paid Priority 1:1 (only offer this to users already on a paid plan: check get_subscription first), or 'both' to show both. This only shows the card; the user picks a time and confirms it themselves.",
    parameters: {
      type: "object",
      properties: {
        callType: {
          type: "string",
          enum: ["demo", "support", "both"],
          description: "Which call type(s) to offer. Default 'demo' (the free Setup call, open to everyone).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "show_video",
    description:
      "Show the user the exact tutorial VIDEO for a topic as a tappable video card (the desktop app and Chrome extension play it; it opens YouTube elsewhere). Pass the tutorialId of a tutorial that search_help returned WITH a videoId. Offer it alongside your written steps for setup and how-to questions, on every surface (desktop, website, extension, phone).",
    parameters: {
      type: "object",
      properties: {
        tutorialId: {
          type: "string",
          description: "The tutorial id whose walkthrough video to show. Must be a tutorial search_help returned with a videoId.",
        },
      },
      required: ["tutorialId"],
      additionalProperties: false,
    },
  },
  {
    name: "start_walkthrough",
    description:
      "Start an on-screen guided walkthrough in the DESKTOP app: it navigates to each screen and highlights the control while the user clicks Next/Back. Desktop app users only. Pass a curated tourId when one matches the topic (use 'deals-guided-setup' when the user wants deal posting set up for them: it opens a wizard that asks a few questions and writes the settings); otherwise pass steps composed from the menu map's [section keys].",
    parameters: {
      type: "object",
      properties: {
        tourId: {
          type: "string",
          // Base curated ids; toChatTools() unions the desktop's live catalog on
          // top at request time so newly shipped tours are selectable too.
          enum: [...BASE_TOUR_IDS],
          description: "A curated tour id. Preferred when the topic matches.",
        },
        steps: {
          type: "array",
          maxItems: 8,
          description: "Fallback when no curated tour fits: short section-level steps.",
          items: {
            type: "object",
            properties: {
              section: { type: "string", description: "A [section key] from the left-menu map." },
              title: { type: "string", description: "Short step title." },
              body: { type: "string", description: "One sentence telling the user what to do here." },
            },
            required: ["section", "title", "body"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "submit_feedback",
    description:
      "File a bug report or feature request with the Influencer Butler team on the user's behalf. Only call this AFTER showing the user a draft (type, title, description) in the conversation and getting an explicit yes.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bug", "feature"],
          description: "bug for something broken, feature for a request or wish.",
        },
        title: { type: "string", description: "Short one line summary, max 200 characters." },
        description: {
          type: "string",
          description: "What happened or what they want, including steps and context from the conversation.",
        },
        contact_email: {
          type: "string",
          description:
            "Reply address, only when the tool has told you no reply address is on the account and the user has given you one. Leave this out otherwise.",
        },
      },
      required: ["type", "title", "description"],
      additionalProperties: false,
    },
  },
];

/**
 * Shape for OpenAI chat/completions `tools`. Pass the desktop's live tour
 * catalog to widen the start_walkthrough tourId enum to every tour the current
 * desktop build ships; with no catalog it returns the base curated enum.
 */
export function toChatTools(extraTours: TourCatalogEntry[] = []) {
  const enumIds = tourIdEnum(extraTours);
  return AGENT_TOOLS.map((t) => {
    let parameters = t.parameters;
    if (t.name === "start_walkthrough") {
      // Deep-clone so we never mutate the shared AGENT_TOOLS schema.
      parameters = JSON.parse(JSON.stringify(t.parameters)) as JsonSchema;
      const props = (parameters as { properties?: Record<string, { enum?: string[] }> }).properties;
      if (props && props.tourId) props.tourId.enum = enumIds;
    }
    return {
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters },
    };
  });
}

/** Shape for the OpenAI Realtime session `tools` (flattened). */
export function toRealtimeTools() {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Tool execution (server-side, with the caller's identity)
// ---------------------------------------------------------------------------

export type HelpImage = { url: string; alt: string };
export type HelpHit = {
  id: string;
  title: string;
  summary: string;
  url: string;
  snippet: string;
  images?: HelpImage[];
  /** YouTube id of this tutorial's walkthrough, when one exists. */
  videoId?: string;
  /** Watch url for that video, so the model can offer show_video for this id. */
  videoUrl?: string;
};

/** Public YouTube watch url for a video id. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Generic English filler that carries no topic signal. Without this a whole
// support ticket dumped in as a query ("still dragging... please help") scores
// mostly on stopwords, and long tutorials win on sheer length. Only tokens
// longer than 2 chars reach here, so 1-2 char words ("is", "a") need no entry.
const SEARCH_STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "but", "you", "your", "yours",
  "this", "that", "these", "those", "with", "from", "have", "has", "had",
  "not", "can", "cant", "cannot", "get", "got", "its", "use", "used", "using",
  "when", "what", "why", "how", "all", "any", "our", "who", "please", "help",
  "still", "also", "than", "then", "them", "they", "will", "would", "could",
  "should", "been", "being", "does", "did", "doing", "into", "just", "like",
  "some", "more", "most", "very", "much", "only", "able", "about", "after",
  "before", "dont", "doesnt", "isnt", "wasnt", "here", "there", "where",
  "which", "while", "because", "now", "out", "off", "one", "two", "set",
]);

/**
 * Rank tutorials against a query with term-frequency over
 * title + summary + category + body, and return the top matches with a short
 * snippet. Reuses the existing lexical index; no embeddings needed. Terms are
 * deduped, stopword-filtered, and matched on word boundaries so a noisy query
 * (like a full support ticket) grounds on the on-topic tutorial rather than the
 * longest one, and "app" no longer matches inside "applying".
 */
export async function searchHelp(query: string, locale?: string): Promise<HelpHit[]> {
  const terms = [...new Set(
    (query || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !SEARCH_STOPWORDS.has(t)),
  )];
  if (terms.length === 0) return [];

  const matchers = terms.map((t) => new RegExp(`\\b${t}\\b`, "g"));

  const index = await loadSearchIndex(locale);
  const scored = index
    .map((e) => {
      const hay = `${e.title} ${e.summary} ${e.category} ${e.text}`.toLowerCase();
      const titleHay = `${e.title} ${e.summary}`.toLowerCase();
      let score = 0;
      for (const re of matchers) {
        const inBody = (hay.match(re) || []).length;
        const inTitle = (titleHay.match(re) || []).length;
        score += inBody + inTitle * 5; // weight title/summary hits
      }
      return { e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_RESULT_LIMIT);

  return scored.map(({ e }) => {
    const hit: HelpHit = {
      id: e.id,
      title: e.title,
      summary: e.summary,
      url: `${SITE}/help/tutorials/${e.id}`,
      snippet: snippetFor(e.text, terms),
    };
    // Screenshots come from the tutorial body ( /assets/-only, see tutorials.ts ).
    // Absolute urls so every chat surface can render them without a base.
    const images = (e.images || [])
      .slice(0, MAX_HIT_IMAGES)
      .map((img) => ({ url: `${SITE}${img.src}`, alt: img.alt }));
    if (images.length) hit.images = images;
    // When this tutorial has a video walkthrough, hand the model its id + watch
    // url so it can offer show_video for a deep-linked video card.
    if (e.videoId) {
      hit.videoId = e.videoId;
      hit.videoUrl = youtubeWatchUrl(e.videoId);
    }
    return hit;
  });
}

function snippetFor(text: string, terms: string[]): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 120);
  return text.slice(start, start + 320).trim();
}

async function getSubscription(principal: Principal): Promise<unknown> {
  const admin = getAdmin();
  if (!admin) return { error: "subscription lookup unavailable" };
  const { data } = await admin
    .from("subscriptions")
    .select("status,plan_name")
    .eq("user_id", principal.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const status = (data?.status as string) ?? null;
  const tier = tierForSubscriptionStatus(status);
  return { tier, status, planName: (data?.plan_name as string) ?? null };
}

/** Unwrap a mcp ToolResult (JSON-in-text) back to a plain object. */
function unwrapMcp(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

/** Client metadata the chat surfaces may send along (desktop app version etc). */
export type ClientMeta = {
  surface?: string;
  appVersion?: string;
  platform?: string;
  // Optional personalization from the desktop: the user's first name and the
  // name they gave their butler, so replies can address them and stay in-voice.
  persona?: { butlerName?: string; firstName?: string };
  // Optional LIVE status the desktop captures at send time: a short, already
  // localized block naming any butlers paused right now (platform rate limit or
  // block) and when each one restarts. When present the chat route injects it so
  // the assistant answers "why did it stop / when will it post again" with the
  // real restart time instead of the general guidance. Treated as data.
  butlerStatus?: string;
};

/**
 * Validated start_walkthrough payload. The desktop resolves tourId against its
 * curated registry; steps are AI-composed section-level fallbacks. Shared by
 * the tool executor (ack) and the chat route (which forwards the payload to
 * the desktop in the response).
 */
export type WalkthroughPayload =
  | { tourId: string }
  | { steps: Array<{ section: string; title: string; body: string; target?: string }> };

export function sanitizeWalkthroughArgs(raw: unknown): WalkthroughPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.tourId === "string" && a.tourId.trim()) {
    return { tourId: a.tourId.trim().slice(0, 60) };
  }
  if (Array.isArray(a.steps)) {
    const steps: Array<{ section: string; title: string; body: string; target?: string }> = [];
    for (const s of a.steps as Array<Record<string, unknown>>) {
      if (!s || typeof s !== "object") continue;
      const section = typeof s.section === "string" ? s.section.trim().slice(0, 60) : "";
      const title = typeof s.title === "string" ? s.title.slice(0, 120) : "";
      const body = typeof s.body === "string" ? s.body.slice(0, 500) : "";
      if (!section || (!title && !body)) continue;
      const step: { section: string; title: string; body: string; target?: string } = { section, title, body };
      if (typeof s.target === "string" && s.target.trim()) step.target = s.target.slice(0, 200);
      steps.push(step);
      if (steps.length >= 8) break;
    }
    if (steps.length) return { steps };
  }
  return null;
}

/**
 * A video card the chat route forwards to the client with the reply. The client
 * plays it in-app (desktop/extension) by tutorialId, or opens `url` on YouTube.
 * Shared by the show_video executor (ack) and the chat route (which attaches the
 * resolved payload to the response).
 */
export type VideoPayload = { tutorialId: string; title: string; videoId: string; url: string };

/**
 * Resolve a tutorial id to its walkthrough video, or null when the id is unknown
 * or has no video. Reads the tutorial manifest (which attaches videoId from the
 * public _videos.json), so a beta-gated tutorial with no published video simply
 * resolves to null and no card is shown.
 */
export async function resolveVideo(tutorialId: string): Promise<VideoPayload | null> {
  const id = typeof tutorialId === "string" ? tutorialId.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) return null;
  const manifest = await loadManifest();
  const entry = manifest.tutorials.find((t) => t.id === id);
  if (!entry || !entry.videoId) return null;
  return { tutorialId: id, title: entry.title || id, videoId: entry.videoId, url: youtubeWatchUrl(entry.videoId) };
}

/**
 * One call type offered in the inline booking card. The client renders the card
 * and fetches live slots itself from /api/booking/slots, then books through
 * /api/booking/create, so this only describes what to show, never the slots.
 */
export type BookingCallType = {
  key: CallTypeKey;
  label: string;
  userMinutes: number;
  requiresSubscription: boolean;
  description: string;
};
export type BookingPayload = { callTypes: BookingCallType[] };

/**
 * Resolve an offer_booking tool call into the booking signal the chat route
 * forwards to the client. `callType` picks which call types to show: "support",
 * "both", or "demo" (the default). Always returns at least the free Setup call.
 */
export function resolveBooking(raw: unknown): BookingPayload {
  const which =
    raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).callType === "string"
      ? String((raw as Record<string, unknown>).callType)
      : "demo";
  const keys: CallTypeKey[] = which === "support" ? ["support"] : which === "both" ? ["demo", "support"] : ["demo"];
  const seen = new Set<string>();
  const callTypes: BookingCallType[] = [];
  for (const k of keys) {
    if (seen.has(k) || !CALL_TYPES[k]) continue;
    seen.add(k);
    const ct = CALL_TYPES[k];
    callTypes.push({
      key: ct.key,
      label: ct.label,
      userMinutes: ct.userMinutes,
      requiresSubscription: ct.requiresSubscription,
      description: ct.description,
    });
  }
  return { callTypes };
}

const MAX_REPLY_IMAGES = 4;

/**
 * A line whose whole job is to announce a screenshot ("Here's a screenshot of
 * the X:", "And here's a screenshot below", "See the screenshot of Y"). When
 * extractReplyImages kept zero images, these lead-ins point at nothing and are
 * removed, so the reply never promises an image it did not attach. The persona
 * also tells the model not to narrate screenshots; this is the safety net for
 * when it does anyway.
 */
const SCREENSHOT_LEADIN_RE =
  /^\s*(?:and\s+)?(?:here(?:'|’)?s|below\s+is|see)\b[^\n]*\bscreenshots?\b[^\n]*$/i;

function stripOrphanScreenshotProse(text: string): string {
  return text
    .split("\n")
    .filter((line) => !SCREENSHOT_LEADIN_RE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pull ![alt](url) markdown out of the model's reply into a structured images
 * array (absolute urls, /assets/-only) and strip it from the text, so every
 * chat surface renders screenshots without a markdown parser. Non-whitelisted
 * image markdown is dropped entirely.
 */
export function extractReplyImages(reply: string): { text: string; images: HelpImage[] } {
  const images: HelpImage[] = [];
  let text = reply
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_whole, alt: string, src: string) => {
      let url = "";
      if (src.startsWith("/assets/")) url = `${SITE}${src}`;
      else if (src.startsWith(`${SITE}/assets/`)) url = src;
      if (!url) return "";
      if (images.length < MAX_REPLY_IMAGES && !images.some((i) => i.url === url)) {
        images.push({ url, alt: alt || "" });
      }
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // No screenshot actually survived the whitelist? Then drop any orphaned
  // "here's a screenshot" prose so the reply does not describe an image the
  // user will never see (the reported bug).
  if (images.length === 0) text = stripOrphanScreenshotProse(text);
  return { text, images };
}

/**
 * True for something we can actually send a support reply to. Deliberately
 * loose (the worker and Resend do the real validation); this only has to reject
 * chat noise like "yes" or "my email" and the comp placeholder domain.
 */
function isUsableReplyEmail(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  return !isPlaceholderCompEmail(email);
}

/**
 * File a bug/feature report into the same Cloudflare feedback worker inbox the
 * desktop Feedback panel submits to, so chat-filed reports land in the standard
 * support triage flow. The worker only enforces the x-ib-key header when it has
 * FEEDBACK_SHARED_KEY set (today it does not), so the key is optional here too:
 * when the env var exists we send it, otherwise we submit without it, exactly
 * like the desktop client.
 */
async function submitFeedback(
  args: Record<string, unknown>,
  principal: Principal | null,
  client?: ClientMeta,
): Promise<unknown> {
  const sharedKey = process.env.FEEDBACK_SHARED_KEY || "";
  const type = args.type === "feature" ? "feature" : "bug";
  const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
  const description = typeof args.description === "string" ? args.description.trim().slice(0, 7000) : "";
  if (!title) return { error: "A title is required." };

  // Reply address. A comp grant that was never assigned to a person carries a
  // synthetic `comp-<uuid>@unassigned.comp.influencerbutler.com` address that is
  // deliberately never emailed (see COMP_PLACEHOLDER_DOMAIN in @/lib/comp-codes).
  // Filing that as the ticket's userEmail produced tickets that LOOKED
  // contactable but could never be answered, so support kept "replying" into a
  // void. Treat a placeholder as no address, and let the user supply a real one.
  const argEmail = typeof args.contact_email === "string" ? args.contact_email.trim() : "";
  const accountEmail = isPlaceholderCompEmail(principal?.email) ? "" : (principal?.email ?? "");
  const replyEmail = isUsableReplyEmail(argEmail) ? argEmail : accountEmail;

  const base = (process.env.FEEDBACK_WORKER_URL || "https://feedback.influencerbutler.com").replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sharedKey) headers["x-ib-key"] = sharedKey;
  try {
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type,
        title,
        description:
          `${description}\n\n[Filed via Butler AI chat${client?.surface ? ` (${client.surface})` : ""}]` +
          (replyEmail ? "" : "\n[No reply address on file: this reporter cannot be emailed back.]"),
        userEmail: replyEmail,
        appVersion: client?.appVersion || "",
        platform: client?.platform || "concierge",
        submittedAt: new Date().toISOString(),
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string } | null;
    if (!res.ok || !json?.ok) {
      console.error("[ai-concierge] submit_feedback failed", res.status, json);
      return { error: "Could not file the report. Point the user at the Feedback panel in the left menu instead." };
    }
    return {
      ok: true,
      id: json.id ?? null,
      needsContactEmail: !replyEmail,
      note: replyEmail
        ? "Filed. The team reads every report and replies by email."
        : "Filed, but there is no reply address on this account, so the team has no way to write back. Tell the user that plainly, and ask whether they want to add an email address for the reply. If they give you one, call submit_feedback again with the same title and contact_email set.",
    };
  } catch (err) {
    console.error("[ai-concierge] submit_feedback threw", err);
    return { error: "Could not file the report right now. Point the user at the Feedback panel in the left menu instead." };
  }
}

/**
 * Execute one agent tool call and return a JSON-serializable result. `principal`
 * is null for anonymous callers (the account tools then return an auth message).
 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  principal: Principal | null,
  client?: ClientMeta,
): Promise<unknown> {
  switch (name) {
    case "search_help": {
      const q = typeof args.query === "string" ? args.query : "";
      return { results: await searchHelp(q) };
    }
    case "start_walkthrough": {
      if (client?.surface !== "desktop") {
        return { error: "Guided walkthroughs only work in the desktop app. Give written steps instead." };
      }
      const payload = sanitizeWalkthroughArgs(args);
      if (!payload) return { error: "No usable walkthrough steps. Give written steps instead." };
      // The chat route forwards the payload to the desktop; this ack is what
      // the model narrates over.
      return { ok: true, note: "The walkthrough will start on the user's screen. Tell them to follow the Next buttons." };
    }
    case "show_video": {
      const tutorialId = typeof args.tutorialId === "string" ? args.tutorialId : "";
      const video = await resolveVideo(tutorialId);
      if (!video) {
        return { error: "No walkthrough video is available for that tutorial. Give written steps and point them to the tutorial page instead." };
      }
      // The chat route forwards the resolved video to the client as a tappable
      // card; this ack is what the model narrates over.
      return {
        ok: true,
        title: video.title,
        note: "A tappable video card will appear for the user. Mention the video in one short phrase. Do not paste the url into your text.",
      };
    }
    case "offer_booking": {
      const booking = resolveBooking(args);
      // The chat route forwards the booking signal to the client, which renders
      // the inline card and fetches live times itself; this ack is what the
      // model narrates over.
      const names = booking.callTypes.map((c) => c.label).join(" or ");
      return {
        ok: true,
        note: `An in-app booking card for ${names} will appear. Invite the user to pick a time in the card. Do not list times in your text; the card is live.`,
      };
    }
    case "submit_feedback":
      return submitFeedback(args, principal, client);
    case "offer_human_call":
      return {
        bookUrl: `${SITE}${BOOK_CALL_PATH}`,
        note: "Offer to book a human demo or support call from the dashboard under Book a Call.",
      };
    case "start_walkthrough": {
      // The walkthrough itself runs client-side in the desktop app: the chat
      // route attaches { walkthrough: { tourId } } to the reply JSON and the
      // desktop renders a Start button (voice executes it locally). This
      // result just tells the model it worked.
      const tourId = typeof args.tourId === "string" ? args.tourId : "";
      if (!tourId) return { error: "tourId is required." };
      return {
        started: true,
        tourId,
        note: "The walkthrough opens in the desktop app. Tell the user it is starting and what it will do.",
      };
    }
    case "get_subscription":
      if (!principal) return { error: "The user is not signed in." };
      return getSubscription(principal);
    case "list_features":
    case "get_pricing":
    case "get_earnings_summary": {
      const res = await callTool(name, args, principal);
      const textPart = res.content.find((c) => c.type === "text")?.text ?? "{}";
      return res.isError ? { error: textPart } : unwrapMcp(textPart);
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}
