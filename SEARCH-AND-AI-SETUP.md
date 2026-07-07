# Search + AI discoverability: setup checklist

Practical, do-it-yourself steps to (1) see your search traffic and the terms people
use, and (2) get Influencer Butler picked up and recommended by AI tools. Pairs with
the code shipped alongside this file and the broader [SEO-action-plan.md](SEO-action-plan.md).

The short version: seeing search terms needs Google Search Console (free). Getting
recommended by AI is won mostly OFF your site (being cited across many independent
sites) plus being indexed in Bing. The on-site pieces below are already done; the rest
is account setup and outreach only you can do.

## 1. Google Search Console (this is how you see search terms)

Google Analytics shows how many people came from search, but NOT what they searched.
Search Console does. It is free.

1. Go to search.google.com/search-console and add your site. Choose the "Domain"
   property (`influencerbutler.com`) if you can add a DNS record, otherwise the "URL
   prefix" property (`https://www.influencerbutler.com/`).
2. Verify ownership:
   - Easiest with our code: use the "HTML tag" method. Copy the code Google gives you
     and paste it into `public/index.html`, replacing `PASTE_GOOGLE_SEARCH_CONSOLE_CODE`
     in the `google-site-verification` meta tag, then deploy. Click Verify.
   - Or DNS: add the TXT record Google gives you at your domain registrar. No deploy needed.
3. In Search Console, open Sitemaps and submit `sitemap.xml`.
4. Open URL Inspection, paste your homepage URL, and click Request Indexing. Repeat for
   your top few feature pages, the new `/best-amazon-influencer-tools` guide, and the
   `/course/amazon-influencer` course. This can get you indexed in days instead of weeks.
5. To make the terms appear inside your own admin Growth dashboard: in Search Console,
   Settings > Users and permissions, add the SAME service-account email you used for
   Google Analytics (Restricted access is enough). Then enable the "Google Search Console
   API" in the Google Cloud project, and set `GSC_SITE_URL` in Vercel (for example
   `sc-domain:influencerbutler.com` or `https://www.influencerbutler.com/`). Redeploy.
   The "Search terms" panel on /dashboard/admin/growth fills within an hour.

Where to read terms: Search Console > Performance shows every query, its impressions,
clicks, click-through rate, and average position. That is your keyword report.

## 2. Bing Webmaster Tools (this feeds ChatGPT and Copilot)

ChatGPT search and Microsoft Copilot pull heavily from Bing, so being in Bing's index
matters for AI answers.

1. Go to bing.com/webmasters. You can import your site straight from Google Search
   Console in one click (fastest), or verify separately by pasting the code into the
   `msvalidate.01` meta tag in `public/index.html` (replace `PASTE_BING_WEBMASTER_CODE`).
2. Submit `sitemap.xml`.

## 3. Get cited by AI (the off-site work that actually moves it)

AI tools recommend products they have seen described and reviewed across many
independent, credible sites. One mention on your own site does little; ten mentions
elsewhere do a lot. Priorities, easiest first (all free):

- List the product on directories: Product Hunt (a launch), AlternativeTo, SaaSHub,
  G2, Capterra, and There's An AI For That. These rank in search AND are exactly the
  kinds of pages AI quotes when asked "best Amazon influencer tools."
- Get onto existing "best Amazon influencer tools" roundup articles: email the authors
  and ask to be included; offer a free account and your 30% affiliate cut.
- Be genuinely helpful in the communities where the audience lives (Amazon-influencer
  subreddits, the big Facebook groups). Reddit threads are frequent AI sources. Read
  each group's self-promo rules first.
- Use your affiliate program as a link engine: creators and bloggers who review the
  tool create the third-party citations AI relies on.

Rule of thumb: off-site presence + Bing indexing is roughly 80% of whether AI
recommends you. The on-site work below is the other 20%, and it is already done.

## 4. What is already handled on-site (no action needed)

- robots.txt allows the major AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
  OAI-SearchBot, Google-Extended and more) with `ai-input=yes`, and now lets them read
  `/pricing` too.
- Structured data (Organization, SoftwareApplication, FAQ) is on the homepage and
  feature pages; the new guide page adds Article + FAQ markup.
- `llms.txt` gives AI a clean, factual summary of what the product is and costs.
- A name-free "best Amazon influencer tools" guide at `/best-amazon-influencer-tools`
  is the quotable, comparison-style page AI and Google both favor. (Per the competitor
  naming policy, it does not name competitors.)
- The sitemap includes all of the above.
