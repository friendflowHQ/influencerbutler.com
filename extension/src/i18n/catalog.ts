// Translation catalog for every user-facing string in the extension: the
// popup and all the in-page panels. Brand and feature names (Influencer
// Butler, Butler Approved, Orders Butler, Content Butler, Daily Deals, Creator
// Connections, SPCC, SiteStripe) stay in English on purpose, exactly like the
// tutorials; only the surrounding copy is translated.
//
// Values are strings, or functions when a string interpolates a count or name.
// The Dict interface forces every locale to define every key, so a missing
// translation is a compile error, not a silent English fallback at runtime.

export interface Dict {
  // Shared panel chrome
  panelChevronHide: string;
  panelChevronShow: string;
  panelSettings: string;
  copy: string;
  copied: string;

  // Product snapshot card
  snapshotTitle: string;
  snapshotProduct: string;
  snapshotParent: string;
  snapshotCategory: (category: string) => string;
  snapshotRank: (rank: number, category: string) => string;
  snapshotCommissionLive: (pct: number) => string;
  snapshotCommissionCategory: (pct: number, category: string) => string;
  snapshotCommissionDefault: (pct: number) => string;
  snapshotCommissionNotSet: string;
  earningsTitle: string;
  earningsAmount: (amount: string, count: number) => string;
  earningsNote: string;
  priceHistoryTitle: string;
  priceHistoryNow: (amount: string) => string;
  priceHistoryLow: (amount: string) => string;
  priceHistoryLowest: string;
  priceHistoryNote: string;

  // Popup: static chrome
  tagFree: string;
  thisPageHeading: string;
  checkingTab: string;
  accountHeading: string;
  signedOutBlurb: string;
  licensePlaceholder: string;
  connect: string;
  noKeyYet: string;
  startFreeTrial: string;
  connectedAs: string;
  syncToggleLabel: string;
  disconnect: string;
  settingsHeading: string;
  languageLabel: string;
  langAuto: string;
  commissionRateLabel: string;
  hourlyValueLabel: string;
  minutesPerVideoLabel: string;
  contentGapThresholdLabel: string;
  storefrontHandleLabel: string;
  storefrontHandlePlaceholder: string;
  toolsHeading: string;
  toolVideoCounts: string;
  toolApproved: string;
  toolCalculator: string;
  toolStorefront: string;
  toolOrdersButler: string;
  toolSearchOverlay: string;
  toolCampaignMatcher: string;
  toolWatchlist: string;
  feedbackHeading: string;
  feedbackBlurb: string;
  feedbackTypeLabel: string;
  feedbackTypeBug: string;
  feedbackTypeFeature: string;
  feedbackTypePraise: string;
  feedbackTypeOther: string;
  feedbackPlaceholder: string;
  feedbackSend: string;
  footerHelp: string;
  footerDashboard: string;

  // Popup: dynamic status
  openAmazonToStart: string;
  noToolsOnPage: string;
  productToolsActive: string;
  orderScanReady: string;
  storefrontCheckupReady: string;
  uploadHelperReady: string;
  reloadTabToActivate: string;
  connectedFallback: string;
  findingsWaiting: (n: number) => string;
  lastSynced: (time: string) => string;
  nothingToSync: string;
  licenseDidNotVerify: string;
  feedbackAddDetail: string;
  feedbackSending: string;
  feedbackThanks: string;
  feedbackFailed: string;

  // Content: tool summaries (popup "This page" list)
  sumVideos: string;
  sumVideosValue: (total: number, influencer: number) => string;
  sumApproved: string;
  yes: string;
  no: string;
  sumOrderScan: string;
  ready: string;
  sumStorefrontCheckup: string;
  sumUploadHelper: string;

  // Creator Hub upload helper panel
  uploadHelperTitle: string;
  uhTaggedProducts: (n: number) => string;
  uhCheckAvailability: string;
  uhCheckingAvailability: (done: number, total: number) => string;
  uhInStock: string;
  uhUnavailable: string;
  uhUnknownAvail: string;
  uhCheckDuplicate: string;
  uhCheckingDuplicate: string;
  uhCheckingDuplicateProgress: (n: number) => string;
  uhDuplicateFound: string;
  uhNoDuplicate: string;
  uhNoHandle: string;
  uhCheckFailed: string;
  uhSubmitClose: string;
  uhAutoSubmit: string;
  uhAutoSubmitNote: string;
  uhSubmitting: string;
  uhSubmitted: string;
  uhNotReady: string;
  uhSubmitMissing: string;
  uhWatching: string;
  uhWatchTimeout: string;
  uhStop: string;
  uhStopped: string;

  // Video competition panel
  videoCompetition: string;
  noCarousel: string;
  noVideosYet: string;
  videosPending: (total: number) => string;
  chipInfluencer: (n: number) => string;
  chipBrand: (n: number) => string;
  chipCustomer: (n: number) => string;
  chipUnclassified: (n: number) => string;
  videosTotalVia: (total: number, viaPageData: boolean) => string;
  influencerFallback: string;
  influencerVideosLabel: (n: number) => string;
  influencerVideosMore: (n: number) => string;

  // Video competition: Deep Scan (harvest every video)
  deepScan: string;
  deepScanIntro: string;
  deepScanRunning: (videos: number, pages: number) => string;
  deepScanStop: string;
  deepScanRescan: string;
  deepScanDone: (classified: number, total: number) => string;
  deepScanPartial: string;
  deepScanNoEndpoint: string;
  deepScanStopped: string;
  upperCarousel: string;
  lowerCarousel: string;
  estTotalVideos: (n: number) => string;
  allVideosLabel: (n: number) => string;
  videoNoTitle: string;
  videoExportCsv: string;
  copySummary: string;
  shareSummaryHeading: string;
  shareTopCreators: string;

  // Butler Approved panel
  butlerApproved: string;
  approvedYes: string;
  approvedNo: string;
  approvedReasonPass: string;
  approvedReasonFail: (checks: string) => string;
  approvedReasonUnknown: (checks: string) => string;
  approvedCriteriaNote: string;
  critBought: (n: number) => string;
  critOpenSlot: (n: number) => string;
  critInStock: string;
  critPriceFloor: (n: number) => string;

  // Butler Score panel
  butlerScore: string;
  butlerScoreIntro: string;
  scoreBandLabel: (band: "hot" | "warm" | "cool") => string;
  scoreOutOf: string;
  scorePartCommission: string;
  scorePartSlot: string;
  scorePartDemand: string;
  scorePartAvailability: string;
  scorePartPrice: string;
  scorePartCampaign: string;
  sumScore: string;

  // Search-results overlay
  sumSearchOverlay: string;
  searchCount: (n: number) => string;
  searchSortLabel: string;
  sortScore: string;
  sortCommission: string;
  sortPriceAsc: string;
  sortPriceDesc: string;
  sortRelevance: string;
  searchCampaignOnly: string;
  searchMinPrice: string;
  searchScan: string;
  searchScanStop: string;
  searchScanning: (done: number, total: number) => string;
  searchScanDone: (n: number) => string;
  searchScanMore: (done: number, remaining: number) => string;
  tileCommission: (amount: string) => string;
  tileCampaign: string;
  tileProvenEarner: string;
  tileInfluencer: (n: number) => string;
  searchOverlayActive: string;

  // Calculator panel
  breakEvenMath: string;
  noPriceForMath: string;
  calcIntro: string;
  commissionFromSiteStripe: (pct: number) => string;
  commissionFromRateCard: (pct: number, category: string) => string;
  commissionFromRateCardDefault: (pct: number) => string;
  fieldCommissionRate: string;
  fieldHourlyRate: string;
  fieldMinutesFilmEdit: string;
  fieldViewsPerMonth: string;
  calcEstimatesNote: string;
  kvCommissionPerSale: string;
  kvTimeToFilm: (minutes: number, hourly: string) => string;
  kvSalesToEarnBack: string;
  kvViewsForSales: string;
  kvProfitPerMonth: string;
  notApplicable: string;
  bePurchasedHeading: string;
  bePurchasedNote: string;
  beTimeHeading: string;
  beTimeNote: string;
  beAdjustAssumptions: string;
  kvPurchasePrice: string;
  kvTotalToEarnBack: string;

  // Storefront checkup panel
  storefrontCheckup: string;
  sfFastScanNote: string;
  sfDeepContent: string;
  sfCheckAvailability: string;
  sfParentAsins: string;
  sfCreatorApiEnrich: string;
  sfEnrichingProducts: (done: number, total: number) => string;
  sfCreatorApiNote: string;
  sfCreatorApiLocked: string;
  sfCheckButton: string;
  sfStop: string;
  sfRescan: string;
  sfScanningFeed: string;
  sfScanningProgress: (items: number, pages: number) => string;
  sfOpeningPhotos: (done: number, total: number) => string;
  sfOpeningProducts: (done: number, total: number) => string;
  sfEtaMinLeft: (min: number) => string;
  sfCheckedFirst: (cap: number) => string;
  sfScanFailed: string;
  sfStopped: string;
  sfDone: (items: number, pages: number, capped: boolean) => string;
  sfLabelVideos: string;
  sfLabelPhotos: string;
  sfLabelIdeaLists: string;
  sfLabelMediaLists: string;
  chipUntagged: (n: number) => string;
  chipOverTagged: (n: number) => string;
  sfUniqueProducts: (n: number) => string;
  sfUnavailable: (n: number) => string;
  sfNoTaggedEarns: string;
  sfUnavailableProduct: (asin: string) => string;
  sfTaggedUnavailable: string;
  sfUntaggedHeading: (n: number) => string;
  sfOverTaggedHeading: (n: number) => string;
  sfUnavailableHeading: (n: number) => string;
  sfOverTaggedCount: (n: number) => string;
  sfOverTaggedDetail: string;
  sfAndMore: (n: number) => string;
  sfNoIssues: string;
  sfExportCsv: string;
  sfOpen: string;

  // Order-history content-gap panel
  contentGapsHeading: string;
  contentGapsIntro: (n: number) => string;
  scanTheseOrders: (n: number) => string;
  checkingOrder: (i: number, n: number) => string;
  gapNoVideos: string;
  gapNoCarousel: string;
  gapNoInfluencer: string;
  gapFewInfluencer: (n: number) => string;
  openProduct: string;
  badgeNoVideos: string;
  badgeNoCarousel: string;
  badgePending: (n: number) => string;
  badgeNoInfluencer: string;
  badgeInfluencerVideos: (n: number) => string;
  rescan: string;
  scanStopped: string;
  gapsFound: (n: number) => string;
  noGaps: string;
  gapCheckNext: (next: number, remaining: number) => string;
  gapFilterNoCc: string;
  gapFilterNoCarousel: string;
  gapExportCsv: string;

  // Orders Butler harvester panel
  ordersButler: string;
  ordersButlerIntro: string;
  scopeLabel: string;
  scopeNew: string;
  scopeAll: string;
  syncMyOrders: string;
  syncAgain: string;
  reauthPrompt: string;
  resume: string;
  waitingForSignin: string;
  harvestReading: (year: number, page: number, orders: number) => string;
  harvestStopped: (items: number, orders: number) => string;
  harvestUpToDate: (items: number, orders: number) => string;
  harvestDone: (items: number, orders: number) => string;
  harvestNoOrders: string;
  dateUnknown: string;
  plusMore: (n: number) => string;

  // Orders Butler: update influencer video counts for ordered products
  updateVideoCounts: string;
  updateVideoCountsIntro: string;
  updateVideoCountsAgain: string;
  countPreparing: string;
  countChecking: (index: number, total: number, title: string) => string;
  countDone: (updated: number, noInfluencer: number) => string;
  countStopped: (updated: number) => string;
  countNoOrders: string;
  countNoInfluencer: string;
  countInfluencerN: (n: number) => string;
  countPending: string;

  // Campaigns panel
  campaigns: string;
  noCampaign: string;
  ccAvailable: string;
  spccAvailable: string;
  campaignAcceptNote: string;
  dealAvailable: string;
  dealPushNote: string;

  // Campaign matcher panel
  campaignMatcher: string;
  campaignMatcherIntro: (source: "storefront" | "orders") => string;
  campaignMatcherScan: string;
  campaignMatcherRescan: string;
  campaignMatcherScanning: string;
  campaignMatcherHarvesting: (n: number) => string;
  campaignMatcherFailed: string;
  campaignMatcherNoProducts: string;
  campaignMatcherNoCatalogue: string;
  campaignMatcherSignIn: string;
  campaignMatcherNone: string;
  campaignMatcherDone: (matches: number, total: number) => string;
  campaignMatcherAcceptedNote: string;
  campaignMatcherAcceptAll: (n: number) => string;
  campaignMatcherUpsell: string;
  sumCampaignMatcher: string;

  // Send to app (HUD) panel
  sendToApp: string;
  pushToDailyDeals: string;
  sendToContentButler: string;
  acceptCc: string;
  acceptSpcc: string;
  addToCollab: string;
  addingCollab: string;
  pushingDeals: string;
  sendingContent: string;
  checkingCc: string;
  checkingSpcc: string;
  sentToApp: string;
  couldNotReachApp: string;
  connectedToApp: (version: string) => string;
  upsellSignedIn: string;
  upsellSignedOut: string;
  ctaOpenApp: string;
  ctaStartTrial: string;
  toolsAlwaysFree: string;

  // Desktop-app hand-offs: storefront -> Retag Butler + batch campaign accept,
  // orders -> Content Butler planner, and the popup pairing flow.
  sfSendToRetag: (n: number) => string;
  sfSendingToRetag: string;
  sfAcceptAllCampaigns: (n: number) => string;
  sfAcceptingCampaigns: string;
  obSendToContentButler: (n: number) => string;
  obSendingToContentButler: string;
  obSentToContentButler: (n: number) => string;
  appBridgeHeading: string;
  appBridgeBlurb: string;
  appConnect: string;
  appEnterCode: string;
  appCodePlaceholder: string;
  appPairSubmit: string;
  appConnected: string;
  appUnpair: string;
  appRequestingCode: string;
  appCodeShown: string;
  appNotRunning: string;
  appCodeInvalid: string;
  appPairing: string;
  appPaired: string;
  appPairFailed: string;

  // Re-engagement nudges (day-1 Facebook group, day-3 free desktop app).
  // Shown both as an OS notification and as an in-page modal.
  nudgeCloseLabel: string;
  nudgeMaybeLater: string;
  nudgeFbNotifTitle: string;
  nudgeFbNotifBody: string;
  nudgeFbTitle: string;
  nudgeFbBody: string;
  nudgeFbJoin: string;
  nudgeAppNotifTitle: string;
  nudgeAppNotifBody: string;
  nudgeAppTitle: string;
  nudgeAppBody: string;
  nudgeAppFree: string;
  nudgeAppDownloadWindows: string;
  nudgeAppDownloadMac: string;
  nudgeAppDownloadGeneric: string;
  nudgeAppIntelMac: string;

  // ASIN watchlist (product-page button, search-tile star, popup list).
  watchlist: string;
  watchlistIntro: string;
  watchAdd: string;
  watchRemove: string;
  watchAdded: string;
  watchRemoved: string;
  watchAtCap: (n: number) => string;
  watchStar: string;
  watchOn: string;
  watchAddShort: string;
  watchNotifTitle: string;
  watchNotifBackInStock: (name: string) => string;
  watchNotifSlotOpens: (name: string, videos: number) => string;
  watchNotifPriceDrop: (name: string) => string;
  popupWatchlistHeading: string;
  popupWatchlistEmpty: string;
  watchCondBackInStock: string;
  watchCondSlotOpens: string;
  watchCondPriceDrop: string;
  watchRemoveShort: string;
}

const en: Dict = {
  panelChevronHide: "hide",
  panelChevronShow: "show",
  panelSettings: "Settings",
  copy: "Copy",
  copied: "Copied",

  snapshotTitle: "Product snapshot",
  snapshotProduct: "Product",
  snapshotParent: "Parent",
  snapshotCategory: (category) => `Category: ${category}`,
  snapshotRank: (rank, category) => `#${rank} in ${category}`,
  snapshotCommissionLive: (pct) => `Commission ${pct}% (live from SiteStripe)`,
  snapshotCommissionCategory: (pct, category) =>
    `Commission about ${pct}% (${category}, rate card)`,
  snapshotCommissionDefault: (pct) => `Commission about ${pct}% (all-other-categories rate)`,
  snapshotCommissionNotSet: "No commission rate set",
  earningsTitle: "Your earnings",
  earningsAmount: (amount, count) => `${amount} earned from ${count} order${count === 1 ? "" : "s"}`,
  earningsNote: "You have already earned here. Find more products like the ones already paying you.",
  priceHistoryTitle: "Price history",
  priceHistoryNow: (amount) => `Now ${amount}`,
  priceHistoryLow: (amount) => `Low ${amount}`,
  priceHistoryLowest: "Lowest yet",
  priceHistoryNote: "Prices seen since you started browsing with the extension.",

  tagFree: "Free",
  thisPageHeading: "This page",
  checkingTab: "Checking the current tab...",
  accountHeading: "Account",
  signedOutBlurb:
    "Everything works without an account. Connect your Influencer Butler license key to sync findings to your dashboard and the desktop app.",
  licensePlaceholder: "License key",
  connect: "Connect",
  noKeyYet: "No key yet?",
  startFreeTrial: "Start a free trial",
  connectedAs: "Connected as",
  syncToggleLabel: "Sync findings to my dashboard",
  disconnect: "Disconnect",
  settingsHeading: "Settings",
  languageLabel: "Language",
  langAuto: "Auto (browser)",
  commissionRateLabel: "Commission rate (%)",
  hourlyValueLabel: "Hourly value ($)",
  minutesPerVideoLabel: "Minutes per video",
  contentGapThresholdLabel: "Content gap threshold",
  storefrontHandleLabel: "My storefront handle",
  storefrontHandlePlaceholder: "e.g. influencerbutler",
  toolsHeading: "Tools",
  toolVideoCounts: "Video counts",
  toolApproved: "Butler Approved seal",
  toolCalculator: "Profit calculator",
  toolStorefront: "Storefront checks",
  toolOrdersButler: "Orders Butler (sync order history)",
  toolSearchOverlay: "Search results overlay",
  toolCampaignMatcher: "Campaign matcher",
  toolWatchlist: "Watchlist alerts",
  feedbackHeading: "Feedback Butler",
  feedbackBlurb: "Found a bug or want a feature? Tell us. No account needed.",
  feedbackTypeLabel: "Type",
  feedbackTypeBug: "Bug report",
  feedbackTypeFeature: "Feature request",
  feedbackTypePraise: "Praise",
  feedbackTypeOther: "Something else",
  feedbackPlaceholder: "What happened, or what would help?",
  feedbackSend: "Send feedback",
  footerHelp: "Help",
  footerDashboard: "My dashboard",

  openAmazonToStart: "Open an Amazon product page, your orders, or your storefront to get started.",
  noToolsOnPage: "This Amazon page has no butler tools. Try a product page.",
  productToolsActive: "Product page tools are active.",
  orderScanReady: "Order history scan is ready.",
  storefrontCheckupReady: "Storefront checkup is ready.",
  uploadHelperReady: "Upload helper is ready.",
  reloadTabToActivate: "Reload the Amazon tab to activate the tools (the page was open before install).",
  connectedFallback: "connected",
  findingsWaiting: (n) => `${n} findings waiting to sync`,
  lastSynced: (time) => `Last synced ${time}`,
  nothingToSync: "Nothing to sync yet",
  licenseDidNotVerify: "That license key did not verify. Check it and try again.",
  feedbackAddDetail: "Add a little more detail.",
  feedbackSending: "Sending...",
  feedbackThanks: "Thanks! Sent.",
  feedbackFailed: "Could not send. Try again.",

  sumVideos: "Videos",
  sumVideosValue: (total, influencer) => `${total} total, ${influencer} influencer`,
  sumApproved: "Butler Approved",
  yes: "Yes",
  no: "No",
  sumOrderScan: "Order scan",
  ready: "Ready",
  sumStorefrontCheckup: "Storefront checkup",
  sumUploadHelper: "Upload helper",

  uploadHelperTitle: "Upload helper",
  uhTaggedProducts: (n) => `${n} tagged ${n === 1 ? "product" : "products"}`,
  uhCheckAvailability: "Check availability (US, CA, UK)",
  uhCheckingAvailability: (done, total) => `Checking ${done} of ${total}...`,
  uhInStock: "in stock",
  uhUnavailable: "unavailable",
  uhUnknownAvail: "?",
  uhCheckDuplicate: "Check for a duplicate video",
  uhCheckingDuplicate: "Scanning your storefront videos...",
  uhCheckingDuplicateProgress: (n) => `Scanned ${n} items...`,
  uhDuplicateFound: "A video with this title is already on your storefront.",
  uhNoDuplicate: "No storefront video has this title. Looks new.",
  uhNoHandle: "Could not read your storefront handle from this page.",
  uhCheckFailed: "Could not complete the check.",
  uhSubmitClose: "Submit and close",
  uhAutoSubmit: "Auto-submit when the video is ready",
  uhAutoSubmitNote:
    "Submits this video and returns to your video list. Auto-submit only fires once Amazon marks the video ready.",
  uhSubmitting: "Submitting...",
  uhSubmitted: "Submitted. Returning to your videos...",
  uhNotReady: "Not ready yet: Amazon has not finished processing the video.",
  uhSubmitMissing: "Could not find the Submit button on this page.",
  uhWatching: "Waiting for the video to be ready...",
  uhWatchTimeout: "Gave up waiting for the video to be ready.",
  uhStop: "Stop",
  uhStopped: "Stopped.",

  videoCompetition: "Video competition",
  noCarousel:
    "No upper carousel: Amazon has not given this product a slot for influencer videos, so a video here will not show on the listing.",
  noVideosYet: "No videos yet: wide-open opportunity.",
  videosPending: (total) =>
    `${total} videos on this product. Scroll to the Product Videos section and the influencer / brand / customer breakdown fills in here automatically.`,
  chipInfluencer: (n) => `${n} influencer`,
  chipBrand: (n) => `${n} brand`,
  chipCustomer: (n) => `${n} customer`,
  chipUnclassified: (n) => `${n} unclassified`,
  videosTotalVia: (total, viaPageData) =>
    `${total} videos total (read via ${viaPageData ? "page data" : "carousel"})`,
  influencerFallback: "Influencer",
  influencerVideosLabel: (n) => `Influencer videos (${n})`,
  influencerVideosMore: (n) => `+${n} more`,

  deepScan: "Deep Scan: harvest every video",
  deepScanIntro:
    "Amazon only loads a handful of videos on screen. Deep Scan pages through the widget's own feed to classify every video it will serve, split by upper (brand hero) and lower (related) carousel.",
  deepScanRunning: (videos, pages) => `Harvesting: ${videos} videos over ${pages} pages...`,
  deepScanStop: "Stop",
  deepScanRescan: "Run Deep Scan again",
  deepScanDone: (classified, total) => `Classified ${classified} of ${total} videos.`,
  deepScanPartial:
    "Amazon served only part of the list, so this is a floor, not the full set.",
  deepScanNoEndpoint:
    "Scroll the Product Videos section into view once, then run Deep Scan so it can find the video feed.",
  deepScanStopped: "Deep Scan stopped.",
  upperCarousel: "Upper carousel (brand hero)",
  lowerCarousel: "Lower carousel (related)",
  estTotalVideos: (n) => `Est. total videos: ${n}`,
  allVideosLabel: (n) => `All harvested videos (${n})`,
  videoNoTitle: "Untitled video",
  videoExportCsv: "Export videos (CSV)",
  copySummary: "Copy summary",
  shareSummaryHeading: "Product video competition (via Influencer Butler)",
  shareTopCreators: "Top creators:",

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: worth making content for",
  approvedNo: "Not Butler Approved yet",
  approvedReasonPass: "Every check below passes, so this product is worth making content for.",
  approvedReasonFail: (checks) => `Not approved yet: these checks did not pass - ${checks}.`,
  approvedReasonUnknown: (checks) => `Could not read from this page: ${checks}.`,
  approvedCriteriaNote: "Criteria read from this page. Tune thresholds in the extension popup.",
  critBought: (n) => `${n}+ bought in past month`,
  critOpenSlot: (n) => `Fewer than ${n} influencer videos`,
  critInStock: "In stock",
  critPriceFloor: (n) => `Price at least $${n}`,

  butlerScore: "Butler Score",
  butlerScoreIntro:
    "A 0-100 read on how worth-it this product is: commission per sale, an open video slot, demand, stock, and campaign eligibility rolled into one number.",
  scoreBandLabel: (band) =>
    band === "hot" ? "Hot pick" : band === "warm" ? "Worth a look" : "Low priority",
  scoreOutOf: "out of 100",
  scorePartCommission: "Commission",
  scorePartSlot: "Open slot",
  scorePartDemand: "Demand",
  scorePartAvailability: "In stock",
  scorePartPrice: "Price",
  scorePartCampaign: "Campaign",
  sumScore: "Butler Score",

  sumSearchOverlay: "Search overlay",
  searchCount: (n) => `${n} products scored`,
  searchSortLabel: "Sort:",
  sortScore: "Best Butler Score",
  sortCommission: "Highest commission",
  sortPriceAsc: "Price: low to high",
  sortPriceDesc: "Price: high to low",
  sortRelevance: "Amazon relevance",
  searchCampaignOnly: "Campaign-eligible only",
  searchMinPrice: "Min price",
  searchScan: "Scan videos on this page",
  searchScanStop: "Stop",
  searchScanning: (done, total) => `Scanning ${done} of ${total}...`,
  searchScanDone: (n) => `Scanned ${n} products.`,
  searchScanMore: (done, remaining) => `Scanned ${done}. Click Scan again for ${remaining} more.`,
  tileCommission: (amount) => `${amount}/sale`,
  tileCampaign: "Campaign",
  tileProvenEarner: "Proven earner",
  tileInfluencer: (n) => `${n} infl. videos`,
  searchOverlayActive: "Search overlay is active.",

  breakEvenMath: "Break-even math",
  noPriceForMath: "No price found on this page, so no math to run.",
  calcIntro:
    "How many sales pay back the time you spend filming one video. This assumes the product is free (Creator Connections) or you already own it, not that you buy it.",
  commissionFromSiteStripe: (pct) => `Commission rate ${pct}% read live from your SiteStripe bar.`,
  commissionFromRateCard: (pct, category) =>
    `Using ${pct}% for "${category}" from the Amazon Associates rate card.`,
  commissionFromRateCardDefault: (pct) =>
    `Using the ${pct}% all-other-categories rate from the Amazon Associates rate card.`,
  fieldCommissionRate: "Commission rate (%)",
  fieldHourlyRate: "Your hourly rate ($)",
  fieldMinutesFilmEdit: "Minutes to film + edit",
  fieldViewsPerMonth: "Est. views per month",
  calcEstimatesNote:
    "Estimates only. Monthly profit assumes the carousel splits views evenly across influencer videos.",
  kvCommissionPerSale: "Commission per sale",
  kvTimeToFilm: (minutes, hourly) => `Your time to film (${minutes} min @ ${hourly}/hr)`,
  kvSalesToEarnBack: "Sales to earn that back",
  kvViewsForSales: "Views for those sales",
  kvProfitPerMonth: "Est. profit per month",
  notApplicable: "n/a",
  bePurchasedHeading: "Break-even if purchased",
  bePurchasedNote:
    "If you buy the product yourself, this is what it takes to earn back the purchase price plus your filming time.",
  beTimeHeading: "Break-even time investment",
  beTimeNote:
    "Assumes the product is free (a Creator Connections gift or one you already own): how many sales earn back just your filming time.",
  beAdjustAssumptions: "Adjust assumptions",
  kvPurchasePrice: "Purchase price",
  kvTotalToEarnBack: "Time + purchase to earn back",

  storefrontCheckup: "Storefront checkup",
  sfFastScanNote:
    "Fast scan of your whole storefront through Amazon's own feed: no scrolling, no images loaded. The boxes below add slower deep checks that open each item.",
  sfDeepContent: "Also scan photo and list product tags",
  sfCheckAvailability: "Check product availability (opens each product)",
  sfParentAsins: "Resolve parent ASINs (opens each product)",
  sfCreatorApiEnrich: "Enrich with Creator API (title, price, live availability)",
  sfEnrichingProducts: (done, total) => `Enriching products via Creator API... ${done} of ${total}`,
  sfCreatorApiNote:
    "Connect the Creator API in Settings to add product titles, prices, and live availability. Exported without it for now.",
  sfCreatorApiLocked:
    "Connect the Creator API in Settings to enrich with product titles, prices, and live availability.",
  sfCheckButton: "Check my storefront",
  sfStop: "Stop",
  sfRescan: "Rescan",
  sfScanningFeed: "Scanning the feed...",
  sfScanningProgress: (items, pages) => `Scanning the feed... ${items} items across ${pages} pages`,
  sfOpeningPhotos: (done, total) => `Opening photos and lists... ${done} of ${total}`,
  sfOpeningProducts: (done, total) => `Opening products... ${done} of ${total}`,
  sfEtaMinLeft: (min) => ` (about ${min} min left)`,
  sfCheckedFirst: (cap) => `Checked the first ${cap} products (storefront has more).`,
  sfScanFailed: "Scan failed. Reload the storefront tab and try again.",
  sfStopped: "Stopped.",
  sfDone: (items, pages, capped) =>
    `Done: ${items} items across ${pages} pages${capped ? " (feed capped)" : ""}.`,
  sfLabelVideos: "videos",
  sfLabelPhotos: "photos",
  sfLabelIdeaLists: "idea lists",
  sfLabelMediaLists: "media lists",
  chipUntagged: (n) => `${n} untagged`,
  chipOverTagged: (n) => `${n} over-tagged`,
  sfUniqueProducts: (n) => `${n} unique products`,
  sfUnavailable: (n) => `${n} unavailable`,
  sfNoTaggedEarns: "No tagged products, so it earns nothing.",
  sfUnavailableProduct: (asin) => `Unavailable product ${asin}`,
  sfTaggedUnavailable: "Tagged product is no longer available.",
  sfUntaggedHeading: (n) => `Untagged content (${n})`,
  sfOverTaggedHeading: (n) => `Over-tagged content (${n})`,
  sfUnavailableHeading: (n) => `Unavailable products (${n})`,
  sfOverTaggedCount: (n) => `${n} products tagged`,
  sfOverTaggedDetail: "Too many products tagged on one post dilutes each link.",
  sfAndMore: (n) => `and ${n} more: see the CSV export`,
  sfNoIssues: "No untagged, over-tagged, or unavailable issues found.",
  sfExportCsv: "Export results (CSV)",
  sfOpen: "Open",

  contentGapsHeading: "Content gaps in your orders",
  contentGapsIntro: (n) =>
    `${n} products on this page. Scan to find ones with few or no influencer videos: products you own and can film today.`,
  scanTheseOrders: (n) => `Scan these orders (up to ${n})`,
  checkingOrder: (i, n) => `Checking ${i} of ${n}...`,
  gapNoVideos: "No videos at all: wide open",
  gapNoCarousel: "No upper carousel",
  gapNoInfluencer: "No influencer videos yet",
  gapFewInfluencer: (n) => `Only ${n} influencer video${n === 1 ? "" : "s"}`,
  openProduct: "Open product",
  badgeNoVideos: "No videos at all",
  badgeNoCarousel: "No upper carousel",
  badgePending: (n) => `${n} videos (visit to classify)`,
  badgeNoInfluencer: "No influencer videos",
  badgeInfluencerVideos: (n) => `${n} influencer videos`,
  rescan: "Rescan",
  scanStopped: "Scan stopped.",
  gapsFound: (n) => `Done: ${n} content gap${n === 1 ? "" : "s"} found. Film what you already own.`,
  noGaps: "Done: no content gaps in these orders.",
  gapCheckNext: (next, remaining) => `Check next ${next} (${remaining} remaining)`,
  gapFilterNoCc: "No Creator Connections campaign only",
  gapFilterNoCarousel: "No upper carousel only",
  gapExportCsv: "Export gaps CSV",

  ordersButler: "Orders Butler",
  ordersButlerIntro:
    "Pull your full Amazon order history into your dashboard, the same as the desktop runner. It uses whichever Amazon account this browser is signed into, so it works on an account you manage (for example a family member's) just by signing in here first.",
  scopeLabel: "Scope: ",
  scopeNew: "Only new since last run",
  scopeAll: "All years (full catch-up)",
  syncMyOrders: "Sync my orders",
  syncAgain: "Sync again",
  reauthPrompt: "Amazon needs you to sign in. Sign in on this tab, then ",
  resume: "Resume",
  waitingForSignin: "Waiting for Amazon sign-in...",
  harvestReading: (year, page, orders) => `Reading ${year}, page ${page} (${orders} orders so far)...`,
  harvestStopped: (items, orders) => `Stopped. ${items} items from ${orders} orders synced so far.`,
  harvestUpToDate: (items, orders) => `Up to date. ${items} new items from ${orders} orders synced.`,
  harvestDone: (items, orders) => `Done. ${items} items from ${orders} orders synced to your dashboard.`,
  harvestNoOrders: "Done. No orders found on this account.",
  dateUnknown: "date unknown",
  plusMore: (n) => ` +${n} more`,

  updateVideoCounts: "Update influencer video count",
  updateVideoCountsIntro:
    "Check how many influencer videos each product you have ordered already has. Each product opens briefly in the background so the exact creator breakdown can load, then closes. This can take a while for a long history: leave this tab open while it runs.",
  updateVideoCountsAgain: "Update again",
  countPreparing: "Gathering your ordered products...",
  countChecking: (index, total, title) => `Checking ${index} of ${total}: ${title}...`,
  countDone: (updated, noInfluencer) =>
    `Done. Updated ${updated} product${updated === 1 ? "" : "s"}, ${noInfluencer} with no influencer videos yet.`,
  countStopped: (updated) => `Stopped. Updated ${updated} product${updated === 1 ? "" : "s"} so far.`,
  countNoOrders: "No orders to check yet. Run \"Sync my orders\" first.",
  countNoInfluencer: "No influencer videos",
  countInfluencerN: (n) => `${n} influencer video${n === 1 ? "" : "s"}`,
  countPending: "Count not available",

  campaigns: "Campaigns",
  noCampaign: "No Creator Connections or SPCC campaign found for this product.",
  ccAvailable: "Creator Connections available",
  spccAvailable: "SPCC available",
  campaignAcceptNote: "Accept it from the Send to your butler app section below (the app confirms and accepts).",
  dealAvailable: "Deal available",
  dealPushNote: "Push it to Daily Deals from the Send to your butler app section below.",

  campaignMatcher: "Campaign matcher",
  campaignMatcherIntro: (source) =>
    source === "storefront"
      ? "Find which products tagged in your storefront videos have an open Creator Connections or SPCC campaign you qualify for."
      : "Find which of your ordered products have an open Creator Connections or SPCC campaign you qualify for.",
  campaignMatcherScan: "Find campaigns I qualify for",
  campaignMatcherRescan: "Scan again",
  campaignMatcherScanning: "Checking your products...",
  campaignMatcherHarvesting: (n) => `Reading your storefront... ${n} items`,
  campaignMatcherFailed: "Could not complete the scan. Try again.",
  campaignMatcherNoProducts: "No products found to check.",
  campaignMatcherNoCatalogue: "Campaign catalogue is still downloading. Try again in a minute.",
  campaignMatcherSignIn: "Connect your license key in the popup to check your ordered products.",
  campaignMatcherNone:
    "None of these products have an open Creator Connections or SPCC campaign right now.",
  campaignMatcherDone: (matches, total) =>
    `${matches} of ${total} products have an available campaign.`,
  campaignMatcherAcceptedNote:
    "A hit means a campaign is likely available. The app confirms each one and skips any you have already accepted.",
  campaignMatcherAcceptAll: (n) => `Send all ${n} to the app to accept`,
  campaignMatcherUpsell: "Open the desktop app to accept these campaigns in one click.",
  sumCampaignMatcher: "Campaign matcher",

  sendToApp: "Send to your butler app",
  pushToDailyDeals: "Push to Daily Deals",
  sendToContentButler: "Send to Content Butler",
  acceptCc: "Accept CC campaign",
  acceptSpcc: "Accept SPCC campaign",
  addToCollab: "Add to Collaboration Tracker",
  addingCollab: "Adding to Collaboration Tracker...",
  pushingDeals: "Pushing to your deals workspace...",
  sendingContent: "Sending to Content Butler...",
  checkingCc: "Checking Creator Connections...",
  checkingSpcc: "Checking Sponsored Products...",
  sentToApp: "Sent to your app.",
  couldNotReachApp: "Could not reach the app. Is it still running?",
  connectedToApp: (version) =>
    `Connected to your Influencer Butler app${version}. Acceptance uses your local Creator Connections catalogue.`,
  upsellSignedIn:
    "Open the Influencer Butler desktop app to push this product into your Daily Deals, Content Butler, and to auto-accept campaigns.",
  upsellSignedOut:
    "Do the rest with the app: push this product to Daily Deals with your post template and social destinations, send it to Content Butler, and auto-accept Creator Connections campaigns.",
  ctaOpenApp: "Open or install the app",
  ctaStartTrial: "Start your free trial",
  toolsAlwaysFree: "The scanning tools above are always free. The app adds the automation.",

  sfSendToRetag: (n) => `Send ${n} issue(s) to Retag Butler`,
  sfSendingToRetag: "Sending to Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Accept all available campaigns (${n})`,
  sfAcceptingCampaigns: "Accepting campaigns in the app...",
  obSendToContentButler: (n) => `Send ${n} product(s) to Content Butler`,
  obSendingToContentButler: "Sending to Content Butler...",
  obSentToContentButler: (n) => `Sent ${n} product(s) to Content Butler.`,
  appBridgeHeading: "Desktop app",
  appBridgeBlurb:
    "Connect the Influencer Butler desktop app to accept campaigns and send products to your butlers straight from Amazon.",
  appConnect: "Connect the desktop app",
  appEnterCode: "Enter the 6-digit code showing in the desktop app:",
  appCodePlaceholder: "123456",
  appPairSubmit: "Pair",
  appConnected: "Connected to the desktop app.",
  appUnpair: "Disconnect app",
  appRequestingCode: "Asking the app for a code...",
  appCodeShown: "The app is showing a 6-digit code. Type it above.",
  appNotRunning: "The Influencer Butler app is not running. Open it and try again.",
  appCodeInvalid: "Enter the 6 digits shown in the app.",
  appPairing: "Pairing...",
  appPaired: "Connected. You can now send products to the app.",
  appPairFailed: "That did not work. Click Connect to try again.",

  nudgeCloseLabel: "Close",
  nudgeMaybeLater: "Maybe later",
  nudgeFbNotifTitle: "Join the Influencer Butler community",
  nudgeFbNotifBody:
    "Swap tips with other Amazon Influencers and get the most out of Influencer Butler. Click to join the Facebook group.",
  nudgeFbTitle: "Come say hi in the community",
  nudgeFbBody:
    "You have been using Influencer Butler for a day now. Join our Facebook group to swap tips with other Amazon Influencers and hear about new features first.",
  nudgeFbJoin: "Join the Facebook group",
  nudgeAppNotifTitle: "Get the free Influencer Butler desktop app",
  nudgeAppNotifBody:
    "Automate deals, content, and campaign acceptance from your computer. Click to download it free for Windows or Mac.",
  nudgeAppTitle: "Ready for the desktop app?",
  nudgeAppBody:
    "The desktop app does the heavy lifting: push products to Daily Deals, send them to Content Butler, and auto-accept Creator Connections campaigns.",
  nudgeAppFree: "It is free to download and works alongside this extension.",
  nudgeAppDownloadWindows: "Download for Windows",
  nudgeAppDownloadMac: "Download for Mac",
  nudgeAppDownloadGeneric: "Download the desktop app",
  nudgeAppIntelMac: "Using an Intel Mac?",

  watchlist: "Watchlist",
  watchlistIntro:
    "Get a browser alert when this product comes back in stock, an influencer video slot opens, or the price drops.",
  watchAdd: "Watch this product",
  watchRemove: "Stop watching",
  watchAdded: "Added to your watchlist. We will alert you on a change.",
  watchRemoved: "Removed from your watchlist.",
  watchAtCap: (n) => `Your watchlist is full (${n}). Remove one first.`,
  watchStar: "★",
  watchOn: "Watching",
  watchAddShort: "Watch",
  watchNotifTitle: "Influencer Butler watch alert",
  watchNotifBackInStock: (name) => `${name} is back in stock.`,
  watchNotifSlotOpens: (name, videos) =>
    `A video slot opened on ${name} (now ${videos} influencer videos).`,
  watchNotifPriceDrop: (name) => `The price dropped on ${name}.`,
  popupWatchlistHeading: "Watchlist",
  popupWatchlistEmpty: "No products watched yet. Open a product and click Watch.",
  watchCondBackInStock: "Back in stock",
  watchCondSlotOpens: "Video slot opens",
  watchCondPriceDrop: "Price drop",
  watchRemoveShort: "Remove",
};

const es: Dict = {
  panelChevronHide: "ocultar",
  panelChevronShow: "mostrar",
  panelSettings: "Ajustes",
  copy: "Copiar",
  copied: "Copiado",

  snapshotTitle: "Resumen del producto",
  snapshotProduct: "Producto",
  snapshotParent: "Padre",
  snapshotCategory: (category) => `Categoría: ${category}`,
  snapshotRank: (rank, category) => `#${rank} en ${category}`,
  snapshotCommissionLive: (pct) => `Comisión ${pct}% (en vivo de SiteStripe)`,
  snapshotCommissionCategory: (pct, category) =>
    `Comisión aprox. ${pct}% (${category}, tarifario)`,
  snapshotCommissionDefault: (pct) => `Comisión aprox. ${pct}% (tarifa general)`,
  snapshotCommissionNotSet: "Sin tarifa de comisión",
  earningsTitle: "Tus ganancias",
  earningsAmount: (amount, count) => `${amount} ganados de ${count} pedido${count === 1 ? "" : "s"}`,
  earningsNote: "Ya has ganado aquí. Busca más productos como los que ya te pagan.",
  priceHistoryTitle: "Historial de precios",
  priceHistoryNow: (amount) => `Ahora ${amount}`,
  priceHistoryLow: (amount) => `Mínimo ${amount}`,
  priceHistoryLowest: "El más bajo hasta ahora",
  priceHistoryNote: "Precios vistos desde que empezaste a navegar con la extensión.",

  tagFree: "Gratis",
  thisPageHeading: "Esta página",
  checkingTab: "Comprobando la pestaña actual...",
  accountHeading: "Cuenta",
  signedOutBlurb:
    "Todo funciona sin cuenta. Conecta tu clave de licencia de Influencer Butler para sincronizar los hallazgos con tu panel y la app de escritorio.",
  licensePlaceholder: "Clave de licencia",
  connect: "Conectar",
  noKeyYet: "¿Aún no tienes clave?",
  startFreeTrial: "Empieza una prueba gratis",
  connectedAs: "Conectado como",
  syncToggleLabel: "Sincronizar hallazgos con mi panel",
  disconnect: "Desconectar",
  settingsHeading: "Ajustes",
  languageLabel: "Idioma",
  langAuto: "Auto (navegador)",
  commissionRateLabel: "Comisión (%)",
  hourlyValueLabel: "Valor por hora ($)",
  minutesPerVideoLabel: "Minutos por video",
  contentGapThresholdLabel: "Umbral de hueco de contenido",
  storefrontHandleLabel: "Mi usuario de storefront",
  storefrontHandlePlaceholder: "p. ej. influencerbutler",
  toolsHeading: "Herramientas",
  toolVideoCounts: "Recuento de videos",
  toolApproved: "Sello Butler Approved",
  toolCalculator: "Calculadora de ganancias",
  toolStorefront: "Chequeos del storefront",
  toolOrdersButler: "Orders Butler (sincronizar pedidos)",
  toolSearchOverlay: "Overlay de resultados de búsqueda",
  toolCampaignMatcher: "Buscador de campañas",
  toolWatchlist: "Alertas de seguimiento",
  feedbackHeading: "Feedback Butler",
  feedbackBlurb: "¿Encontraste un error o quieres una función? Cuéntanos. No hace falta cuenta.",
  feedbackTypeLabel: "Tipo",
  feedbackTypeBug: "Reporte de error",
  feedbackTypeFeature: "Solicitud de función",
  feedbackTypePraise: "Elogio",
  feedbackTypeOther: "Otra cosa",
  feedbackPlaceholder: "¿Qué pasó, o qué te ayudaría?",
  feedbackSend: "Enviar comentario",
  footerHelp: "Ayuda",
  footerDashboard: "Mi panel",

  openAmazonToStart: "Abre una página de producto de Amazon, tus pedidos o tu storefront para empezar.",
  noToolsOnPage: "Esta página de Amazon no tiene herramientas del butler. Prueba una página de producto.",
  productToolsActive: "Las herramientas de la página de producto están activas.",
  orderScanReady: "El escaneo del historial de pedidos está listo.",
  storefrontCheckupReady: "El chequeo del storefront está listo.",
  uploadHelperReady: "El asistente de subida está listo.",
  reloadTabToActivate: "Recarga la pestaña de Amazon para activar las herramientas (la página estaba abierta antes de instalar).",
  connectedFallback: "conectado",
  findingsWaiting: (n) => `${n} hallazgos esperando sincronizar`,
  lastSynced: (time) => `Última sincronización ${time}`,
  nothingToSync: "Nada que sincronizar todavía",
  licenseDidNotVerify: "Esa clave de licencia no se verificó. Revísala e inténtalo de nuevo.",
  feedbackAddDetail: "Añade un poco más de detalle.",
  feedbackSending: "Enviando...",
  feedbackThanks: "¡Gracias! Enviado.",
  feedbackFailed: "No se pudo enviar. Inténtalo de nuevo.",

  sumVideos: "Videos",
  sumVideosValue: (total, influencer) => `${total} en total, ${influencer} de influencers`,
  sumApproved: "Butler Approved",
  yes: "Sí",
  no: "No",
  sumOrderScan: "Escaneo de pedidos",
  ready: "Listo",
  sumStorefrontCheckup: "Chequeo del storefront",
  sumUploadHelper: "Asistente de subida",

  uploadHelperTitle: "Asistente de subida",
  uhTaggedProducts: (n) => `${n} ${n === 1 ? "producto etiquetado" : "productos etiquetados"}`,
  uhCheckAvailability: "Ver disponibilidad (US, CA, UK)",
  uhCheckingAvailability: (done, total) => `Revisando ${done} de ${total}...`,
  uhInStock: "en stock",
  uhUnavailable: "no disponible",
  uhUnknownAvail: "?",
  uhCheckDuplicate: "Buscar un video duplicado",
  uhCheckingDuplicate: "Revisando los videos de tu storefront...",
  uhCheckingDuplicateProgress: (n) => `Revisados ${n} elementos...`,
  uhDuplicateFound: "Ya tienes un video con este título en tu storefront.",
  uhNoDuplicate: "Ningún video del storefront tiene este título. Parece nuevo.",
  uhNoHandle: "No se pudo leer el identificador de tu storefront en esta página.",
  uhCheckFailed: "No se pudo completar la revisión.",
  uhSubmitClose: "Enviar y cerrar",
  uhAutoSubmit: "Enviar automáticamente cuando el video esté listo",
  uhAutoSubmitNote:
    "Envía este video y vuelve a tu lista de videos. El envío automático solo ocurre cuando Amazon marca el video como listo.",
  uhSubmitting: "Enviando...",
  uhSubmitted: "Enviado. Volviendo a tus videos...",
  uhNotReady: "Aún no está listo: Amazon no terminó de procesar el video.",
  uhSubmitMissing: "No se encontró el botón Enviar en esta página.",
  uhWatching: "Esperando a que el video esté listo...",
  uhWatchTimeout: "Se dejó de esperar a que el video estuviera listo.",
  uhStop: "Detener",
  uhStopped: "Detenido.",

  videoCompetition: "Competencia de videos",
  noCarousel:
    "Sin carrusel superior: Amazon no le ha dado a este producto un espacio para videos de influencers, así que un video aquí no aparecerá en la ficha.",
  noVideosYet: "Aún no hay videos: oportunidad abierta de par en par.",
  videosPending: (total) =>
    `${total} videos en este producto. Desplázate a la sección Videos del producto y el desglose de influencer / marca / cliente se completa aquí automáticamente.`,
  chipInfluencer: (n) => `${n} influencer`,
  chipBrand: (n) => `${n} marca`,
  chipCustomer: (n) => `${n} cliente`,
  chipUnclassified: (n) => `${n} sin clasificar`,
  videosTotalVia: (total, viaPageData) =>
    `${total} videos en total (leído vía ${viaPageData ? "datos de página" : "carrusel"})`,
  influencerFallback: "Influencer",
  influencerVideosLabel: (n) => `Videos de influencers (${n})`,
  influencerVideosMore: (n) => `+${n} más`,

  deepScan: "Deep Scan: recopilar todos los videos",
  deepScanIntro:
    "Amazon solo carga unos pocos videos en pantalla. Deep Scan recorre el propio feed del widget para clasificar todos los videos que entregue, separados por carrusel superior (video de marca) e inferior (relacionados).",
  deepScanRunning: (videos, pages) => `Recopilando: ${videos} videos en ${pages} páginas...`,
  deepScanStop: "Detener",
  deepScanRescan: "Ejecutar Deep Scan de nuevo",
  deepScanDone: (classified, total) => `Clasificados ${classified} de ${total} videos.`,
  deepScanPartial:
    "Amazon entregó solo parte de la lista, así que esto es un mínimo, no el conjunto completo.",
  deepScanNoEndpoint:
    "Desplázate a la sección Videos del producto una vez y luego ejecuta Deep Scan para que encuentre el feed de videos.",
  deepScanStopped: "Deep Scan detenido.",
  upperCarousel: "Carrusel superior (video de marca)",
  lowerCarousel: "Carrusel inferior (relacionados)",
  estTotalVideos: (n) => `Total estimado de videos: ${n}`,
  allVideosLabel: (n) => `Todos los videos recopilados (${n})`,
  videoNoTitle: "Video sin título",
  videoExportCsv: "Exportar videos (CSV)",
  copySummary: "Copiar resumen",
  shareSummaryHeading: "Competencia de videos del producto (vía Influencer Butler)",
  shareTopCreators: "Creadores principales:",

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: vale la pena crear contenido",
  approvedNo: "Todavía no es Butler Approved",
  approvedReasonPass: "Todas las comprobaciones de abajo pasan, así que vale la pena crear contenido.",
  approvedReasonFail: (checks) => `Todavía no aprobado: estas comprobaciones no pasaron - ${checks}.`,
  approvedReasonUnknown: (checks) => `No se pudo leer de esta página: ${checks}.`,
  approvedCriteriaNote: "Criterios leídos de esta página. Ajusta los umbrales en el popup de la extensión.",
  critBought: (n) => `${n}+ comprados el mes pasado`,
  critOpenSlot: (n) => `Menos de ${n} videos de influencers`,
  critInStock: "En stock",
  critPriceFloor: (n) => `Precio de al menos $${n}`,

  butlerScore: "Butler Score",
  butlerScoreIntro:
    "Una lectura de 0 a 100 de lo que vale la pena este producto: comisión por venta, un espacio de video libre, demanda, stock y elegibilidad de campaña en un solo número.",
  scoreBandLabel: (band) =>
    band === "hot" ? "Muy recomendable" : band === "warm" ? "Vale un vistazo" : "Baja prioridad",
  scoreOutOf: "de 100",
  scorePartCommission: "Comisión",
  scorePartSlot: "Espacio libre",
  scorePartDemand: "Demanda",
  scorePartAvailability: "En stock",
  scorePartPrice: "Precio",
  scorePartCampaign: "Campaña",
  sumScore: "Butler Score",

  sumSearchOverlay: "Overlay de búsqueda",
  searchCount: (n) => `${n} productos puntuados`,
  searchSortLabel: "Ordenar:",
  sortScore: "Mejor Butler Score",
  sortCommission: "Mayor comisión",
  sortPriceAsc: "Precio: de menor a mayor",
  sortPriceDesc: "Precio: de mayor a menor",
  sortRelevance: "Relevancia de Amazon",
  searchCampaignOnly: "Solo elegibles para campaña",
  searchMinPrice: "Precio mín.",
  searchScan: "Escanear videos de esta página",
  searchScanStop: "Detener",
  searchScanning: (done, total) => `Escaneando ${done} de ${total}...`,
  searchScanDone: (n) => `Escaneados ${n} productos.`,
  searchScanMore: (done, remaining) => `Escaneados ${done}. Pulsa Escanear de nuevo para ${remaining} más.`,
  tileCommission: (amount) => `${amount}/venta`,
  tileCampaign: "Campaña",
  tileProvenEarner: "Ya te ha pagado",
  tileInfluencer: (n) => `${n} videos de infl.`,
  searchOverlayActive: "El overlay de búsqueda está activo.",

  breakEvenMath: "Cálculo de punto de equilibrio",
  noPriceForMath: "No se encontró precio en esta página, así que no hay cálculo que hacer.",
  calcIntro:
    "Cuántas ventas recuperan el tiempo que pasas grabando un video. Esto asume que el producto es gratis (Creator Connections) o que ya lo tienes, no que lo compras.",
  commissionFromSiteStripe: (pct) => `Comisión del ${pct}% leída en vivo de tu barra SiteStripe.`,
  commissionFromRateCard: (pct, category) =>
    `Usando ${pct}% para "${category}" del tarifario de Amazon Associates.`,
  commissionFromRateCardDefault: (pct) =>
    `Usando la tarifa general del ${pct}% del tarifario de Amazon Associates.`,
  fieldCommissionRate: "Comisión (%)",
  fieldHourlyRate: "Tu tarifa por hora ($)",
  fieldMinutesFilmEdit: "Minutos para grabar + editar",
  fieldViewsPerMonth: "Vistas estimadas por mes",
  calcEstimatesNote:
    "Solo estimaciones. La ganancia mensual asume que el carrusel reparte las vistas por igual entre los videos de influencers.",
  kvCommissionPerSale: "Comisión por venta",
  kvTimeToFilm: (minutes, hourly) => `Tu tiempo para grabar (${minutes} min a ${hourly}/h)`,
  kvSalesToEarnBack: "Ventas para recuperarlo",
  kvViewsForSales: "Vistas para esas ventas",
  kvProfitPerMonth: "Ganancia estimada al mes",
  notApplicable: "n/d",
  bePurchasedHeading: "Punto de equilibrio si lo compras",
  bePurchasedNote:
    "Si compras el producto, esto es lo que hace falta para recuperar el precio de compra más tu tiempo de grabación.",
  beTimeHeading: "Equilibrio por tiempo invertido",
  beTimeNote:
    "Asume que el producto es gratis (un regalo de Creator Connections o uno que ya tienes): cuántas ventas recuperan solo tu tiempo de grabación.",
  beAdjustAssumptions: "Ajustar supuestos",
  kvPurchasePrice: "Precio de compra",
  kvTotalToEarnBack: "Tiempo + compra a recuperar",

  storefrontCheckup: "Chequeo del storefront",
  sfFastScanNote:
    "Escaneo rápido de todo tu storefront a través del propio feed de Amazon: sin desplazamiento, sin cargar imágenes. Las casillas de abajo añaden chequeos profundos más lentos que abren cada elemento.",
  sfDeepContent: "También escanear etiquetas de fotos y listas",
  sfCheckAvailability: "Comprobar disponibilidad del producto (abre cada producto)",
  sfParentAsins: "Resolver ASIN padre (abre cada producto)",
  sfCreatorApiEnrich: "Enriquecer con la Creator API (título, precio, disponibilidad en vivo)",
  sfEnrichingProducts: (done, total) => `Enriqueciendo productos con la Creator API... ${done} de ${total}`,
  sfCreatorApiNote:
    "Conecta la Creator API en Ajustes para añadir títulos, precios y disponibilidad en vivo de los productos. Exportado sin ello por ahora.",
  sfCreatorApiLocked:
    "Conecta la Creator API en Ajustes para enriquecer con títulos, precios y disponibilidad en vivo de los productos.",
  sfCheckButton: "Revisar mi storefront",
  sfStop: "Detener",
  sfRescan: "Volver a escanear",
  sfScanningFeed: "Escaneando el feed...",
  sfScanningProgress: (items, pages) => `Escaneando el feed... ${items} elementos en ${pages} páginas`,
  sfOpeningPhotos: (done, total) => `Abriendo fotos y listas... ${done} de ${total}`,
  sfOpeningProducts: (done, total) => `Abriendo productos... ${done} de ${total}`,
  sfEtaMinLeft: (min) => ` (unos ${min} min restantes)`,
  sfCheckedFirst: (cap) => `Revisados los primeros ${cap} productos (el storefront tiene más).`,
  sfScanFailed: "El escaneo falló. Recarga la pestaña del storefront e inténtalo de nuevo.",
  sfStopped: "Detenido.",
  sfDone: (items, pages, capped) =>
    `Listo: ${items} elementos en ${pages} páginas${capped ? " (feed limitado)" : ""}.`,
  sfLabelVideos: "videos",
  sfLabelPhotos: "fotos",
  sfLabelIdeaLists: "listas de ideas",
  sfLabelMediaLists: "listas de medios",
  chipUntagged: (n) => `${n} sin etiquetas`,
  chipOverTagged: (n) => `${n} con exceso de etiquetas`,
  sfUniqueProducts: (n) => `${n} productos únicos`,
  sfUnavailable: (n) => `${n} no disponibles`,
  sfNoTaggedEarns: "Sin productos etiquetados, así que no gana nada.",
  sfUnavailableProduct: (asin) => `Producto no disponible ${asin}`,
  sfTaggedUnavailable: "El producto etiquetado ya no está disponible.",
  sfUntaggedHeading: (n) => `Contenido sin etiquetas (${n})`,
  sfOverTaggedHeading: (n) => `Contenido con exceso de etiquetas (${n})`,
  sfUnavailableHeading: (n) => `Productos no disponibles (${n})`,
  sfOverTaggedCount: (n) => `${n} productos etiquetados`,
  sfOverTaggedDetail: "Etiquetar demasiados productos en una publicación diluye cada enlace.",
  sfAndMore: (n) => `y ${n} más: consulta la exportación CSV`,
  sfNoIssues: "No se encontraron problemas de etiquetas o disponibilidad.",
  sfExportCsv: "Exportar resultados (CSV)",
  sfOpen: "Abrir",

  contentGapsHeading: "Huecos de contenido en tus pedidos",
  contentGapsIntro: (n) =>
    `${n} productos en esta página. Escanea para encontrar los que tienen pocos o cero videos de influencers: productos que ya tienes y puedes grabar hoy.`,
  scanTheseOrders: (n) => `Escanear estos pedidos (hasta ${n})`,
  checkingOrder: (i, n) => `Comprobando ${i} de ${n}...`,
  gapNoVideos: "Sin videos: totalmente abierto",
  gapNoCarousel: "Sin carrusel superior",
  gapNoInfluencer: "Aún sin videos de influencers",
  gapFewInfluencer: (n) => `Solo ${n} video${n === 1 ? "" : "s"} de influencers`,
  openProduct: "Abrir producto",
  badgeNoVideos: "Sin videos",
  badgeNoCarousel: "Sin carrusel superior",
  badgePending: (n) => `${n} videos (visita para clasificar)`,
  badgeNoInfluencer: "Sin videos de influencers",
  badgeInfluencerVideos: (n) => `${n} videos de influencers`,
  rescan: "Volver a escanear",
  scanStopped: "Escaneo detenido.",
  gapsFound: (n) => `Listo: ${n} hueco${n === 1 ? "" : "s"} de contenido encontrado${n === 1 ? "" : "s"}. Graba lo que ya tienes.`,
  noGaps: "Listo: no hay huecos de contenido en estos pedidos.",
  gapCheckNext: (next, remaining) => `Revisar los siguientes ${next} (${remaining} restantes)`,
  gapFilterNoCc: "Solo sin campaña de Creator Connections",
  gapFilterNoCarousel: "Solo sin carrusel superior",
  gapExportCsv: "Exportar huecos CSV",

  ordersButler: "Orders Butler",
  ordersButlerIntro:
    "Trae todo tu historial de pedidos de Amazon a tu panel, igual que el runner de escritorio. Usa la cuenta de Amazon en la que esté conectado este navegador, así que funciona en una cuenta que gestionas (por ejemplo la de un familiar) solo con iniciar sesión aquí primero.",
  scopeLabel: "Alcance: ",
  scopeNew: "Solo lo nuevo desde la última vez",
  scopeAll: "Todos los años (puesta al día completa)",
  syncMyOrders: "Sincronizar mis pedidos",
  syncAgain: "Sincronizar de nuevo",
  reauthPrompt: "Amazon necesita que inicies sesión. Inicia sesión en esta pestaña y luego ",
  resume: "Reanudar",
  waitingForSignin: "Esperando el inicio de sesión de Amazon...",
  harvestReading: (year, page, orders) => `Leyendo ${year}, página ${page} (${orders} pedidos hasta ahora)...`,
  harvestStopped: (items, orders) => `Detenido. ${items} artículos de ${orders} pedidos sincronizados hasta ahora.`,
  harvestUpToDate: (items, orders) => `Al día. ${items} artículos nuevos de ${orders} pedidos sincronizados.`,
  harvestDone: (items, orders) => `Listo. ${items} artículos de ${orders} pedidos sincronizados con tu panel.`,
  harvestNoOrders: "Listo. No se encontraron pedidos en esta cuenta.",
  dateUnknown: "fecha desconocida",
  plusMore: (n) => ` +${n} más`,

  updateVideoCounts: "Actualizar recuento de videos de influencers",
  updateVideoCountsIntro:
    "Comprueba cuántos videos de influencers tiene ya cada producto que has pedido. Cada producto se abre un momento en segundo plano para cargar el desglose exacto de creadores y luego se cierra. Con un historial largo puede tardar un rato: deja esta pestaña abierta mientras se ejecuta.",
  updateVideoCountsAgain: "Actualizar de nuevo",
  countPreparing: "Reuniendo tus productos pedidos...",
  countChecking: (index, total, title) => `Comprobando ${index} de ${total}: ${title}...`,
  countDone: (updated, noInfluencer) =>
    `Listo. ${updated} producto${updated === 1 ? "" : "s"} actualizado${updated === 1 ? "" : "s"}, ${noInfluencer} aún sin videos de influencers.`,
  countStopped: (updated) => `Detenido. ${updated} producto${updated === 1 ? "" : "s"} actualizado${updated === 1 ? "" : "s"} hasta ahora.`,
  countNoOrders: "Aún no hay pedidos que comprobar. Ejecuta \"Sincronizar mis pedidos\" primero.",
  countNoInfluencer: "Sin videos de influencers",
  countInfluencerN: (n) => `${n} video${n === 1 ? "" : "s"} de influencers`,
  countPending: "Recuento no disponible",

  campaigns: "Campañas",
  noCampaign: "No se encontró campaña de Creator Connections ni SPCC para este producto.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  campaignAcceptNote: "Acéptala desde la sección Send to your butler app de abajo (la app confirma y acepta).",
  dealAvailable: "Oferta disponible",
  dealPushNote: "Envíala a Daily Deals desde la sección Send to your butler app de abajo.",

  campaignMatcher: "Buscador de campañas",
  campaignMatcherIntro: (source) =>
    source === "storefront"
      ? "Descubre qué productos etiquetados en los videos de tu storefront tienen una campaña de Creator Connections o SPCC para la que calificas."
      : "Descubre cuáles de tus productos pedidos tienen una campaña de Creator Connections o SPCC para la que calificas.",
  campaignMatcherScan: "Buscar campañas para las que califico",
  campaignMatcherRescan: "Buscar de nuevo",
  campaignMatcherScanning: "Revisando tus productos...",
  campaignMatcherHarvesting: (n) => `Leyendo tu storefront... ${n} elementos`,
  campaignMatcherFailed: "No se pudo completar la búsqueda. Inténtalo de nuevo.",
  campaignMatcherNoProducts: "No se encontraron productos para revisar.",
  campaignMatcherNoCatalogue: "El catálogo de campañas aún se está descargando. Inténtalo en un minuto.",
  campaignMatcherSignIn: "Conecta tu clave de licencia en el popup para revisar tus productos pedidos.",
  campaignMatcherNone:
    "Ninguno de estos productos tiene una campaña de Creator Connections o SPCC abierta ahora mismo.",
  campaignMatcherDone: (matches, total) =>
    `${matches} de ${total} productos tienen una campaña disponible.`,
  campaignMatcherAcceptedNote:
    "Un resultado significa que es probable que haya una campaña. La app confirma cada una y omite las que ya aceptaste.",
  campaignMatcherAcceptAll: (n) => `Enviar los ${n} a la app para aceptar`,
  campaignMatcherUpsell: "Abre la app de escritorio para aceptar estas campañas con un clic.",
  sumCampaignMatcher: "Buscador de campañas",

  sendToApp: "Enviar a tu app butler",
  pushToDailyDeals: "Enviar a Daily Deals",
  sendToContentButler: "Enviar a Content Butler",
  acceptCc: "Aceptar campaña CC",
  acceptSpcc: "Aceptar campaña SPCC",
  addToCollab: "Añadir al Collaboration Tracker",
  addingCollab: "Añadiendo al Collaboration Tracker...",
  pushingDeals: "Enviando a tu workspace de ofertas...",
  sendingContent: "Enviando a Content Butler...",
  checkingCc: "Comprobando Creator Connections...",
  checkingSpcc: "Comprobando Sponsored Products...",
  sentToApp: "Enviado a tu app.",
  couldNotReachApp: "No se pudo contactar la app. ¿Sigue abierta?",
  connectedToApp: (version) =>
    `Conectado a tu app de Influencer Butler${version}. La aceptación usa tu catálogo local de Creator Connections.`,
  upsellSignedIn:
    "Abre la app de escritorio de Influencer Butler para enviar este producto a tus Daily Deals, Content Butler y auto-aceptar campañas.",
  upsellSignedOut:
    "Haz el resto con la app: envía este producto a Daily Deals con tu plantilla de publicación y destinos sociales, mándalo a Content Butler y auto-acepta campañas de Creator Connections.",
  ctaOpenApp: "Abrir o instalar la app",
  ctaStartTrial: "Empieza tu prueba gratis",
  toolsAlwaysFree: "Las herramientas de escaneo de arriba siempre son gratis. La app añade la automatización.",

  sfSendToRetag: (n) => `Enviar ${n} problema(s) a Retag Butler`,
  sfSendingToRetag: "Enviando a Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Aceptar todas las campañas disponibles (${n})`,
  sfAcceptingCampaigns: "Aceptando campañas en la app...",
  obSendToContentButler: (n) => `Enviar ${n} producto(s) a Content Butler`,
  obSendingToContentButler: "Enviando a Content Butler...",
  obSentToContentButler: (n) => `Se enviaron ${n} producto(s) a Content Butler.`,
  appBridgeHeading: "App de escritorio",
  appBridgeBlurb:
    "Conecta la app de escritorio de Influencer Butler para aceptar campañas y enviar productos a tus butlers directamente desde Amazon.",
  appConnect: "Conectar la app de escritorio",
  appEnterCode: "Escribe el código de 6 dígitos que aparece en la app de escritorio:",
  appCodePlaceholder: "123456",
  appPairSubmit: "Vincular",
  appConnected: "Conectado a la app de escritorio.",
  appUnpair: "Desconectar app",
  appRequestingCode: "Pidiendo un código a la app...",
  appCodeShown: "La app muestra un código de 6 dígitos. Escríbelo arriba.",
  appNotRunning: "La app de Influencer Butler no está abierta. Ábrela e inténtalo de nuevo.",
  appCodeInvalid: "Escribe los 6 dígitos que muestra la app.",
  appPairing: "Vinculando...",
  appPaired: "Conectado. Ya puedes enviar productos a la app.",
  appPairFailed: "No funcionó. Haz clic en Conectar para intentarlo de nuevo.",

  nudgeCloseLabel: "Cerrar",
  nudgeMaybeLater: "Quizás luego",
  nudgeFbNotifTitle: "Únete a la comunidad de Influencer Butler",
  nudgeFbNotifBody:
    "Intercambia consejos con otros Amazon Influencers y saca el máximo partido a Influencer Butler. Haz clic para unirte al grupo de Facebook.",
  nudgeFbTitle: "Ven a saludar a la comunidad",
  nudgeFbBody:
    "Llevas un día usando Influencer Butler. Únete a nuestro grupo de Facebook para intercambiar consejos con otros Amazon Influencers y enterarte de las novedades antes que nadie.",
  nudgeFbJoin: "Unirme al grupo de Facebook",
  nudgeAppNotifTitle: "Descarga gratis la app de escritorio de Influencer Butler",
  nudgeAppNotifBody:
    "Automatiza ofertas, contenido y aceptación de campañas desde tu ordenador. Haz clic para descargarla gratis para Windows o Mac.",
  nudgeAppTitle: "¿List@ para la app de escritorio?",
  nudgeAppBody:
    "La app de escritorio hace el trabajo pesado: envía productos a Daily Deals, mándalos a Content Butler y auto-acepta campañas de Creator Connections.",
  nudgeAppFree: "Es gratis de descargar y funciona junto a esta extensión.",
  nudgeAppDownloadWindows: "Descargar para Windows",
  nudgeAppDownloadMac: "Descargar para Mac",
  nudgeAppDownloadGeneric: "Descargar la app de escritorio",
  nudgeAppIntelMac: "¿Usas un Mac con Intel?",

  watchlist: "Lista de seguimiento",
  watchlistIntro:
    "Recibe un aviso del navegador cuando este producto vuelva a tener stock, se abra un espacio de video de influencer o baje el precio.",
  watchAdd: "Seguir este producto",
  watchRemove: "Dejar de seguir",
  watchAdded: "Añadido a tu lista de seguimiento. Te avisaremos si cambia.",
  watchRemoved: "Eliminado de tu lista de seguimiento.",
  watchAtCap: (n) => `Tu lista de seguimiento está llena (${n}). Elimina uno primero.`,
  watchStar: "★",
  watchOn: "Siguiendo",
  watchAddShort: "Seguir",
  watchNotifTitle: "Alerta de seguimiento de Influencer Butler",
  watchNotifBackInStock: (name) => `${name} vuelve a tener stock.`,
  watchNotifSlotOpens: (name, videos) =>
    `Se abrió un espacio de video en ${name} (ahora ${videos} videos de influencers).`,
  watchNotifPriceDrop: (name) => `Bajó el precio de ${name}.`,
  popupWatchlistHeading: "Lista de seguimiento",
  popupWatchlistEmpty: "Aún no sigues productos. Abre un producto y pulsa Seguir.",
  watchCondBackInStock: "Vuelve a stock",
  watchCondSlotOpens: "Se abre espacio de video",
  watchCondPriceDrop: "Baja de precio",
  watchRemoveShort: "Eliminar",
};

const fr: Dict = {
  panelChevronHide: "masquer",
  panelChevronShow: "afficher",
  panelSettings: "Paramètres",
  copy: "Copier",
  copied: "Copié",

  snapshotTitle: "Aperçu du produit",
  snapshotProduct: "Produit",
  snapshotParent: "Parent",
  snapshotCategory: (category) => `Catégorie : ${category}`,
  snapshotRank: (rank, category) => `#${rank} dans ${category}`,
  snapshotCommissionLive: (pct) => `Commission ${pct}% (en direct de SiteStripe)`,
  snapshotCommissionCategory: (pct, category) =>
    `Commission environ ${pct}% (${category}, grille)`,
  snapshotCommissionDefault: (pct) => `Commission environ ${pct}% (taux general)`,
  snapshotCommissionNotSet: "Aucun taux de commission défini",
  earningsTitle: "Vos gains",
  earningsAmount: (amount, count) => `${amount} gagnés sur ${count} commande${count === 1 ? "" : "s"}`,
  earningsNote: "Vous avez déjà gagné ici. Trouvez plus de produits comme ceux qui vous rapportent déjà.",
  priceHistoryTitle: "Historique des prix",
  priceHistoryNow: (amount) => `Maintenant ${amount}`,
  priceHistoryLow: (amount) => `Plus bas ${amount}`,
  priceHistoryLowest: "Plus bas jamais vu",
  priceHistoryNote: "Prix vus depuis que vous naviguez avec l'extension.",

  tagFree: "Gratuit",
  thisPageHeading: "Cette page",
  checkingTab: "Vérification de l'onglet actuel...",
  accountHeading: "Compte",
  signedOutBlurb:
    "Tout fonctionne sans compte. Connectez votre clé de licence Influencer Butler pour synchroniser les découvertes avec votre tableau de bord et l'app de bureau.",
  licensePlaceholder: "Clé de licence",
  connect: "Connecter",
  noKeyYet: "Pas encore de clé?",
  startFreeTrial: "Démarrer un essai gratuit",
  connectedAs: "Connecté en tant que",
  syncToggleLabel: "Synchroniser les découvertes avec mon tableau de bord",
  disconnect: "Déconnecter",
  settingsHeading: "Paramètres",
  languageLabel: "Langue",
  langAuto: "Auto (navigateur)",
  commissionRateLabel: "Taux de commission (%)",
  hourlyValueLabel: "Valeur horaire ($)",
  minutesPerVideoLabel: "Minutes par vidéo",
  contentGapThresholdLabel: "Seuil de manque de contenu",
  storefrontHandleLabel: "Mon pseudo de storefront",
  storefrontHandlePlaceholder: "p. ex. influencerbutler",
  toolsHeading: "Outils",
  toolVideoCounts: "Comptage de vidéos",
  toolApproved: "Sceau Butler Approved",
  toolCalculator: "Calculateur de profit",
  toolStorefront: "Vérifications du storefront",
  toolOrdersButler: "Orders Butler (synchroniser les commandes)",
  toolSearchOverlay: "Overlay des résultats de recherche",
  toolCampaignMatcher: "Détecteur de campagnes",
  toolWatchlist: "Alertes de suivi",
  feedbackHeading: "Feedback Butler",
  feedbackBlurb: "Un bug ou une idée de fonctionnalité? Dites-le-nous. Aucun compte requis.",
  feedbackTypeLabel: "Type",
  feedbackTypeBug: "Signalement de bug",
  feedbackTypeFeature: "Demande de fonctionnalité",
  feedbackTypePraise: "Compliment",
  feedbackTypeOther: "Autre chose",
  feedbackPlaceholder: "Que s'est-il passé, ou qu'est-ce qui aiderait?",
  feedbackSend: "Envoyer un retour",
  footerHelp: "Aide",
  footerDashboard: "Mon tableau de bord",

  openAmazonToStart: "Ouvrez une page produit Amazon, vos commandes ou votre storefront pour commencer.",
  noToolsOnPage: "Cette page Amazon n'a pas d'outils butler. Essayez une page produit.",
  productToolsActive: "Les outils de la page produit sont actifs.",
  orderScanReady: "L'analyse de l'historique de commandes est prête.",
  storefrontCheckupReady: "Le bilan du storefront est prêt.",
  uploadHelperReady: "L'assistant de mise en ligne est prêt.",
  reloadTabToActivate: "Rechargez l'onglet Amazon pour activer les outils (la page était ouverte avant l'installation).",
  connectedFallback: "connecté",
  findingsWaiting: (n) => `${n} découvertes en attente de synchronisation`,
  lastSynced: (time) => `Dernière synchro ${time}`,
  nothingToSync: "Rien à synchroniser pour l'instant",
  licenseDidNotVerify: "Cette clé de licence n'a pas été vérifiée. Vérifiez-la et réessayez.",
  feedbackAddDetail: "Ajoutez un peu plus de détail.",
  feedbackSending: "Envoi...",
  feedbackThanks: "Merci! Envoyé.",
  feedbackFailed: "Envoi impossible. Réessayez.",

  sumVideos: "Vidéos",
  sumVideosValue: (total, influencer) => `${total} au total, ${influencer} d'influenceurs`,
  sumApproved: "Butler Approved",
  yes: "Oui",
  no: "Non",
  sumOrderScan: "Analyse des commandes",
  ready: "Prêt",
  sumStorefrontCheckup: "Bilan du storefront",
  sumUploadHelper: "Assistant de mise en ligne",

  uploadHelperTitle: "Assistant de mise en ligne",
  uhTaggedProducts: (n) => `${n} ${n === 1 ? "produit tagué" : "produits tagués"}`,
  uhCheckAvailability: "Vérifier la disponibilité (US, CA, UK)",
  uhCheckingAvailability: (done, total) => `Vérification ${done} sur ${total}...`,
  uhInStock: "en stock",
  uhUnavailable: "indisponible",
  uhUnknownAvail: "?",
  uhCheckDuplicate: "Chercher une vidéo en double",
  uhCheckingDuplicate: "Analyse des vidéos de votre storefront...",
  uhCheckingDuplicateProgress: (n) => `${n} éléments analysés...`,
  uhDuplicateFound: "Une vidéo avec ce titre est déjà sur votre storefront.",
  uhNoDuplicate: "Aucune vidéo du storefront n'a ce titre. Elle semble nouvelle.",
  uhNoHandle: "Impossible de lire l'identifiant de votre storefront sur cette page.",
  uhCheckFailed: "Impossible de terminer la vérification.",
  uhSubmitClose: "Soumettre et fermer",
  uhAutoSubmit: "Soumettre automatiquement quand la vidéo est prête",
  uhAutoSubmitNote:
    "Soumet cette vidéo et revient à votre liste de vidéos. La soumission automatique ne se déclenche qu'une fois la vidéo marquée prête par Amazon.",
  uhSubmitting: "Soumission...",
  uhSubmitted: "Soumis. Retour à vos vidéos...",
  uhNotReady: "Pas encore prêt : Amazon n'a pas fini de traiter la vidéo.",
  uhSubmitMissing: "Bouton Soumettre introuvable sur cette page.",
  uhWatching: "En attente que la vidéo soit prête...",
  uhWatchTimeout: "Abandon de l'attente que la vidéo soit prête.",
  uhStop: "Arrêter",
  uhStopped: "Arrêté.",

  videoCompetition: "Concurrence vidéo",
  noCarousel:
    "Aucun carrousel superieur : Amazon n'a pas donné à ce produit d'emplacement pour les vidéos d'influenceurs, donc une vidéo ici n'apparaitra pas sur la fiche.",
  noVideosYet: "Pas encore de vidéos: opportunité grande ouverte.",
  videosPending: (total) =>
    `${total} vidéos sur ce produit. Faites défiler jusqu'à la section Vidéos du produit et la répartition influenceur / marque / client se remplit ici automatiquement.`,
  chipInfluencer: (n) => `${n} influenceur`,
  chipBrand: (n) => `${n} marque`,
  chipCustomer: (n) => `${n} client`,
  chipUnclassified: (n) => `${n} non classées`,
  videosTotalVia: (total, viaPageData) =>
    `${total} vidéos au total (lu via ${viaPageData ? "données de page" : "carrousel"})`,
  influencerFallback: "Influenceur",
  influencerVideosLabel: (n) => `Vidéos d'influenceurs (${n})`,
  influencerVideosMore: (n) => `+${n} de plus`,

  deepScan: "Deep Scan: récolter toutes les vidéos",
  deepScanIntro:
    "Amazon ne charge que quelques vidéos à l'écran. Deep Scan parcourt le flux du widget pour classer toutes les vidéos qu'il fournit, réparties entre carrousel supérieur (vidéo de marque) et inférieur (vidéos liées).",
  deepScanRunning: (videos, pages) => `Récolte: ${videos} vidéos sur ${pages} pages...`,
  deepScanStop: "Arrêter",
  deepScanRescan: "Relancer Deep Scan",
  deepScanDone: (classified, total) => `${classified} vidéos classées sur ${total}.`,
  deepScanPartial:
    "Amazon n'a fourni qu'une partie de la liste: ceci est un minimum, pas l'ensemble complet.",
  deepScanNoEndpoint:
    "Faites défiler une fois jusqu'à la section Vidéos du produit, puis lancez Deep Scan pour qu'il trouve le flux de vidéos.",
  deepScanStopped: "Deep Scan arrêté.",
  upperCarousel: "Carrousel supérieur (vidéo de marque)",
  lowerCarousel: "Carrousel inférieur (vidéos liées)",
  estTotalVideos: (n) => `Total estimé de vidéos: ${n}`,
  allVideosLabel: (n) => `Toutes les vidéos récoltées (${n})`,
  videoNoTitle: "Vidéo sans titre",
  videoExportCsv: "Exporter les vidéos (CSV)",
  copySummary: "Copier le résumé",
  shareSummaryHeading: "Concurrence vidéo du produit (via Influencer Butler)",
  shareTopCreators: "Principaux créateurs:",

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: ça vaut le coup de créer du contenu",
  approvedNo: "Pas encore Butler Approved",
  approvedReasonPass: "Toutes les verifications ci-dessous passent, donc ça vaut le coup de créer du contenu.",
  approvedReasonFail: (checks) => `Pas encore approuvé : ces verifications n'ont pas passé - ${checks}.`,
  approvedReasonUnknown: (checks) => `Impossible de lire sur cette page : ${checks}.`,
  approvedCriteriaNote: "Critères lus sur cette page. Réglez les seuils dans le popup de l'extension.",
  critBought: (n) => `${n}+ achetés le mois dernier`,
  critOpenSlot: (n) => `Moins de ${n} vidéos d'influenceurs`,
  critInStock: "En stock",
  critPriceFloor: (n) => `Prix d'au moins ${n} $`,

  butlerScore: "Butler Score",
  butlerScoreIntro:
    "Une note de 0 à 100 sur l'intérêt de ce produit : commission par vente, un créneau vidéo libre, la demande, le stock et l'éligibilité aux campagnes réunis en un seul chiffre.",
  scoreBandLabel: (band) =>
    band === "hot" ? "Excellent choix" : band === "warm" ? "À considérer" : "Priorité basse",
  scoreOutOf: "sur 100",
  scorePartCommission: "Commission",
  scorePartSlot: "Créneau libre",
  scorePartDemand: "Demande",
  scorePartAvailability: "En stock",
  scorePartPrice: "Prix",
  scorePartCampaign: "Campagne",
  sumScore: "Butler Score",

  sumSearchOverlay: "Overlay de recherche",
  searchCount: (n) => `${n} produits notés`,
  searchSortLabel: "Trier :",
  sortScore: "Meilleur Butler Score",
  sortCommission: "Commission la plus élevée",
  sortPriceAsc: "Prix : croissant",
  sortPriceDesc: "Prix : décroissant",
  sortRelevance: "Pertinence Amazon",
  searchCampaignOnly: "Éligibles aux campagnes seulement",
  searchMinPrice: "Prix min.",
  searchScan: "Analyser les vidéos de cette page",
  searchScanStop: "Arrêter",
  searchScanning: (done, total) => `Analyse ${done} sur ${total}...`,
  searchScanDone: (n) => `${n} produits analysés.`,
  searchScanMore: (done, remaining) => `${done} analysés. Cliquez de nouveau sur Analyser pour ${remaining} de plus.`,
  tileCommission: (amount) => `${amount}/vente`,
  tileCampaign: "Campagne",
  tileProvenEarner: "Déjà rentable",
  tileInfluencer: (n) => `${n} vidéos d'infl.`,
  searchOverlayActive: "L'overlay de recherche est actif.",

  breakEvenMath: "Calcul du seuil de rentabilité",
  noPriceForMath: "Aucun prix trouvé sur cette page, donc aucun calcul à faire.",
  calcIntro:
    "Combien de ventes remboursent le temps passé à filmer une vidéo. Cela suppose que le produit est gratuit (Creator Connections) ou que vous le possédez déjà, pas que vous l'achetez.",
  commissionFromSiteStripe: (pct) => `Taux de commission ${pct}% lu en direct de votre barre SiteStripe.`,
  commissionFromRateCard: (pct, category) =>
    `Taux de ${pct}% pour "${category}" selon la grille Amazon Associates.`,
  commissionFromRateCardDefault: (pct) =>
    `Taux general de ${pct}% (autres categories) selon la grille Amazon Associates.`,
  fieldCommissionRate: "Taux de commission (%)",
  fieldHourlyRate: "Votre tarif horaire ($)",
  fieldMinutesFilmEdit: "Minutes pour filmer + monter",
  fieldViewsPerMonth: "Vues estimées par mois",
  calcEstimatesNote:
    "Estimations seulement. Le profit mensuel suppose que le carrousel répartit les vues également entre les vidéos d'influenceurs.",
  kvCommissionPerSale: "Commission par vente",
  kvTimeToFilm: (minutes, hourly) => `Votre temps de tournage (${minutes} min à ${hourly}/h)`,
  kvSalesToEarnBack: "Ventes pour rembourser",
  kvViewsForSales: "Vues pour ces ventes",
  kvProfitPerMonth: "Profit estimé par mois",
  notApplicable: "n/d",
  bePurchasedHeading: "Seuil de rentabilité si acheté",
  bePurchasedNote:
    "Si vous achetez le produit vous-même, voici ce qu'il faut pour récupérer le prix d'achat plus votre temps de tournage.",
  beTimeHeading: "Rentabilité du temps investi",
  beTimeNote:
    "Suppose que le produit est gratuit (un cadeau Creator Connections ou un que vous possédez déjà) : combien de ventes récupèrent seulement votre temps de tournage.",
  beAdjustAssumptions: "Ajuster les hypothèses",
  kvPurchasePrice: "Prix d'achat",
  kvTotalToEarnBack: "Temps + achat à récupérer",

  storefrontCheckup: "Bilan du storefront",
  sfFastScanNote:
    "Analyse rapide de tout votre storefront via le flux d'Amazon: sans défilement, sans charger d'images. Les cases ci-dessous ajoutent des vérifications approfondies plus lentes qui ouvrent chaque élément.",
  sfDeepContent: "Analyser aussi les étiquettes des photos et listes",
  sfCheckAvailability: "Vérifier la disponibilité du produit (ouvre chaque produit)",
  sfParentAsins: "Résoudre les ASIN parents (ouvre chaque produit)",
  sfCreatorApiEnrich: "Enrichir avec la Creator API (titre, prix, disponibilité en direct)",
  sfEnrichingProducts: (done, total) => `Enrichissement des produits via la Creator API... ${done} sur ${total}`,
  sfCreatorApiNote:
    "Connectez la Creator API dans les Paramètres pour ajouter les titres, prix et la disponibilité en direct des produits. Exporté sans cela pour l'instant.",
  sfCreatorApiLocked:
    "Connectez la Creator API dans les Paramètres pour enrichir avec les titres, prix et la disponibilité en direct des produits.",
  sfCheckButton: "Vérifier mon storefront",
  sfStop: "Arrêter",
  sfRescan: "Réanalyser",
  sfScanningFeed: "Analyse du flux...",
  sfScanningProgress: (items, pages) => `Analyse du flux... ${items} éléments sur ${pages} pages`,
  sfOpeningPhotos: (done, total) => `Ouverture des photos et listes... ${done} sur ${total}`,
  sfOpeningProducts: (done, total) => `Ouverture des produits... ${done} sur ${total}`,
  sfEtaMinLeft: (min) => ` (environ ${min} min restantes)`,
  sfCheckedFirst: (cap) => `Les ${cap} premiers produits vérifiés (le storefront en a plus).`,
  sfScanFailed: "L'analyse a échoué. Rechargez l'onglet du storefront et réessayez.",
  sfStopped: "Arrêté.",
  sfDone: (items, pages, capped) =>
    `Terminé: ${items} éléments sur ${pages} pages${capped ? " (flux limité)" : ""}.`,
  sfLabelVideos: "vidéos",
  sfLabelPhotos: "photos",
  sfLabelIdeaLists: "listes d'idées",
  sfLabelMediaLists: "listes de médias",
  chipUntagged: (n) => `${n} sans étiquettes`,
  chipOverTagged: (n) => `${n} sur-étiquetées`,
  sfUniqueProducts: (n) => `${n} produits uniques`,
  sfUnavailable: (n) => `${n} indisponibles`,
  sfNoTaggedEarns: "Aucun produit étiqueté, donc ne rapporte rien.",
  sfUnavailableProduct: (asin) => `Produit indisponible ${asin}`,
  sfTaggedUnavailable: "Le produit étiqueté n'est plus disponible.",
  sfUntaggedHeading: (n) => `Contenu sans étiquettes (${n})`,
  sfOverTaggedHeading: (n) => `Contenu sur-étiqueté (${n})`,
  sfUnavailableHeading: (n) => `Produits indisponibles (${n})`,
  sfOverTaggedCount: (n) => `${n} produits étiquetés`,
  sfOverTaggedDetail: "Étiqueter trop de produits sur une publication dilue chaque lien.",
  sfAndMore: (n) => `et ${n} de plus: voir l'export CSV`,
  sfNoIssues: "Aucun problème d'étiquette ou de disponibilité trouvé.",
  sfExportCsv: "Exporter les résultats (CSV)",
  sfOpen: "Ouvrir",

  contentGapsHeading: "Manques de contenu dans vos commandes",
  contentGapsIntro: (n) =>
    `${n} produits sur cette page. Analysez pour trouver ceux avec peu ou zéro vidéos d'influenceurs: des produits que vous possédez et pouvez filmer aujourd'hui.`,
  scanTheseOrders: (n) => `Analyser ces commandes (jusqu'à ${n})`,
  checkingOrder: (i, n) => `Vérification ${i} sur ${n}...`,
  gapNoVideos: "Aucune vidéo: grand ouvert",
  gapNoCarousel: "Aucun carrousel superieur",
  gapNoInfluencer: "Pas encore de vidéos d'influenceurs",
  gapFewInfluencer: (n) => `Seulement ${n} vidéo${n === 1 ? "" : "s"} d'influenceurs`,
  openProduct: "Ouvrir le produit",
  badgeNoVideos: "Aucune vidéo",
  badgeNoCarousel: "Aucun carrousel superieur",
  badgePending: (n) => `${n} vidéos (visitez pour classer)`,
  badgeNoInfluencer: "Pas de vidéos d'influenceurs",
  badgeInfluencerVideos: (n) => `${n} vidéos d'influenceurs`,
  rescan: "Réanalyser",
  scanStopped: "Analyse arrêtée.",
  gapsFound: (n) => `Terminé: ${n} manque${n === 1 ? "" : "s"} de contenu trouvé${n === 1 ? "" : "s"}. Filmez ce que vous avez déjà.`,
  noGaps: "Terminé: aucun manque de contenu dans ces commandes.",
  gapCheckNext: (next, remaining) => `Vérifier les ${next} suivants (${remaining} restants)`,
  gapFilterNoCc: "Uniquement sans campagne Creator Connections",
  gapFilterNoCarousel: "Uniquement sans carrousel superieur",
  gapExportCsv: "Exporter les manques CSV",

  ordersButler: "Orders Butler",
  ordersButlerIntro:
    "Importez tout votre historique de commandes Amazon dans votre tableau de bord, comme le runner de bureau. Il utilise le compte Amazon dans lequel ce navigateur est connecté, donc il fonctionne sur un compte que vous gérez (par exemple celui d'un proche) simplement en vous connectant ici d'abord.",
  scopeLabel: "Portée: ",
  scopeNew: "Seulement les nouvelles depuis la dernière fois",
  scopeAll: "Toutes les années (rattrapage complet)",
  syncMyOrders: "Synchroniser mes commandes",
  syncAgain: "Synchroniser à nouveau",
  reauthPrompt: "Amazon a besoin que vous vous connectiez. Connectez-vous dans cet onglet, puis ",
  resume: "Reprendre",
  waitingForSignin: "En attente de la connexion Amazon...",
  harvestReading: (year, page, orders) => `Lecture ${year}, page ${page} (${orders} commandes jusqu'ici)...`,
  harvestStopped: (items, orders) => `Arrêté. ${items} articles de ${orders} commandes synchronisés jusqu'ici.`,
  harvestUpToDate: (items, orders) => `À jour. ${items} nouveaux articles de ${orders} commandes synchronisés.`,
  harvestDone: (items, orders) => `Terminé. ${items} articles de ${orders} commandes synchronisés avec votre tableau de bord.`,
  harvestNoOrders: "Terminé. Aucune commande trouvée sur ce compte.",
  dateUnknown: "date inconnue",
  plusMore: (n) => ` +${n} de plus`,

  updateVideoCounts: "Mettre à jour le nombre de vidéos d'influenceurs",
  updateVideoCountsIntro:
    "Vérifiez combien de vidéos d'influenceurs chaque produit que vous avez commandé possède déjà. Chaque produit s'ouvre brièvement en arrière-plan pour charger la répartition exacte des créateurs, puis se ferme. Cela peut prendre un moment pour un long historique : laissez cet onglet ouvert pendant l'exécution.",
  updateVideoCountsAgain: "Mettre à jour à nouveau",
  countPreparing: "Récupération de vos produits commandés...",
  countChecking: (index, total, title) => `Vérification de ${index} sur ${total} : ${title}...`,
  countDone: (updated, noInfluencer) =>
    `Terminé. ${updated} produit${updated === 1 ? "" : "s"} mis à jour, ${noInfluencer} sans vidéo d'influenceur pour l'instant.`,
  countStopped: (updated) => `Arrêté. ${updated} produit${updated === 1 ? "" : "s"} mis à jour jusqu'ici.`,
  countNoOrders: "Aucune commande à vérifier pour l'instant. Lancez d'abord \"Synchroniser mes commandes\".",
  countNoInfluencer: "Aucune vidéo d'influenceur",
  countInfluencerN: (n) => `${n} vidéo${n === 1 ? "" : "s"} d'influenceurs`,
  countPending: "Nombre non disponible",

  campaigns: "Campagnes",
  noCampaign: "Aucune campagne Creator Connections ou SPCC trouvée pour ce produit.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  campaignAcceptNote: "Acceptez-la depuis la section Send to your butler app ci-dessous (l'app confirme et accepte).",
  dealAvailable: "Offre disponible",
  dealPushNote: "Envoyez-la vers Daily Deals depuis la section Send to your butler app ci-dessous.",

  campaignMatcher: "Détecteur de campagnes",
  campaignMatcherIntro: (source) =>
    source === "storefront"
      ? "Trouvez quels produits taggés dans les vidéos de votre storefront ont une campagne Creator Connections ou SPCC ouverte à laquelle vous êtes éligible."
      : "Trouvez lesquels de vos produits commandés ont une campagne Creator Connections ou SPCC ouverte à laquelle vous êtes éligible.",
  campaignMatcherScan: "Trouver mes campagnes éligibles",
  campaignMatcherRescan: "Relancer",
  campaignMatcherScanning: "Vérification de vos produits...",
  campaignMatcherHarvesting: (n) => `Lecture de votre storefront... ${n} éléments`,
  campaignMatcherFailed: "Impossible de terminer l'analyse. Réessayez.",
  campaignMatcherNoProducts: "Aucun produit à vérifier.",
  campaignMatcherNoCatalogue: "Le catalogue des campagnes est en cours de téléchargement. Réessayez dans une minute.",
  campaignMatcherSignIn: "Connectez votre clé de licence dans le popup pour vérifier vos produits commandés.",
  campaignMatcherNone:
    "Aucun de ces produits n'a de campagne Creator Connections ou SPCC ouverte pour le moment.",
  campaignMatcherDone: (matches, total) =>
    `${matches} produits sur ${total} ont une campagne disponible.`,
  campaignMatcherAcceptedNote:
    "Un résultat signifie qu'une campagne est probablement disponible. L'app confirme chacune et ignore celles déjà acceptées.",
  campaignMatcherAcceptAll: (n) => `Envoyer les ${n} à l'app pour accepter`,
  campaignMatcherUpsell: "Ouvrez l'app de bureau pour accepter ces campagnes en un clic.",
  sumCampaignMatcher: "Détecteur de campagnes",

  sendToApp: "Envoyer à votre app butler",
  pushToDailyDeals: "Envoyer vers Daily Deals",
  sendToContentButler: "Envoyer à Content Butler",
  acceptCc: "Accepter la campagne CC",
  acceptSpcc: "Accepter la campagne SPCC",
  addToCollab: "Ajouter au Collaboration Tracker",
  addingCollab: "Ajout au Collaboration Tracker...",
  pushingDeals: "Envoi vers votre espace deals...",
  sendingContent: "Envoi à Content Butler...",
  checkingCc: "Vérification de Creator Connections...",
  checkingSpcc: "Vérification de Sponsored Products...",
  sentToApp: "Envoyé à votre app.",
  couldNotReachApp: "Impossible de joindre l'app. Est-elle toujours ouverte?",
  connectedToApp: (version) =>
    `Connecté à votre app Influencer Butler${version}. L'acceptation utilise votre catalogue Creator Connections local.`,
  upsellSignedIn:
    "Ouvrez l'app de bureau Influencer Butler pour envoyer ce produit vers vos Daily Deals, Content Butler et auto-accepter les campagnes.",
  upsellSignedOut:
    "Faites le reste avec l'app: envoyez ce produit vers Daily Deals avec votre modèle de publication et vos destinations sociales, envoyez-le à Content Butler et auto-acceptez les campagnes Creator Connections.",
  ctaOpenApp: "Ouvrir ou installer l'app",
  ctaStartTrial: "Démarrer votre essai gratuit",
  toolsAlwaysFree: "Les outils d'analyse ci-dessus sont toujours gratuits. L'app ajoute l'automatisation.",

  sfSendToRetag: (n) => `Envoyer ${n} problème(s) vers Retag Butler`,
  sfSendingToRetag: "Envoi vers Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Accepter toutes les campagnes disponibles (${n})`,
  sfAcceptingCampaigns: "Acceptation des campagnes dans l'app...",
  obSendToContentButler: (n) => `Envoyer ${n} produit(s) vers Content Butler`,
  obSendingToContentButler: "Envoi vers Content Butler...",
  obSentToContentButler: (n) => `${n} produit(s) envoyé(s) vers Content Butler.`,
  appBridgeHeading: "App de bureau",
  appBridgeBlurb:
    "Connectez l'app de bureau Influencer Butler pour accepter des campagnes et envoyer des produits à vos butlers directement depuis Amazon.",
  appConnect: "Connecter l'app de bureau",
  appEnterCode: "Saisissez le code à 6 chiffres affiché dans l'app de bureau:",
  appCodePlaceholder: "123456",
  appPairSubmit: "Associer",
  appConnected: "Connecté à l'app de bureau.",
  appUnpair: "Déconnecter l'app",
  appRequestingCode: "Demande d'un code à l'app...",
  appCodeShown: "L'app affiche un code à 6 chiffres. Saisissez-le ci-dessus.",
  appNotRunning: "L'app Influencer Butler n'est pas ouverte. Ouvrez-la et réessayez.",
  appCodeInvalid: "Saisissez les 6 chiffres affichés dans l'app.",
  appPairing: "Association...",
  appPaired: "Connecté. Vous pouvez maintenant envoyer des produits à l'app.",
  appPairFailed: "Cela n'a pas fonctionné. Cliquez sur Connecter pour réessayer.",

  nudgeCloseLabel: "Fermer",
  nudgeMaybeLater: "Plus tard",
  nudgeFbNotifTitle: "Rejoignez la communauté Influencer Butler",
  nudgeFbNotifBody:
    "Échangez des astuces avec d'autres Amazon Influencers et tirez le meilleur d'Influencer Butler. Cliquez pour rejoindre le groupe Facebook.",
  nudgeFbTitle: "Venez dire bonjour à la communauté",
  nudgeFbBody:
    "Vous utilisez Influencer Butler depuis un jour. Rejoignez notre groupe Facebook pour échanger des astuces avec d'autres Amazon Influencers et découvrir les nouveautés en premier.",
  nudgeFbJoin: "Rejoindre le groupe Facebook",
  nudgeAppNotifTitle: "Obtenez l'app de bureau Influencer Butler gratuite",
  nudgeAppNotifBody:
    "Automatisez les deals, le contenu et l'acceptation des campagnes depuis votre ordinateur. Cliquez pour la télécharger gratuitement pour Windows ou Mac.",
  nudgeAppTitle: "Prêt pour l'app de bureau?",
  nudgeAppBody:
    "L'app de bureau fait le gros du travail: envoyez des produits vers Daily Deals, transmettez-les à Content Butler et auto-acceptez les campagnes Creator Connections.",
  nudgeAppFree: "Elle est gratuite à télécharger et fonctionne avec cette extension.",
  nudgeAppDownloadWindows: "Télécharger pour Windows",
  nudgeAppDownloadMac: "Télécharger pour Mac",
  nudgeAppDownloadGeneric: "Télécharger l'app de bureau",
  nudgeAppIntelMac: "Vous utilisez un Mac Intel?",

  watchlist: "Liste de suivi",
  watchlistIntro:
    "Recevez une alerte du navigateur quand ce produit est de nouveau en stock, qu'un créneau vidéo d'influenceur se libère, ou que le prix baisse.",
  watchAdd: "Suivre ce produit",
  watchRemove: "Ne plus suivre",
  watchAdded: "Ajouté à votre liste de suivi. Nous vous alerterons en cas de changement.",
  watchRemoved: "Retiré de votre liste de suivi.",
  watchAtCap: (n) => `Votre liste de suivi est pleine (${n}). Retirez-en un d'abord.`,
  watchStar: "★",
  watchOn: "Suivi",
  watchAddShort: "Suivre",
  watchNotifTitle: "Alerte de suivi Influencer Butler",
  watchNotifBackInStock: (name) => `${name} est de nouveau en stock.`,
  watchNotifSlotOpens: (name, videos) =>
    `Un créneau vidéo s'est libéré sur ${name} (maintenant ${videos} vidéos d'influenceurs).`,
  watchNotifPriceDrop: (name) => `Le prix a baissé sur ${name}.`,
  popupWatchlistHeading: "Liste de suivi",
  popupWatchlistEmpty: "Aucun produit suivi pour l'instant. Ouvrez un produit et cliquez sur Suivre.",
  watchCondBackInStock: "De retour en stock",
  watchCondSlotOpens: "Créneau vidéo libre",
  watchCondPriceDrop: "Baisse de prix",
  watchRemoveShort: "Retirer",
};

export type Locale = "en" | "es" | "fr";

export const CATALOG: Record<Locale, Dict> = { en, es, fr };
