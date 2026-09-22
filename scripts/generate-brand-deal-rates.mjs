/**
 * Generates /brand-deal-rates from public/data/brand-deal-stats.json.
 *
 * The numbers come from one creator's complete brand-deal records, 2018 to
 * 2025. Refresh the JSON (see the InfluencerButler repo,
 * scripts/marketing/build-collab-dataset.js) then re-run this to rebuild the
 * page, so the copy and the data can never drift apart.
 *
 *   node scripts/generate-brand-deal-rates.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data", "brand-deal-stats.json");
const OUT = path.join(ROOT, "public", "brand-deal-rates.html");

const stats = JSON.parse(fs.readFileSync(DATA, "utf8"));

const usd = (n) => `$${Number(n).toLocaleString("en-US")}`;
const pct = (n) => `${Math.round(n * 100)}%`;

const CATEGORY_LABELS = {
  "food-beverage": "Food and beverage",
  home: "Home and cleaning",
  "health-wellness": "Health and wellness",
  tech: "Tech and electronics",
  "baby-kids": "Baby and kids",
  "toys-games": "Toys and games",
  apparel: "Apparel and shoes",
  beauty: "Beauty and personal care",
  pet: "Pet",
  travel: "Travel and experiences",
  fitness: "Fitness",
  finance: "Finance and gift cards",
  auto: "Auto",
  other: "Everything else",
};

const { totals, coverage, acquisition, repeatBrands, pitchConversion } = stats;
const title = `What Brands Actually Pay Influencers: ${totals.deals} Real Deals (${coverage.firstYear} to ${coverage.lastYear})`;
const description =
  `Real influencer rate data from ${totals.deals} paid brand deals worth ${usd(totals.revenueUsd)} across ` +
  `${totals.brands} brands. Median rates by category, how rates changed by year, and what direct pitching pays versus agencies.`;

const categoryRows = stats.byCategory
  .map(
    (row) => `                    <tr>
                        <th scope="row">${CATEGORY_LABELS[row.category] || row.category}</th>
                        <td>${row.deals}</td>
                        <td><strong>${usd(row.medianDealUsd)}</strong></td>
                        <td>${usd(row.p25DealUsd)} to ${usd(row.p75DealUsd)}</td>
                    </tr>`,
  )
  .join("\n");

const yearRows = stats.byYear
  .map(
    (row) => `                    <tr>
                        <th scope="row">${row.year}</th>
                        <td>${row.deals}</td>
                        <td>${usd(row.revenueUsd)}</td>
                        <td><strong>${usd(row.medianDealUsd)}</strong></td>
                    </tr>`,
  )
  .join("\n");

const maxBucket = Math.max(...stats.dealSizeHistogram.map((b) => b.deals));
const BUCKET_LABELS = {
  "under-250": "Under $250",
  "250-499": "$250 to $499",
  "500-999": "$500 to $999",
  "1000-1999": "$1,000 to $1,999",
  "2000-3999": "$2,000 to $3,999",
  "4000-plus": "$4,000 and up",
};
const histogramRows = stats.dealSizeHistogram
  .map((bucket) => {
    const width = Math.round((bucket.deals / maxBucket) * 100);
    const share = Math.round((bucket.deals / totals.deals) * 100);
    return `                <li>
                    <span class="bdr-bar-label">${BUCKET_LABELS[bucket.bucket] || bucket.bucket}</span>
                    <span class="bdr-bar-track"><span class="bdr-bar-fill" style="width:${width}%"></span></span>
                    <span class="bdr-bar-value">${bucket.deals} deals (${share}%)</span>
                </li>`;
  })
  .join("\n");

const peakYear = stats.byYear.reduce((best, row) => (row.revenueUsd > best.revenueUsd ? row : best));
const latestYear = stats.byYear[stats.byYear.length - 1];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Influencer Butler</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="how much do brands pay influencers, influencer rates, brand deal rates, influencer rate card, average brand deal, sponsored post rates, influencer pricing">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://www.influencerbutler.com/brand-deal-rates">

    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://www.influencerbutler.com/brand-deal-rates">
    <meta property="og:site_name" content="Influencer Butler">
    <meta property="og:locale" content="en_US">
    <meta property="og:image" content="https://www.influencerbutler.com/assets/influencer-butler-og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="Median influencer rates by category, from ${totals.deals} real paid brand deals.">
    <meta name="twitter:image" content="https://www.influencerbutler.com/assets/influencer-butler-og-image.png">

    <meta name="theme-color" content="#f97316">
    <link rel="icon" type="image/png" href="/assets/influencer-butler-logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          "headline": ${JSON.stringify(title)},
          "description": ${JSON.stringify(description)},
          "author": { "@type": "Organization", "name": "Influencer Butler" },
          "publisher": {
            "@type": "Organization",
            "name": "Influencer Butler",
            "logo": { "@type": "ImageObject", "url": "https://www.influencerbutler.com/assets/influencer-butler-logo.png" }
          },
          "datePublished": "${stats.lastUpdated}",
          "dateModified": "${stats.lastUpdated}",
          "mainEntityOfPage": "https://www.influencerbutler.com/brand-deal-rates"
        },
        {
          "@type": "Dataset",
          "name": "Influencer brand deal rates ${coverage.firstYear} to ${coverage.lastYear}",
          "description": ${JSON.stringify(description)},
          "temporalCoverage": "${coverage.firstYear}/${coverage.lastYear}",
          "creator": { "@type": "Organization", "name": "Influencer Butler" },
          "distribution": {
            "@type": "DataDownload",
            "encodingFormat": "application/json",
            "contentUrl": "https://www.influencerbutler.com/data/brand-deal-stats.json"
          }
        }
      ]
    }
    </script>

    <style>
        .bdr-hero { padding: 72px 0 40px; background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%); }
        .bdr-hero h1 { font-size: clamp(1.9rem, 4.2vw, 3rem); line-height: 1.12; margin: 0 0 16px; max-width: 20ch; }
        .bdr-lede { font-size: 1.1rem; color: #475569; max-width: 62ch; margin: 0 0 32px; }
        .bdr-keystats { display: flex; flex-wrap: wrap; gap: 14px 36px; padding: 24px 0 0; border-top: 1px solid #fed7aa; }
        .bdr-keystat strong { display: block; font-size: clamp(1.6rem, 3.6vw, 2.4rem); font-weight: 800; color: #7c2d12; line-height: 1.05; font-variant-numeric: tabular-nums; }
        .bdr-keystat span { display: block; margin-top: 4px; font-size: 0.9rem; font-weight: 600; color: #78350f; }
        .bdr-section { padding: 48px 0; border-bottom: 1px solid #f1f5f9; }
        .bdr-section h2 { font-size: clamp(1.4rem, 2.8vw, 2rem); margin: 0 0 12px; }
        .bdr-section p { color: #475569; max-width: 68ch; }
        .bdr-table-wrap { overflow-x: auto; margin-top: 24px; }
        .bdr-table { width: 100%; border-collapse: collapse; min-width: 480px; }
        .bdr-table th, .bdr-table td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 0.95rem; }
        .bdr-table thead th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 2px solid #cbd5e1; }
        .bdr-table tbody th { font-weight: 600; color: #0f172a; }
        .bdr-table td { color: #334155; font-variant-numeric: tabular-nums; }
        .bdr-table tbody tr:hover { background: #fff7ed; }
        .bdr-bars { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 10px; }
        .bdr-bars li { display: grid; grid-template-columns: 150px 1fr 150px; align-items: center; gap: 12px; }
        .bdr-bar-label { font-size: 0.9rem; font-weight: 600; color: #0f172a; }
        .bdr-bar-track { background: #f1f5f9; border-radius: 999px; height: 14px; overflow: hidden; }
        .bdr-bar-fill { display: block; height: 100%; background: #f97316; border-radius: 999px; }
        .bdr-bar-value { font-size: 0.85rem; color: #64748b; font-variant-numeric: tabular-nums; }
        .bdr-callout { background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f97316; border-radius: 10px; padding: 20px 24px; margin-top: 24px; }
        .bdr-callout p { margin: 0; color: #7c2d12; font-weight: 500; }
        .bdr-method { background: #f8fafc; border-radius: 12px; padding: 28px 32px; }
        .bdr-method h2 { font-size: 1.15rem; }
        .bdr-method ul { color: #475569; line-height: 1.7; padding-left: 20px; max-width: 68ch; }
        .bdr-cta { padding: 56px 0; text-align: center; }
        .bdr-cta h2 { margin-bottom: 12px; }
        .bdr-cta p { margin: 0 auto 24px; }
        @media (max-width: 640px) {
            .bdr-bars li { grid-template-columns: 1fr; gap: 4px; }
            .bdr-bar-value { text-align: left; }
        }
    </style>
</head>
<body>
    <header id="site-header">
        <nav class="container">
            <a href="/" class="logo" aria-label="Influencer Butler home">
                <img src="/assets/influencer-butler-logo.png" alt="Influencer Butler logo" class="logo-img" width="40" height="40">
                <span class="logo-text">Influencer Butler</span>
            </a>
            <ul class="nav-menu" id="nav-menu">
                <li><a href="/#features" class="nav-link">Features</a></li>
                <li><a href="/#how-it-works" class="nav-link">How It Works</a></li>
                <li><a href="/pricing" class="nav-link">Pricing</a></li>
                <li><a href="/blog" class="nav-link">Blog</a></li>
                <li><a href="/download" class="nav-link">Download</a></li>
                <li><a href="/extension" class="nav-link">Extension</a></li>
                <li><a href="/tools" class="nav-link">Free Tools</a></li>
                <li><a href="/login" class="nav-link" id="auth-nav-link">Login</a></li>
            </ul>
            <a href="/go/trial" class="btn btn-primary nav-cta">Download Free</a>
            <button class="hamburger" id="hamburger" aria-label="Toggle navigation menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>
        </nav>
    </header>

    <main>
        <section class="bdr-hero">
            <div class="container">
                <h1>What brands actually pay influencers</h1>
                <p class="bdr-lede">
                    Almost every influencer rate guide is guesswork, or a survey where creators report
                    what they wish they charged. This one is not. It is every paid brand deal our founder
                    booked between ${coverage.firstYear} and ${coverage.lastYear}: ${totals.deals} campaigns,
                    ${totals.brands} brands, ${usd(totals.revenueUsd)}, taken straight from her own records.
                </p>
                <div class="bdr-keystats">
                    <div class="bdr-keystat">
                        <strong>${usd(totals.revenueUsd)}</strong>
                        <span>Paid brand deals</span>
                    </div>
                    <div class="bdr-keystat">
                        <strong>${totals.deals}</strong>
                        <span>Campaigns</span>
                    </div>
                    <div class="bdr-keystat">
                        <strong>${totals.brands}</strong>
                        <span>Brands</span>
                    </div>
                    <div class="bdr-keystat">
                        <strong>${usd(totals.medianDealUsd)}</strong>
                        <span>Median deal</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>What a typical brand deal pays</h2>
                <p>
                    The median campaign paid ${usd(totals.medianDealUsd)}. Half of all deals landed between
                    ${usd(totals.p25DealUsd)} and ${usd(totals.p75DealUsd)}. The full range ran from
                    ${usd(totals.minDealUsd)} to ${usd(totals.maxDealUsd)}, so the outliers exist in both
                    directions, but the middle is tighter than most rate guides suggest.
                </p>
                <ul class="bdr-bars">
${histogramRows}
                </ul>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>Rates by category</h2>
                <p>
                    Category matters more than almost anything else. Beauty and tech paid roughly double
                    what toys and apparel paid for comparable work. Categories with fewer than five deals
                    are left out, because a handful of campaigns is not a benchmark.
                </p>
                <div class="bdr-table-wrap">
                    <table class="bdr-table">
                        <thead>
                            <tr>
                                <th scope="col">Category</th>
                                <th scope="col">Deals</th>
                                <th scope="col">Median</th>
                                <th scope="col">Middle 50%</th>
                            </tr>
                        </thead>
                        <tbody>
${categoryRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>Pitching direct pays the same as going through an agency</h2>
                <p>
                    Of ${totals.deals} paid campaigns, ${acquisition.direct.deals} came from pitching the brand
                    directly and ${acquisition.agency.deals} came through an agency or influencer network.
                    Direct pitching produced ${usd(acquisition.direct.revenueUsd)},
                    or ${pct(acquisition.directRevenueShare)} of all revenue.
                </p>
                <p>
                    The part worth sitting with is the median. Direct deals paid
                    ${usd(acquisition.direct.medianDealUsd)}. Agency deals paid
                    ${usd(acquisition.agency.medianDealUsd)}. The rates were the same either way, so whatever
                    the agency took came out of the creator's side, not the brand's budget.
                </p>
                <div class="bdr-callout">
                    <p>
                        Pitching yourself did not pay less. It just meant nobody else was taking a cut of it.
                    </p>
                </div>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>The real money is in the second deal</h2>
                <p>
                    ${repeatBrands.brands} brands booked more than once. That is
                    ${pct(repeatBrands.brandShare)} of all brands, and they produced
                    ${usd(repeatBrands.revenueUsd)}, or ${pct(repeatBrands.revenueShare)} of total revenue.
                </p>
                <p>
                    A brand that already paid you once is the cheapest deal you will ever land. That is the
                    whole argument for tracking relationships instead of blasting a list: most creators lose
                    a repeat booking simply because nobody followed up at the right moment.
                </p>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>How rates moved from ${coverage.firstYear} to ${coverage.lastYear}</h2>
                <p>
                    Rates climbed through ${peakYear.year}, which was the strongest year at
                    ${usd(peakYear.revenueUsd)} across ${peakYear.deals} deals, then softened. By
                    ${latestYear.year} the median campaign had dropped to ${usd(latestYear.medianDealUsd)}.
                    Volume matters more than it used to.
                </p>
                <div class="bdr-table-wrap">
                    <table class="bdr-table">
                        <thead>
                            <tr>
                                <th scope="col">Year</th>
                                <th scope="col">Deals</th>
                                <th scope="col">Total paid</th>
                                <th scope="col">Median deal</th>
                            </tr>
                        </thead>
                        <tbody>
${yearRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <h2>How many brands you have to pitch</h2>
                <p>
                    ${pitchConversion.brandsPitched} brands were pitched over this period. At least
                    ${pitchConversion.brandsWon} of them turned into paid work, which is a floor of about
                    ${pct(pitchConversion.rateFloor)}.
                </p>
                <p>
                    Treat that as a floor rather than a conversion rate. The outcome of most pitches was
                    never written down, so the true number is higher. Even at the floor, the shape of the
                    job is clear: landing roughly ten paid brand deals a year means putting a pitch in
                    front of a few hundred brands, which is the part nobody wants to do by hand.
                </p>
            </div>
        </section>

        <section class="bdr-section">
            <div class="container">
                <div class="bdr-method">
                    <h2>How this data was put together</h2>
                    <ul>
                        <li>Every figure comes from one creator's own campaign records, ${coverage.firstYear} to ${coverage.lastYear}. Nothing is modelled, surveyed, or estimated.</li>
                        <li>Only campaigns that were actually paid in cash are counted. Gifted product, unpaid exchanges, and invoices that were never settled are excluded.</li>
                        <li>Figures are per campaign, not per post. A campaign may include several deliverables across Instagram, TikTok, and YouTube.</li>
                        <li>No brand is named next to a fee anywhere on this page or in the underlying data. Rates appear only as category aggregates covering many brands.</li>
                        <li>This is one creator in the family, home, and lifestyle space. Your category, audience size, and market will move these numbers.</li>
                        <li>The underlying aggregate data is published at <a href="/data/brand-deal-stats.json">/data/brand-deal-stats.json</a>. Last updated ${stats.lastUpdated}.</li>
                    </ul>
                </div>
            </div>
        </section>

        <section class="bdr-cta">
            <div class="container">
                <h2>The pitching is the job. Let the butler do it.</h2>
                <p class="bdr-lede" style="margin-left:auto;margin-right:auto;">
                    Influencer Butler finds brands worth pitching, writes and sends the outreach, tracks every
                    reply, and reminds you to follow up before a warm brand goes cold.
                </p>
                <a href="/go/trial" class="btn btn-primary btn-lg">Download Free</a>
            </div>
        </section>
    </main>

    <footer id="site-footer">
        <div class="container footer-grid">
            <div class="footer-brand">
                <a href="/" class="logo">
                    <img src="/assets/influencer-butler-logo.png" alt="Influencer Butler logo" class="logo-img" width="40" height="40">
                    <span class="logo-text">Influencer Butler</span>
                </a>
                <p>The desktop butler for Amazon, Instagram, and brand deal creators.</p>
            </div>
            <div class="footer-links">
                <h4>Product</h4>
                <a href="/#features">Features</a>
                <a href="/pricing">Pricing</a>
                <a href="/#how-it-works">How It Works</a>
                <a href="/affiliates">Affiliates - Earn 30%</a>
                <a href="/download">Download the App</a>
                <a href="/extension">Chrome Extension: Free</a>
                <a href="/tools">Free Tools</a>
            </div>
            <div class="footer-links">
                <h4>Legal</h4>
                <a href="/legal/privacy">Privacy Policy</a>
                <a href="/legal/eula">EULA</a>
                <a href="/legal/terms">Terms of Service</a>
            </div>
            <div class="footer-links">
                <h4>Support</h4>
                <a href="/contact">Contact Us</a>
                <a href="/dashboard">My Account</a>
            </div>
        </div>
        <div class="container footer-bottom">
            <p>&copy; 2026 The Social Media Posse LLC. All rights reserved.</p>
        </div>
    </footer>

    <script src="/js/main.js"></script>
    <script src="/js/activity-widget.js" defer></script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${totals.deals} deals, ${usd(totals.revenueUsd)}, ${stats.byCategory.length} categories`);
