// Translation catalog for every user-facing string in the extension: the
// popup and all the in-page panels. Brand and feature names (Influencer
// Butler, Butler Approved, Orders Butler, Content Butler, Deals Butler, Creator
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
  // Ownership badge: "you already own this / you already posted this", read from
  // the desktop Orders Butler + content-coverage over the bridge.
  ownedTitle: string;
  ownedNote: string;
  ownedBought: (year: number) => string;
  ownedPaid: (price: string) => string;
  ownedPostedChip: string;
  ownedPostedSummary: (platforms: string) => string;
  ownedGridOwned: string;
  ownedGridPosted: string;
  priceHistoryTitle: string;
  priceHistoryNow: (amount: string) => string;
  priceHistoryLow: (amount: string) => string;
  priceHistoryLowest: string;
  priceHistoryNote: string;
  priceHistoryDesktopNote: string;
  bsrHistoryTitle: string;
  bsrHistoryNow: (rank: string) => string;
  bsrHistoryBest: (rank: string) => string;
  salesEstTitle: string;
  salesEstValue: (n: string) => string;
  salesEstModeled: string;
  salesEstCalibrated: string;
  boughtPastMonthChip: (n: string) => string;
  // Local BSR-derived estimates on the product panel, with exact labels matching
  // the desktop app. Honest tooltips: these are estimates, not reported figures.
  estUnitsLabel: string;
  estRevenueLabel: string;
  estUnitsTip: string;
  estRevenueTip: string;
  marketPoolNote: string;
  shotListTitle: string;
  shotListShowFeatures: string;
  shotListBeatHook: string;
  shotListBeatUnbox: string;
  shotListBeatUse: string;
  shotListBeatResult: string;
  shotListBeatCta: string;
  shotListBeatFtc: string;

  // Inline card at the buybox
  inlineCardTitle: string;
  inlineAvailabilityHeading: string;
  inlineInStock: string;
  inlineUnavailable: string;
  inlineNotListed: string;
  inlineConnectCreatorApi: string;

  // Popup: static chrome
  tagFree: string;
  // Left-hand section nav labels for cards whose headings are set in JS.
  navUpdate: string;
  navWhatsNew: string;
  navAiAssistant: string;
  navDeals: string;
  navLinkButler: string;
  // Short labels for the Settings sub-nav in the left rail. The full section
  // headings (groupAmazon*) are too long for the narrow rail and wrapped; these
  // keep each sub-item on one line.
  navGrpWalmart: string;
  navGrpCross: string;
  navGrpProduct: string;
  navGrpResearch: string;
  navGrpCampaigns: string;
  navGrpEarnings: string;
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
  syncDashboardHint: string;
  contributeToggleLabel: string;
  contributeBlurb: string;
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
  groupWalmart: string;
  groupCrossPlatform: string;
  groupAmazonProduct: string;
  groupAmazonResearch: string;
  groupAmazonCampaigns: string;
  groupAmazonEarnings: string;
  toolWalmart: string;
  toolWalmartHint: string;
  toolVideoCounts: string;
  toolVideoLandscape: string;
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
  // Upper/lower split view + the upper influencer slot indicator.
  carouselReading: (label: string) => string;
  upperSlotOn: string;
  upperSlotOff: string;
  upperSlotChecking: string;
  upperSlotUnknown: string;
  upperSlotInfo: string;
  influencerFallback: string;
  influencerVideosLabel: (n: number) => string;
  influencerVideosMore: (n: number) => string;

  // Video competition: full video sweep (harvest every video)
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

  // Video landscape (aggregate competitor-parity stats)
  videoLandscape: string;
  lsStatKnown: string;
  lsStatPlaced: string;
  lsStatCreators: string;
  lsStatRepeat: string;
  lsContentMixLabel: string;
  lsConcentrationLabel: string;
  lsConcentrationShare: (pct: number) => string;
  lsTopStrengthLabel: string;
  lsUpper: string;
  lsLower: string;
  lsPulseLabel: (dated: number, total: number) => string;
  lsNewIn30: (n: number) => string;
  lsDatesUnavailable: string;
  lsTypicalLengthLabel: string;
  lsLengthBand: (median: string, low: string, high: string) => string;
  lsLengthMedian: (median: string) => string;
  lsDurationsUnavailable: string;

  // Per-video passport (longitudinal placement history)
  passportOpen: string;
  passportClose: string;
  passportLoading: string;
  passportUnidentified: string;
  passportUnavailable: string;
  passportNoData: string;
  passportNoDataDay: string;
  passportCollecting: (days: number) => string;
  passportSinceFirstSeen: (date: string) => string;
  passportPresence: string;
  passportStability: string;
  passportStrength: string;
  passportReach: string;
  passportActiveDays: string;
  passportUpperLower: (upper: number, lower: number) => string;
  passportCurrentSnapshot: string;
  passportLastObserved: (date: string) => string;

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
  sortRevenue: string;
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
  tileCampaignRate: (pct: number) => string;
  tileProvenEarner: string;
  tileEarned: (money: string) => string;
  tileInfluencer: (n: number) => string;
  tileApproved: string;
  tileLikelyFit: string;
  tileDeal: string;
  tileCoupon: string;
  // Estimated monthly revenue (modeled sales x price) and best-seller rank,
  // shown per search tile from the shared catalogue. Revenue tooltip reuses
  // salesEstModeled / salesEstCalibrated.
  tileRevenue: (money: string) => string;
  tileBsr: (rank: string, category: string | null) => string;
  // Estimated monthly units per tile (value + unit; the label lives in the chip
  // tooltip, matching tileRevenue).
  tileEstUnits: (n: string) => string;
  // Per-tile action menu (the "..." button on a search card).
  tileMenuLabel: string;
  tileMenuAddToList: string;
  tileMenuNewList: string;
  tileMenuNewListPlaceholder: string;
  tileMenuCreate: string;
  tileMenuAddedTo: (name: string) => string;
  tileMenuListFull: string;
  tileMenuListsCapped: string;
  tileMenuCopyLink: string;
  tileMenuCopied: string;
  tileMenuLinkFailed: string;
  tileMenuOpenPage: string;
  tileMenuAppLocked: string;
  tileMenuWorking: string;
  // Product-page "Add to list" panel (incl. Add all variations).
  listPanelHeading: string;
  listPanelIntro: string;
  listPanelNewOption: string;
  listPanelAddProduct: string;
  listPanelAddVariations: (n: number) => string;
  listPanelAddedCount: (n: number, name: string) => string;
  listPanelNothingNew: string;
  searchEnriching: (done: number, total: number) => string;
  searchEnrichPaused: string;
  searchOverlayActive: string;

  // Trend Radar (Best Sellers / New Releases / Movers & Shakers grids)
  toolTrendRadar: string;
  sumTrendRadar: string;
  trendRadarActive: string;
  toolIdeaList: string;
  sumIdeaList: string;
  ideaListActive: string;
  toolDealsOverlay: string;
  sumDealsOverlay: string;
  dealsOverlayActive: string;
  trendCount: (n: number) => string;
  trendSortTrending: string;
  trendSortRank: string;
  trendFewVideosOnly: string;
  tileRank: (n: number) => string;
  tileGain: (pct: number) => string;

  // Global Marketplace Maximizer (product page section)
  toolGlobalMaximizer: string;

  // Brand-store overlay (/stores/ pages)
  toolStoreOverlay: string;
  sumStoreOverlay: string;
  storeOverlayActive: string;
  storeCount: (n: number) => string;
  storeCandidates: (n: number) => string;
  storeCandidatesOnly: string;
  storeEnriching: (done: number, total: number) => string;
  storeEnrichPaused: string;
  tileVideos: (n: number) => string;
  tileHeroSlot: string;
  tileNoCarousel: string;

  // Earnings overlay (storefront/Curations badges + breakdown popup)
  sumEarningsOverlay: string;
  toolEarningsOverlay: string;
  earnBadgeTitle: string;
  earnDetailTitle: string;
  earnByStore: string;
  earnByYear: string;
  earnByMonth: string;
  earnCampaigns: string;
  earnOnsite: string;
  earnOffsite: string;
  earnScopeThisMarket: string;
  earnScopeAllStores: string;
  earnUnits: (n: number) => string;
  earnOrders: (n: number) => string;
  earnRate: (pct: number) => string;
  earnClicks: (n: number) => string;
  earnViewBreakdown: string;
  earnNoBreakdown: string;
  earnClose: string;

  // Video Money (Creator Hub "Manage videos" list: per-row badges + reshoot panel)
  sumVideoMoney: string;
  vmPanelTitle: string;
  vmVideoCount: (n: number) => string;
  vmEarnedTitle: string;
  vmEpv: (money: string) => string;
  vmProjected: (money: string) => string;
  vmRateLive: (pct: number) => string;
  vmRateEnding: (pct: number) => string;
  vmBought: (n: number) => string;
  vmCoolingChip: string;
  vmProjectionNote: string;
  vmTopEarners: string;
  vmBestEpv: string;
  vmReshoot: string;
  vmReshootHint: string;
  vmDrafts: string;
  vmDraftsHint: string;
  vmCooling: string;
  vmCoolingHint: string;
  vmExport: string;

  // Campaign Radar (Creator Connections campaign grid)
  sumCampaignRadar: string;
  toolCampaignRadar: string;
  campaignRadarActive: string;
  radarCount: (n: number) => string;
  radarMinCommission: string;
  radarMinDays: string;
  radarMinBudget: string;
  radarOnlyPassing: string;
  radarSortLabel: string;
  radarSortScore: string;
  radarSortRate: string;
  radarSortDays: string;
  radarSortRelevance: string;
  radarChipOwned: string;
  radarChipEarner: string;
  radarChipEnded: string;
  radarChipCc: string;
  radarChipSpcc: string;
  radarAvailChip: (code: string, status: "available" | "unavailable" | "unknown") => string;
  radarAvailTitle: (code: string, status: "available" | "unavailable" | "unknown") => string;
  // Creator saturation: total videos already on a campaign product.
  radarVideoChip: (n: number) => string;
  radarVideoTitle: string;
  popupAvailabilityLabel: string;
  popupAvailabilityHint: string;
  popupAvailabilityAuDenied: string;

  // Last Call Butler: campaign fill meter + watch bell + alerts
  lastCallWatch: string;
  lastCallWatching: string;
  lastCallFull: string;
  lastCallFillUnknown: string;
  lastCallFillLabel: (pct: number, filled: number, total: number) => string;
  lastCallCampaignFallback: string;
  lastCallNotifTitle: string;
  lastCallNotifNearFull: (name: string, pct: number) => string;
  lastCallNotifFilled: (name: string) => string;

  // Campaign Butler: "The Butler's Brief" per-campaign advisory panel
  campaignBriefButton: string;
  campaignBriefTitle: string;
  campaignBriefLoading: string;
  campaignBriefConfidence: (n: number) => string;
  campaignBriefWhy: string;
  campaignBriefFilm: string;
  campaignBriefPick: string;
  campaignBriefPickEst: (units: string, revenue: string) => string;
  campaignBriefSaturation: (n: number) => string;
  campaignBriefOnAmazon: string;
  campaignBriefOffAmazon: string;
  campaignBriefAudience: string;
  campaignBriefAccept: string;
  campaignBriefCopy: string;
  campaignBriefCopied: string;
  campaignBriefClose: string;
  campaignBriefError: string;
  campaignBriefConnectHint: string;
  campaignBriefKeyErrorHint: string;
  campaignBriefConnectBtn: string;
  campaignBriefOpenSettingsBtn: string;
  campaignBriefVerdictHot: string;
  campaignBriefVerdictWarm: string;
  campaignBriefVerdictCool: string;

  // Campaign detail overlay (single-campaign /p/connect/request page)
  sumCampaignDetail: string;
  campaignDetailTitle: string;
  campaignDetailProducts: string;
  campaignDetailNoProducts: string;
  campaignDetailNoData: string;
  campaignDetailBought: (n: number) => string;

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
  kvRoiPerMinute: string;
  perMinuteSuffix: string;
  roiPerMinuteNote: string;
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
  sfCoverage: (items: number, reported: number) => string;
  sfStoppedEarly: (reason: string) => string;
  sfDroppedCards: (n: number) => string;
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
  ofrEarnedChip: (amount: string) => string;
  ofrFilmFirst: string;
  ofrCoverage: (covered: number, total: number) => string;
  ofrGaps: (n: number) => string;
  ofrEarningGaps: (n: number) => string;
  countInfluencerN: (n: number) => string;
  countPending: string;

  // Campaigns panel
  campaigns: string;
  noCampaign: string;
  ccAvailable: string;
  spccAvailable: string;
  ccNotAvailable: string;
  spccNotAvailable: string;
  enrolledCc: string;
  enrolledSpcc: string;
  enrolledRate: (pct: number) => string;
  epc: (money: string) => string;
  campaignConnectNote: string;
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
  // Search/deals toolbar: batch-send the page's discounted tiles to the desktop
  // Deals Butler.
  searchSendDeals: string;
  searchNoDeals: string;
  searchSendingDeals: (n: number) => string;
  sendToContentButler: string;
  saveToLinkButler: string;
  savingLink: string;
  acceptCc: string;
  acceptSpcc: string;
  addToCollab: string;
  addingCollab: string;
  pitchThisBrand: (brand: string) => string;
  pitchingBrand: string;
  generatePhoto: string;
  generatingPhoto: string;
  requestSample: string;
  requestingSample: string;
  addToIdeaList: string;
  addingToIdeaList: string;
  ideaListNewListOption: string;
  tileMenuAddToIdeaList: string;
  pushingDeals: string;
  sendingContent: string;
  checkingCc: string;
  checkingSpcc: string;
  sentToApp: string;
  couldNotReachApp: string;
  connectAppToPair: string;
  connectedToApp: (version: string) => string;
  upsellSignedIn: string;
  upsellSignedOut: string;
  ctaOpenApp: string;
  ctaStartTrial: string;
  toolsAlwaysFree: string;

  // Desktop-app hand-offs: storefront -> Retag Butler + batch campaign accept,
  // orders -> Content Butler planner, and the popup pairing flow.
  sfSendToRetag: (n: number) => string;
  sfSendToContent: (n: number) => string;
  sfSendingToContent: string;
  sfSendingToRetag: string;
  sfAcceptAllCampaigns: (n: number) => string;
  sfAcceptingCampaigns: string;
  obSendToContentButler: (n: number) => string;
  obSendingToContentButler: string;
  obSentToContentButler: (n: number) => string;
  appBridgeHeading: string;
  appBridgeBlurb: string;
  appNextStepHint: string;
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
  nudgeFbReport: string;
  nudgeAppNotifTitle: string;
  nudgeAppNotifBody: string;
  nudgeAppTitle: string;
  nudgeAppBody: string;
  nudgeAppFree: string;
  nudgeAppDownloadWindows: string;
  nudgeAppDownloadMac: string;
  nudgeAppDownloadGeneric: string;
  nudgeAppIntelMac: string;
  // Day-5 community notice: warm invite plus a firm "the group is not for bug
  // reports, use Feedback Butler" message the user must acknowledge.
  nudgeCommunityNotifTitle: string;
  nudgeCommunityNotifBody: string;
  nudgeCommunityTitle: string;
  nudgeCommunityBody: string;
  nudgeCommunityNote: string;
  nudgeCommunityUnderstand: string;
  nudgeCommunityReport: string;

  // Extension self-update banner (on-page pill) and the popup's update card.
  updateBannerTitle: string;
  updateBannerBody: (version: string) => string;
  updateNow: string;
  updateRemindLater: string;
  updateAppliedTitle: string;
  updateRefreshBody: string;
  updateRefreshBtn: string;
  updatePopupHeading: string;
  updatePopupBody: (current: string, available: string) => string;

  // Post-update "What's New" notice (on-page corner card + popup card).
  whatsNewTitle: string;
  whatsNewFeaturesHeading: string;
  whatsNewFixesHeading: string;
  whatsNewReportedHeading: string;
  whatsNewOtherHeading: string;
  whatsNewDismiss: string;

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
  popupListsHeading: string;
  popupListsEmpty: string;
  popupListItems: (n: number) => string;
  popupListDelete: string;
  watchCondBackInStock: string;
  watchCondSlotOpens: string;
  watchCondPriceDrop: string;
  watchRemoveShort: string;

  // Storefront auto-detect toast: shown once when we read the creator's own
  // /shop/<handle> off their Creator Hub and fill the empty storefront setting.
  storefrontDetectedTitle: string;
  storefrontDetectedBody: (handle: string) => string;

  // First-run walkthrough (the onboarding page) + the "replay" launcher.
  obReplayLink: string;
  obTitle: string;
  obProgress: (current: number, total: number) => string;
  obBack: string;
  obNext: string;
  obSkip: string;
  obFinish: string;
  obWelcomeTitle: string;
  obWelcomeBody: string;
  obWelcomePin: string;
  obAccountTitle: string;
  obAccountBody: string;
  obAccountConnected: (email: string) => string;
  obAccountSkipHint: string;
  obStorefrontTitle: string;
  obStorefrontBody: string;
  obStorefrontAuto: string;
  obStorefrontDetected: (handle: string) => string;
  obToolsTitle: string;
  obToolsBody: string;
  obAppTitle: string;
  obAppBody: string;
  obAppSkipHint: string;
  obDoneTitle: string;
  obDoneBody: string;
  obDoneHelp: string;
  obDoneDashboard: string;
  obDoneClose: string;

  // Settings sync with the paired desktop app (popup card + walkthrough +
  // "are you sure" reconcile confirm).
  syncTitle: string;
  syncBlurb: string;
  syncNow: string;
  syncChecking: string;
  syncInSync: string;
  syncNotPaired: string;
  syncAppOutdated: string;
  syncFilled: (n: number) => string;
  syncFailed: string;
  syncConfirmTitle: string;
  syncConfirmBody: (n: number) => string;
  syncConfirmList: string;
  syncConfirmAppWins: string;
  syncConfirmExtWins: string;
  syncCancel: string;
  syncDone: string;
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
  ownedTitle: "You own this",
  ownedNote: "This product is in your order history.",
  ownedBought: (year) => `Bought in ${year}`,
  ownedPaid: (price) => `Paid ${price}`,
  ownedPostedChip: "Already posted",
  ownedPostedSummary: (platforms) => `Already shared on ${platforms}`,
  ownedGridOwned: "Owned",
  ownedGridPosted: "Posted",
  priceHistoryTitle: "Price history",
  priceHistoryNow: (amount) => `Now ${amount}`,
  priceHistoryLow: (amount) => `Low ${amount}`,
  priceHistoryLowest: "Lowest yet",
  priceHistoryNote: "Prices seen since you started browsing with the extension.",
  priceHistoryDesktopNote: "Full history from your Influencer Butler app.",
  bsrHistoryTitle: "Sales rank history",
  bsrHistoryNow: (rank) => `Now #${rank}`,
  bsrHistoryBest: (rank) => `Best #${rank}`,
  salesEstTitle: "Estimated monthly sales",
  salesEstValue: (n) => `~${n}/mo`,
  salesEstModeled: "Modeled from best-seller rank",
  salesEstCalibrated: "Calibrated from real data",
  boughtPastMonthChip: (n) => `${n}+ bought/mo`,
  estUnitsLabel: "Est. units/mo",
  estRevenueLabel: "Est. revenue/mo",
  estUnitsTip:
    "Estimated monthly units, modeled from the product's Best Sellers Rank. An estimate, not a reported figure.",
  estRevenueTip:
    "Estimated monthly revenue (estimated units times price). An estimate, not a reported figure.",
  marketPoolNote: "From the shared Influencer Butler catalogue.",
  shotListTitle: "Shot list",
  shotListShowFeatures: "Show these features on camera:",
  shotListBeatHook: "Hook in the first 3 seconds: the result or the problem it solves",
  shotListBeatUnbox: "Show the packaging and what is in the box",
  shotListBeatUse: "Demonstrate it in real use, not just held up to the camera",
  shotListBeatResult: "Show the before and after, or the end result",
  shotListBeatCta: "Clear call to action: send viewers to your storefront link",
  shotListBeatFtc: "Add your FTC disclosure on screen and in the caption (#ad, #CommissionsEarned)",

  inlineCardTitle: "Product intel",
  inlineAvailabilityHeading: "Market availability",
  inlineInStock: "in stock",
  inlineUnavailable: "unavailable",
  inlineNotListed: "not listed",
  inlineConnectCreatorApi: "Connect the Creator API for live cross-country availability",

  tagFree: "Free",
  navUpdate: "Update",
  navWhatsNew: "What's new",
  navAiAssistant: "AI Assistant",
  navDeals: "Deal Harvester",
  navLinkButler: "Link Butler",
  navGrpWalmart: "Walmart",
  navGrpCross: "Cross-platform",
  navGrpProduct: "Product pages",
  navGrpResearch: "Research",
  navGrpCampaigns: "Campaigns",
  navGrpEarnings: "Earnings",
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
  syncDashboardHint:
    "Findings upload to your web dashboard on their own. No desktop app is needed for this.",
  contributeToggleLabel: "Contribute to the shared product catalogue",
  contributeBlurb:
    "Off by default. When on, product facts you already see (price, best-seller rank, bought-past-month, category) and which creator videos are placed on a product's carousel are pooled, never personal data, so everyone sees real demand, price history, and video competition over time.",
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
  groupWalmart: "Walmart",
  groupCrossPlatform: "Amazon & Walmart",
  groupAmazonProduct: "Amazon: product pages",
  groupAmazonResearch: "Amazon: research & discovery",
  groupAmazonCampaigns: "Amazon: campaigns & storefront",
  groupAmazonEarnings: "Amazon: earnings & alerts",
  toolWalmart: "Walmart support",
  toolWalmartHint:
    "Turns on money signals and overlays on Walmart.com. Search results overlay (below) also works on Walmart grids.",
  toolVideoCounts: "Video counts",
  toolVideoLandscape: "Video landscape",
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

  openAmazonToStart: "Open an Amazon or Walmart product page, your orders, or your storefront to get started.",
  noToolsOnPage: "This Amazon page has no butler tools. Try a product page.",
  productToolsActive: "Product page tools are active.",
  orderScanReady: "Order history scan is ready.",
  storefrontCheckupReady: "Storefront checkup is ready.",
  uploadHelperReady: "Upload helper is ready.",
  reloadTabToActivate: "Reload this tab to activate the tools (the page was open before install).",
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
  carouselReading: (label) => `${label}: reading video data...`,
  upperSlotOn:
    "Upper influencer carousel: on. Influencer videos can land in the top slot by the image gallery.",
  upperSlotOff:
    "Upper influencer carousel: off. Influencer videos only appear in the lower rail on this listing.",
  upperSlotChecking: "Upper influencer carousel: checking...",
  upperSlotUnknown: "Upper influencer carousel: unknown",
  upperSlotInfo:
    "When a brand turns on the upper influencer carousel, a creator video can be placed right next to the image gallery - the best-earning video slot on the listing. Off means your video would only show in the lower Product Videos rail.",
  influencerFallback: "Influencer",
  influencerVideosLabel: (n) => `Influencer videos (${n})`,
  influencerVideosMore: (n) => `+${n} more`,

  deepScan: "Sweep every video",
  deepScanIntro:
    "Amazon only loads a handful of videos on screen. This sweep pages through the widget's own feed to classify every video it will serve, split by upper (brand hero) and lower (related) carousel.",
  deepScanRunning: (videos, pages) => `Harvesting: ${videos} videos over ${pages} pages...`,
  deepScanStop: "Stop",
  deepScanRescan: "Sweep again",
  deepScanDone: (classified, total) => `Classified ${classified} of ${total} videos.`,
  deepScanPartial:
    "Amazon served only part of the list, so this is a floor, not the full set.",
  deepScanNoEndpoint:
    "Scroll the Product Videos section into view once, then run the sweep so it can find the video feed.",
  deepScanStopped: "Sweep stopped.",
  upperCarousel: "Upper carousel (brand hero)",
  lowerCarousel: "Lower carousel (related)",
  estTotalVideos: (n) => `Est. total videos: ${n}`,
  allVideosLabel: (n) => `All harvested videos (${n})`,
  videoNoTitle: "Untitled video",
  videoExportCsv: "Export videos (CSV)",
  copySummary: "Copy summary",
  shareSummaryHeading: "Product video competition (via Influencer Butler)",
  shareTopCreators: "Top creators:",

  videoLandscape: "Video landscape",
  lsStatKnown: "Known videos",
  lsStatPlaced: "Currently placed",
  lsStatCreators: "Unique creators",
  lsStatRepeat: "Repeat creators",
  lsContentMixLabel: "Content mix by creator type",
  lsConcentrationLabel: "Creator concentration",
  lsConcentrationShare: (pct) => `Top 5 creators hold ${pct}% of the videos`,
  lsTopStrengthLabel: "Top videos by carousel position (proxy)",
  lsUpper: "Upper",
  lsLower: "Lower",
  lsPulseLabel: (dated, total) => `Publishing pulse (${dated} of ${total} dated)`,
  lsNewIn30: (n) => `${n} new in the last 30 days`,
  lsDatesUnavailable: "Publish dates are not exposed by this listing, so publishing cadence is unavailable.",
  lsTypicalLengthLabel: "Typical length",
  lsLengthBand: (median, low, high) => `Median ${median} (typical ${low} to ${high})`,
  lsLengthMedian: (median) => `Median ${median}`,
  lsDurationsUnavailable: "Video lengths are not exposed by this listing.",

  passportOpen: "Placement history",
  passportClose: "Hide history",
  passportLoading: "Loading placement history...",
  passportUnidentified: "This video cannot be tracked yet.",
  passportUnavailable: "Placement history is not available yet.",
  passportNoData: "No placement history recorded for this video yet.",
  passportNoDataDay: "no data",
  passportCollecting: (days) => `Collecting daily placement evidence: ${days} of 90 days recorded`,
  passportSinceFirstSeen: (date) => `since first seen ${date}`,
  passportPresence: "Presence rate",
  passportStability: "Placement stability",
  passportStrength: "Active-day strength",
  passportReach: "Product reach",
  passportActiveDays: "Days observed",
  passportUpperLower: (upper, lower) => `Upper ${upper}% / Lower ${lower}%`,
  passportCurrentSnapshot: "Current placement",
  passportLastObserved: (date) => `Last observed ${date}`,

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
  sortRevenue: "Estimated revenue",
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
  tileCampaignRate: (pct) => `Campaign ${pct}%`,
  tileProvenEarner: "Proven earner",
  tileEarned: (money) => `Earned ${money}`,
  tileInfluencer: (n) => `${n} infl. videos`,
  tileApproved: "Butler Approved",
  tileLikelyFit: "Likely fit",
  tileDeal: "Deal",
  tileCoupon: "Coupon",
  tileRevenue: (money) => `~${money}/mo`,
  tileBsr: (rank, category) => (category ? `#${rank} ${category}` : `#${rank}`),
  tileEstUnits: (n) => `~${n} units/mo`,
  tileMenuLabel: "More actions",
  tileMenuAddToList: "Add to list",
  tileMenuNewList: "New list",
  tileMenuNewListPlaceholder: "List name",
  tileMenuCreate: "Create",
  tileMenuAddedTo: (name) => `Saved to ${name}`,
  tileMenuListFull: "That list is full.",
  tileMenuListsCapped: "You have the maximum number of lists.",
  tileMenuCopyLink: "Copy link",
  tileMenuCopied: "Copied",
  tileMenuLinkFailed: "Could not build a link",
  tileMenuOpenPage: "Open product page",
  tileMenuAppLocked: "Open the app to send this product.",
  tileMenuWorking: "Working...",
  listPanelHeading: "Product lists",
  listPanelIntro: "Save this product (or all its variations) to one of your lists.",
  listPanelNewOption: "New list...",
  listPanelAddProduct: "Add this product",
  listPanelAddVariations: (n) => `Add all ${n} variations`,
  listPanelAddedCount: (n, name) => `Added ${n} to ${name}`,
  listPanelNothingNew: "Already in that list.",
  searchEnriching: (done, total) => `Checking details ${done}/${total}`,
  searchEnrichPaused: "Detail checks paused by Amazon, retrying later",
  searchOverlayActive: "Search overlay is active.",

  toolTrendRadar: "Trend Radar (Best Sellers & Movers)",
  sumTrendRadar: "Trend Radar",
  trendRadarActive: "Trend Radar is active.",
  toolIdeaList: "Idea List money signals",
  sumIdeaList: "Idea List overlay",
  ideaListActive: "Idea List signals are active.",
  toolDealsOverlay: "Today's Deals money signals",
  sumDealsOverlay: "Deals overlay",
  dealsOverlayActive: "Deals signals are active.",
  trendCount: (n) => `${n} products scored`,
  trendSortTrending: "Rising fastest",
  trendSortRank: "Best seller rank",
  trendFewVideosOnly: "Open video slot only",
  tileRank: (n) => `#${n}`,
  tileGain: (pct) => `▲ ${pct}%`,

  toolGlobalMaximizer: "Global reach (multi-marketplace)",

  toolStoreOverlay: "Brand store overlay",
  sumStoreOverlay: "Brand store overlay",
  storeOverlayActive: "Brand store overlay is active.",
  storeCount: (n) => `${n} products scored`,
  storeCandidates: (n) => `${n} green-boxed`,
  storeCandidatesOnly: "Best candidates only",
  storeEnriching: (done, total) => `Checking product pages ${done} of ${total}...`,
  storeEnrichPaused: "Amazon paused the checks. Reload the page later to finish.",
  tileVideos: (n) => `${n} videos`,
  tileHeroSlot: "Video slot",
  tileNoCarousel: "No carousel",

  sumEarningsOverlay: "Earnings overlay",
  toolEarningsOverlay: "Earnings overlay (storefront badges)",
  earnBadgeTitle: "What you have earned on this post. Click for the full breakdown.",
  earnDetailTitle: "Product earnings",
  earnByStore: "Earnings by store",
  earnByYear: "Earnings by year",
  earnByMonth: "Earnings by month",
  earnCampaigns: "Creator Connections campaigns",
  earnOnsite: "onsite",
  earnOffsite: "offsite",
  earnScopeThisMarket: "This marketplace",
  earnScopeAllStores: "All stores",
  earnUnits: (n) => `${n} unit${n === 1 ? "" : "s"}`,
  earnOrders: (n) => `${n} order${n === 1 ? "" : "s"}`,
  earnRate: (pct) => `rate ${pct}%`,
  earnClicks: (n) => `${n} click${n === 1 ? "" : "s"}`,
  earnViewBreakdown: "View breakdown",
  earnNoBreakdown: "Update the desktop app to see the store, year, month, and campaign breakdown.",
  earnClose: "Close",

  sumVideoMoney: "Video Money",
  vmPanelTitle: "Video Money",
  vmVideoCount: (n) => `${n} video${n === 1 ? "" : "s"}`,
  vmEarnedTitle: "Your real earnings from this video's product(s). Click for the breakdown.",
  vmEpv: (money) => `${money}/1k views`,
  vmProjected: (money) => `~${money} est.`,
  vmRateLive: (pct) => `Pays ${pct}% now`,
  vmRateEnding: (pct) => `${pct}% ending soon`,
  vmBought: (n) => `${n.toLocaleString()} bought/mo`,
  vmCoolingChip: "Demand cooling",
  vmProjectionNote: "Connect the desktop app to see real earnings. Showing projections for now.",
  vmTopEarners: "Top earners",
  vmBestEpv: "Best per view",
  vmReshoot: "Reshoot these",
  vmReshootHint: "Hot commission, low views",
  vmDrafts: "Finish your draft",
  vmDraftsHint: "Unpublished videos earn nothing",
  vmCooling: "Cooling / retire",
  vmCoolingHint: "Falling demand or ended campaign",
  vmExport: "Export CSV",

  sumCampaignRadar: "Campaign Radar",
  toolCampaignRadar: "Campaign Radar (highlight campaigns)",
  campaignRadarActive: "Campaign Radar is active.",
  radarCount: (n) => `${n} campaigns scored`,
  radarMinCommission: "Min rate (%)",
  radarMinDays: "Min days left",
  radarMinBudget: "Min budget ($)",
  radarOnlyPassing: "Only campaigns that pass",
  radarSortLabel: "Sort",
  radarSortScore: "Best match",
  radarSortRate: "Commission",
  radarSortDays: "Days left",
  radarSortRelevance: "Page order",
  radarChipOwned: "You own this",
  radarChipEarner: "You've earned on this",
  radarChipEnded: "Ended",
  radarChipCc: "CC eligible",
  radarChipSpcc: "SPCC eligible",
  radarAvailChip: (code, status) =>
    status === "available" ? `${code} ✓` : status === "unavailable" ? `${code} ✗` : `${code} ?`,
  radarAvailTitle: (code, status) =>
    status === "available"
      ? `Available to buy on the ${code} Amazon store`
      : status === "unavailable"
        ? `Not available to buy on the ${code} Amazon store`
        : `Could not check the ${code} Amazon store right now`,
  radarVideoChip: (n) => (n === 0 ? "No videos yet" : `${n} ${n === 1 ? "video" : "videos"}`),
  radarVideoTitle:
    "Creator videos already on this product. Fewer means less competition for the spot.",
  popupAvailabilityLabel: "Show availability for",
  popupAvailabilityHint:
    "Campaign Radar checks each campaign product against these countries' Amazon stores and shows a chip per country.",
  popupAvailabilityAuDenied:
    "Australia needs permission to read amazon.com.au. Allow it when Chrome asks, then try again.",

  lastCallWatch: "Have the Butler watch this campaign",
  lastCallWatching: "Butler is watching: Last Call alert is on",
  lastCallFull: "Full",
  lastCallFillUnknown: "Fill unknown",
  lastCallFillLabel: (pct, filled, total) => `${pct}% full: ${filled}/${total}`,
  lastCallCampaignFallback: "A campaign",
  lastCallNotifTitle: "Last Call Butler",
  lastCallNotifNearFull: (name, pct) =>
    `Last Call: ${name} is ${pct}% full. Accept before it closes.`,
  lastCallNotifFilled: (name) => `${name} just filled up.`,

  campaignBriefButton: "Brief",
  campaignBriefTitle: "The Butler's Brief",
  campaignBriefLoading: "The Butler is reading this campaign...",
  campaignBriefConfidence: (n) => `${n} confidence`,
  campaignBriefWhy: "Why I'd take this",
  campaignBriefFilm: "What to film",
  campaignBriefPick: "Pick of the shelf",
  campaignBriefPickEst: (units, revenue) => `Est. ${units} units/month, ${revenue}/month`,
  campaignBriefSaturation: (n) =>
    n === 0
      ? "No creator videos on this product yet: a wide-open spot."
      : `${n} creator ${n === 1 ? "video" : "videos"} already on this product (saturation).`,
  campaignBriefOnAmazon: "On Amazon",
  campaignBriefOffAmazon: "Off Amazon too",
  campaignBriefAudience: "Who it's for",
  campaignBriefAccept: "Accept campaign",
  campaignBriefCopy: "Copy brief",
  campaignBriefCopied: "Copied",
  campaignBriefClose: "Close",
  campaignBriefError: "The Butler couldn't write a full brief right now. Here's the score breakdown.",
  campaignBriefConnectHint: "Connect your own OpenAI API key and the Butler writes a full brief every time.",
  campaignBriefKeyErrorHint: "Your connected OpenAI key couldn't finish this brief. Check the key in Settings.",
  campaignBriefConnectBtn: "Connect OpenAI",
  campaignBriefOpenSettingsBtn: "Open settings",
  campaignBriefVerdictHot: "Worth accepting",
  campaignBriefVerdictWarm: "Worth a look",
  campaignBriefVerdictCool: "Probably pass",

  sumCampaignDetail: "Campaign detail",
  campaignDetailTitle: "The Butler's product read",
  campaignDetailProducts: "Products in this campaign",
  campaignDetailNoProducts: "No products detected on this campaign yet.",
  campaignDetailNoData: "No demand data in the catalogue yet.",
  campaignDetailBought: (n) => `${n}+ bought/mo`,

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
  kvRoiPerMinute: "Profit per filming minute",
  perMinuteSuffix: "/min",
  roiPerMinuteNote: "Estimated monthly profit divided by the minutes you spend filming and editing. Your real limit is time: this ranks products by the return each minute of effort buys.",
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
  sfOpeningPhotos: (done, total) =>
    `Opening photos and lists (videos already scanned from the feed)... ${done} of ${total}`,
  sfOpeningProducts: (done, total) => `Opening products... ${done} of ${total}`,
  sfEtaMinLeft: (min) => ` (about ${min} min left)`,
  sfCheckedFirst: (cap) => `Checked the first ${cap} products (storefront has more).`,
  sfScanFailed: "Scan failed. Reload the storefront tab and try again.",
  sfStopped: "Stopped.",
  sfDone: (items, pages, capped) =>
    `Done: ${items} items across ${pages} pages${capped ? " (feed capped)" : ""}.`,
  sfCoverage: (items, reported) =>
    `Scanned ${items} items; the storefront reports about ${reported} posts.`,
  sfStoppedEarly: (reason) =>
    `The feed stopped early (${reason}), so some content may be missing. Rescan to retry.`,
  sfDroppedCards: (n) => `${n} feed cards had an unrecognized type and were skipped.`,
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
  ofrEarnedChip: (amount) => `${amount} earned`,
  ofrFilmFirst: "Film first",
  ofrCoverage: (covered, total) => `${covered} of ${total} have your content`,
  ofrGaps: (n) => `${n} gap${n === 1 ? "" : "s"}`,
  ofrEarningGaps: (n) => `${n} proven earner${n === 1 ? "" : "s"} with no video`,
  countInfluencerN: (n) => `${n} influencer video${n === 1 ? "" : "s"}`,
  countPending: "Count not available",

  campaigns: "Campaigns",
  noCampaign: "No Creator Connections or SPCC campaign found for this product.",
  ccAvailable: "Creator Connections available",
  spccAvailable: "SPCC available",
  ccNotAvailable: "Creator Connections not available",
  spccNotAvailable: "SPCC not available",
  enrolledCc: "Enrolled in Creator Connections",
  enrolledSpcc: "Enrolled in SPCC",
  enrolledRate: (pct) => `${pct}% commission`,
  epc: (money) => `EPC ${money}`,
  campaignConnectNote: "Open the Influencer Butler app to accept this campaign (the app confirms and accepts).",
  dealAvailable: "Deal available",
  dealPushNote: "Push it to Deals Butler from the Send to your butler app section below.",

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
  pushToDailyDeals: "Push to Deals Butler",
  searchSendDeals: "Send deals to app",
  searchNoDeals: "No discounted deals on this page.",
  searchSendingDeals: (n) => `Sending ${n} deal(s) to your app...`,
  sendToContentButler: "Send to Content Butler",
  saveToLinkButler: "Save to Link Butler",
  savingLink: "Saving link...",
  acceptCc: "Accept CC campaign",
  acceptSpcc: "Accept SPCC campaign",
  addToCollab: "Add to Collab Butler",
  addingCollab: "Adding to Collab Butler...",
  pitchThisBrand: (brand) => `Pitch ${brand}`,
  pitchingBrand: "Adding to Pitch Butler...",
  generatePhoto: "Generate AI photo",
  generatingPhoto: "Generating AI photo in your app...",
  requestSample: "Request a sample",
  requestingSample: "Setting up your sample request...",
  addToIdeaList: "Add to Idea List",
  addingToIdeaList: "Queuing for Idea List Butler...",
  ideaListNewListOption: "New Idea List...",
  tileMenuAddToIdeaList: "Add to Amazon Idea List",
  pushingDeals: "Pushing to your deals workspace...",
  sendingContent: "Sending to Content Butler...",
  checkingCc: "Checking Creator Connections...",
  checkingSpcc: "Checking Sponsored Products...",
  sentToApp: "Sent to your app.",
  couldNotReachApp: "Could not reach the app. Is it still running?",
  connectAppToPair:
    "Connect the app first: open the extension popup and pair with the 6-digit code.",
  connectedToApp: (version) =>
    `Connected to your Influencer Butler app${version}. Acceptance uses your local Creator Connections catalogue.`,
  upsellSignedIn:
    "Open the Influencer Butler desktop app to push this product into your Deals Butler, Content Butler, and to auto-accept campaigns.",
  upsellSignedOut:
    "Do the rest with the app: push this product to Deals Butler with your post template and social destinations, send it to Content Butler, and auto-accept Creator Connections campaigns.",
  ctaOpenApp: "Open or install the app",
  ctaStartTrial: "Start your free trial",
  toolsAlwaysFree: "The scanning tools above are always free. The app adds the automation.",

  sfSendToRetag: (n) => `Send ${n} issue(s) to Retag Butler`,
  sfSendToContent: (n) => `Send ${n} product(s) to Content Butler`,
  sfSendingToContent: "Sending to Content Butler...",
  sfSendingToRetag: "Sending to Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Accept all available campaigns (${n})`,
  sfAcceptingCampaigns: "Accepting campaigns in the app...",
  obSendToContentButler: (n) => `Send ${n} product(s) to Content Butler`,
  obSendingToContentButler: "Sending to Content Butler...",
  obSentToContentButler: (n) => `Sent ${n} product(s) to Content Butler.`,
  appBridgeHeading: "Desktop app",
  appBridgeBlurb:
    "Connect the Influencer Butler desktop app to accept campaigns and send products to your butlers straight from Amazon.",
  appNextStepHint:
    "You're synced to your dashboard. To also accept campaigns and send products to your butlers, connect the desktop app below. This step is optional.",
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
    "You have been using Influencer Butler for a day now. Join our Facebook group to swap tips and wins with other Amazon Influencers and hear about new features first. For bug reports or anything you need from our team, use Feedback Butler instead.",
  nudgeFbJoin: "Join the Facebook group",
  nudgeFbReport: "Report a bug instead",
  nudgeAppNotifTitle: "Get the free Influencer Butler desktop app",
  nudgeAppNotifBody:
    "Automate deals, content, and campaign acceptance from your computer. Click to download it free for Windows or Mac.",
  nudgeAppTitle: "Ready for the desktop app?",
  nudgeAppBody:
    "The desktop app does the heavy lifting: push products to Deals Butler, send them to Content Butler, and auto-accept Creator Connections campaigns.",
  nudgeAppFree: "It is free to download and works alongside this extension.",
  nudgeAppDownloadWindows: "Download for Windows",
  nudgeAppDownloadMac: "Download for Mac",
  nudgeAppDownloadGeneric: "Download the desktop app",
  nudgeAppIntelMac: "Using an Intel Mac?",
  nudgeCommunityNotifTitle: "A quick tip on getting help",
  nudgeCommunityNotifBody:
    "Enjoy the Facebook group for tips and wins. For bug reports or feature requests, use Feedback Butler so our team can help.",
  nudgeCommunityTitle: "Getting the most from the community",
  nudgeCommunityBody:
    "You have been with us for a few days now. Our Facebook group is a great place for tips, tricks, and wins from other creators. Come join us.",
  nudgeCommunityNote:
    "One quick thing: the group is for community and tips, not bug reports, complaints, or billing. For anything you need from our team, use Feedback Butler. It is the fastest way to reach us and it goes straight to the people who can help.",
  nudgeCommunityUnderstand: "I understand",
  nudgeCommunityReport: "Report a bug (Feedback Butler)",

  updateBannerTitle: "Your Influencer Butler extension has an update waiting.",
  updateBannerBody: (version) =>
    `Version ${version} is ready to install. It only takes a second, and your settings are kept.`,
  updateNow: "Update now",
  updateRemindLater: "Remind me later",
  updateAppliedTitle: "Update installed",
  updateRefreshBody: "Refresh this page to finish switching to the new version.",
  updateRefreshBtn: "Refresh page",
  updatePopupHeading: "Update available",
  updatePopupBody: (current, available) =>
    `Version ${available} is ready to install (you have ${current}). The extension restarts in a moment; your settings are kept.`,

  whatsNewTitle: "What's new",
  whatsNewFeaturesHeading: "New features",
  whatsNewFixesHeading: "Bug fixes",
  whatsNewReportedHeading: "Issues you reported that we fixed",
  whatsNewOtherHeading: "Other notable changes",
  whatsNewDismiss: "Got it",

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
  popupListsHeading: "My lists",
  popupListsEmpty: "No lists yet. Add a product to a list from the search overlay's action menu.",
  popupListItems: (n) => (n === 1 ? "1 product" : `${n} products`),
  popupListDelete: "Delete list",
  watchCondBackInStock: "Back in stock",
  watchCondSlotOpens: "Video slot opens",
  watchCondPriceDrop: "Price drop",
  watchRemoveShort: "Remove",

  storefrontDetectedTitle: "Storefront detected",
  storefrontDetectedBody: (handle) =>
    `We found your storefront (${handle}) and saved it in Settings. You can change it there anytime.`,

  obReplayLink: "Setup guide",
  obTitle: "Set up Influencer Butler",
  obProgress: (current, total) => `Step ${current} of ${total}`,
  obBack: "Back",
  obNext: "Next",
  obSkip: "Skip for now",
  obFinish: "Finish",
  obWelcomeTitle: "Welcome to Influencer Butler",
  obWelcomeBody:
    "This quick setup gets your money signals, storefront, and links ready. It takes about a minute, and you can skip any step.",
  obWelcomePin: "Tip: pin the extension so its button is always one click away. Click the puzzle-piece icon in Chrome's toolbar, then the pin next to Influencer Butler.",
  obAccountTitle: "Connect your account",
  obAccountBody:
    "Add your license key to sync findings to your dashboard and the desktop app. Everything works without it, so you can skip this.",
  obAccountConnected: (email) => `Connected as ${email}.`,
  obAccountSkipHint: "No account yet? Skip this: the extension is fully usable for free.",
  obStorefrontTitle: "Your storefront",
  obStorefrontBody:
    "Your Amazon storefront handle powers your links and storefront checks. It is the part after /shop/ in your storefront URL.",
  obStorefrontAuto:
    "You do not have to look it up: we fill this in automatically the first time you open your Amazon Creator Hub.",
  obStorefrontDetected: (handle) => `Detected: ${handle}`,
  obToolsTitle: "Turn on the tools you want",
  obToolsBody:
    "These are on by default. Turn off anything you do not need now, you can change all of these later in Settings.",
  obAppTitle: "Connect the desktop app",
  obAppBody:
    "Pair the Influencer Butler desktop app to accept campaigns and send products to your butlers straight from Amazon. Enter the 6-digit code shown in the app.",
  obAppSkipHint: "Do not have the desktop app open? Skip this and pair later from the popup.",
  obDoneTitle: "You are all set",
  obDoneBody:
    "Influencer Butler is ready. Open a product, your storefront, or a Creator Connections campaign to see it work.",
  obDoneHelp: "Open Help",
  obDoneDashboard: "My dashboard",
  obDoneClose: "Done",

  syncTitle: "Sync with desktop app",
  syncBlurb:
    "Copy your link providers, affiliate tags, and storefront ID between this extension and the desktop app.",
  syncNow: "Sync now",
  syncChecking: "Checking...",
  syncInSync: "Everything is already in sync.",
  syncNotPaired: "Connect the desktop app first to sync settings.",
  syncAppOutdated: "Update the desktop app to sync settings.",
  syncFilled: (n) =>
    n === 1 ? "Filled in 1 setting from the desktop app." : `Filled in ${n} settings from the desktop app.`,
  syncFailed: "Could not reach the desktop app. Make sure it is running.",
  syncConfirmTitle: "These settings differ",
  syncConfirmBody: (n) =>
    n === 1
      ? "1 setting is different between the extension and the desktop app. Choose which side to keep."
      : `${n} settings are different between the extension and the desktop app. Choose which side to keep.`,
  syncConfirmList: "Different settings:",
  syncConfirmAppWins: "Use the desktop app's values",
  syncConfirmExtWins: "Use the extension's values",
  syncCancel: "Cancel",
  syncDone: "Synced.",
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
  ownedTitle: "Ya lo tienes",
  ownedNote: "Este producto está en tu historial de pedidos.",
  ownedBought: (year) => `Comprado en ${year}`,
  ownedPaid: (price) => `Pagaste ${price}`,
  ownedPostedChip: "Ya publicado",
  ownedPostedSummary: (platforms) => `Ya compartido en ${platforms}`,
  ownedGridOwned: "En tu pedido",
  ownedGridPosted: "Publicado",
  priceHistoryTitle: "Historial de precios",
  priceHistoryNow: (amount) => `Ahora ${amount}`,
  priceHistoryLow: (amount) => `Mínimo ${amount}`,
  priceHistoryLowest: "El más bajo hasta ahora",
  priceHistoryNote: "Precios vistos desde que empezaste a navegar con la extensión.",
  priceHistoryDesktopNote: "Historial completo de tu aplicación Influencer Butler.",
  bsrHistoryTitle: "Historial de clasificación de ventas",
  bsrHistoryNow: (rank) => `Ahora nº${rank}`,
  bsrHistoryBest: (rank) => `Mejor nº${rank}`,
  salesEstTitle: "Ventas mensuales estimadas",
  salesEstValue: (n) => `~${n}/mes`,
  salesEstModeled: "Estimado a partir del ranking de ventas",
  salesEstCalibrated: "Calibrado con datos reales",
  boughtPastMonthChip: (n) => `${n}+ comprados/mes`,
  estUnitsLabel: "Uds./mes est.",
  estRevenueLabel: "Ingresos/mes est.",
  estUnitsTip:
    "Unidades mensuales estimadas, calculadas a partir del ranking de ventas del producto. Es una estimación, no una cifra oficial.",
  estRevenueTip:
    "Ingresos mensuales estimados (unidades estimadas multiplicadas por el precio). Es una estimación, no una cifra oficial.",
  marketPoolNote: "Del catálogo compartido de Influencer Butler.",
  shotListTitle: "Guion de grabación",
  shotListShowFeatures: "Muestra estas características en cámara:",
  shotListBeatHook: "Gancho en los primeros 3 segundos: el resultado o el problema que resuelve",
  shotListBeatUnbox: "Muestra el empaque y qué incluye la caja",
  shotListBeatUse: "Demuéstralo en uso real, no solo sostenido ante la cámara",
  shotListBeatResult: "Muestra el antes y el después, o el resultado final",
  shotListBeatCta: "Llamada a la acción clara: envía a los espectadores a tu tienda",
  shotListBeatFtc: "Añade tu aviso legal FTC en pantalla y en el texto (#ad, #CommissionsEarned)",

  inlineCardTitle: "Información del producto",
  inlineAvailabilityHeading: "Disponibilidad por país",
  inlineInStock: "en stock",
  inlineUnavailable: "no disponible",
  inlineNotListed: "no listado",
  inlineConnectCreatorApi: "Conecta la Creator API para disponibilidad en varios países",

  tagFree: "Gratis",
  navUpdate: "Actualizar",
  navWhatsNew: "Novedades",
  navAiAssistant: "Asistente IA",
  navDeals: "Recolector de ofertas",
  navLinkButler: "Link Butler",
  navGrpWalmart: "Walmart",
  navGrpCross: "Multiplataforma",
  navGrpProduct: "Productos",
  navGrpResearch: "Investigación",
  navGrpCampaigns: "Campañas",
  navGrpEarnings: "Ganancias",
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
  syncDashboardHint:
    "Los hallazgos se suben a tu panel web por su cuenta. No necesitas la app de escritorio para esto.",
  contributeToggleLabel: "Contribuir al catálogo de productos compartido",
  contributeBlurb:
    "Desactivado por defecto. Cuando está activo, los datos de producto que ya ves (precio, ranking de ventas, comprados el mes pasado, categoría) y qué videos de creadores aparecen en el carrusel de un producto se agrupan, nunca datos personales, para que todos vean la demanda real, el historial de precios y la competencia de videos a lo largo del tiempo.",
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
  groupWalmart: "Walmart",
  groupCrossPlatform: "Amazon y Walmart",
  groupAmazonProduct: "Amazon: paginas de producto",
  groupAmazonResearch: "Amazon: investigacion y descubrimiento",
  groupAmazonCampaigns: "Amazon: campanas y storefront",
  groupAmazonEarnings: "Amazon: ganancias y alertas",
  toolWalmart: "Soporte de Walmart",
  toolWalmartHint:
    "Activa las senales de dinero y los overlays en Walmart.com. El overlay de resultados de busqueda (abajo) tambien funciona en las cuadriculas de Walmart.",
  toolVideoCounts: "Recuento de videos",
  toolVideoLandscape: "Panorama de videos",
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

  openAmazonToStart: "Abre una página de producto de Amazon o Walmart, tus pedidos o tu storefront para empezar.",
  noToolsOnPage: "Esta página de Amazon no tiene herramientas del butler. Prueba una página de producto.",
  productToolsActive: "Las herramientas de la página de producto están activas.",
  orderScanReady: "El escaneo del historial de pedidos está listo.",
  storefrontCheckupReady: "El chequeo del storefront está listo.",
  uploadHelperReady: "El asistente de subida está listo.",
  reloadTabToActivate: "Recarga esta pestaña para activar las herramientas (la página estaba abierta antes de instalar).",
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
  carouselReading: (label) => `${label}: leyendo datos de video...`,
  upperSlotOn:
    "Carrusel superior de influencers: activado. Los videos de influencers pueden ocupar el espacio superior junto a la galería de imágenes.",
  upperSlotOff:
    "Carrusel superior de influencers: desactivado. En esta ficha los videos de influencers solo aparecen en el carrusel inferior.",
  upperSlotChecking: "Carrusel superior de influencers: comprobando...",
  upperSlotUnknown: "Carrusel superior de influencers: desconocido",
  upperSlotInfo:
    "Cuando una marca activa el carrusel superior de influencers, un video de creador puede colocarse junto a la galería de imágenes: el espacio de video que más gana en la ficha. Desactivado significa que tu video solo aparecería en el carrusel inferior de Videos del producto.",
  influencerFallback: "Influencer",
  influencerVideosLabel: (n) => `Videos de influencers (${n})`,
  influencerVideosMore: (n) => `+${n} más`,

  deepScan: "Barrer todos los videos",
  deepScanIntro:
    "Amazon solo carga unos pocos videos en pantalla. Este barrido recorre el propio feed del widget para clasificar todos los videos que entregue, separados por carrusel superior (video de marca) e inferior (relacionados).",
  deepScanRunning: (videos, pages) => `Recopilando: ${videos} videos en ${pages} páginas...`,
  deepScanStop: "Detener",
  deepScanRescan: "Barrer de nuevo",
  deepScanDone: (classified, total) => `Clasificados ${classified} de ${total} videos.`,
  deepScanPartial:
    "Amazon entregó solo parte de la lista, así que esto es un mínimo, no el conjunto completo.",
  deepScanNoEndpoint:
    "Desplázate a la sección Videos del producto una vez y luego ejecuta el barrido para que encuentre el feed de videos.",
  deepScanStopped: "Barrido detenido.",
  upperCarousel: "Carrusel superior (video de marca)",
  lowerCarousel: "Carrusel inferior (relacionados)",
  estTotalVideos: (n) => `Total estimado de videos: ${n}`,
  allVideosLabel: (n) => `Todos los videos recopilados (${n})`,
  videoNoTitle: "Video sin título",
  videoExportCsv: "Exportar videos (CSV)",
  copySummary: "Copiar resumen",
  shareSummaryHeading: "Competencia de videos del producto (vía Influencer Butler)",
  shareTopCreators: "Creadores principales:",

  videoLandscape: "Panorama de videos",
  lsStatKnown: "Videos conocidos",
  lsStatPlaced: "Colocados ahora",
  lsStatCreators: "Creadores únicos",
  lsStatRepeat: "Creadores recurrentes",
  lsContentMixLabel: "Mezcla por tipo de creador",
  lsConcentrationLabel: "Concentración de creadores",
  lsConcentrationShare: (pct) => `Los 5 principales tienen el ${pct}% de los videos`,
  lsTopStrengthLabel: "Mejores videos por posición en el carrusel (aproximado)",
  lsUpper: "Superior",
  lsLower: "Inferior",
  lsPulseLabel: (dated, total) => `Ritmo de publicación (${dated} de ${total} con fecha)`,
  lsNewIn30: (n) => `${n} nuevos en los últimos 30 días`,
  lsDatesUnavailable: "Este listado no expone las fechas de publicación, así que el ritmo de publicación no está disponible.",
  lsTypicalLengthLabel: "Duración típica",
  lsLengthBand: (median, low, high) => `Mediana ${median} (típico de ${low} a ${high})`,
  lsLengthMedian: (median) => `Mediana ${median}`,
  lsDurationsUnavailable: "Este listado no expone la duración de los videos.",

  passportOpen: "Historial de colocación",
  passportClose: "Ocultar historial",
  passportLoading: "Cargando historial de colocación...",
  passportUnidentified: "Este video aún no se puede rastrear.",
  passportUnavailable: "El historial de colocación aún no está disponible.",
  passportNoData: "Aún no hay historial de colocación para este video.",
  passportNoDataDay: "sin datos",
  passportCollecting: (days) => `Recopilando evidencia diaria de colocación: ${days} de 90 días registrados`,
  passportSinceFirstSeen: (date) => `desde que se vio por primera vez el ${date}`,
  passportPresence: "Tasa de presencia",
  passportStability: "Estabilidad de colocación",
  passportStrength: "Fuerza en días activos",
  passportReach: "Alcance de productos",
  passportActiveDays: "Días observados",
  passportUpperLower: (upper, lower) => `Superior ${upper}% / Inferior ${lower}%`,
  passportCurrentSnapshot: "Colocación actual",
  passportLastObserved: (date) => `Visto por última vez el ${date}`,

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
  sortRevenue: "Ingresos estimados",
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
  tileCampaignRate: (pct) => `Campaña ${pct}%`,
  tileProvenEarner: "Ya te ha pagado",
  tileEarned: (money) => `Ganaste ${money}`,
  tileInfluencer: (n) => `${n} videos de infl.`,
  tileApproved: "Aprobado por Butler",
  tileLikelyFit: "Buen candidato",
  tileDeal: "Oferta",
  tileCoupon: "Cupón",
  tileRevenue: (money) => `~${money}/mes`,
  tileBsr: (rank, category) => (category ? `#${rank} ${category}` : `#${rank}`),
  tileEstUnits: (n) => `~${n} uds./mes`,
  tileMenuLabel: "Más acciones",
  tileMenuAddToList: "Añadir a lista",
  tileMenuNewList: "Nueva lista",
  tileMenuNewListPlaceholder: "Nombre de la lista",
  tileMenuCreate: "Crear",
  tileMenuAddedTo: (name) => `Guardado en ${name}`,
  tileMenuListFull: "Esa lista está llena.",
  tileMenuListsCapped: "Ya tienes el máximo de listas.",
  tileMenuCopyLink: "Copiar enlace",
  tileMenuCopied: "Copiado",
  tileMenuLinkFailed: "No se pudo crear un enlace",
  tileMenuOpenPage: "Abrir página del producto",
  tileMenuAppLocked: "Abre la app para enviar este producto.",
  tileMenuWorking: "Trabajando...",
  listPanelHeading: "Listas de productos",
  listPanelIntro: "Guarda este producto (o todas sus variaciones) en una de tus listas.",
  listPanelNewOption: "Nueva lista...",
  listPanelAddProduct: "Añadir este producto",
  listPanelAddVariations: (n) => `Añadir las ${n} variaciones`,
  listPanelAddedCount: (n, name) => `Se añadieron ${n} a ${name}`,
  listPanelNothingNew: "Ya está en esa lista.",
  searchEnriching: (done, total) => `Comprobando detalles ${done}/${total}`,
  searchEnrichPaused: "Amazon pausó la comprobación de detalles, se reintentará más tarde",
  searchOverlayActive: "El overlay de búsqueda está activo.",

  toolTrendRadar: "Radar de Tendencias (Más vendidos y Movers)",
  sumTrendRadar: "Radar de Tendencias",
  trendRadarActive: "El Radar de Tendencias está activo.",
  toolIdeaList: "Señales de dinero en Idea Lists",
  sumIdeaList: "Overlay de Idea List",
  ideaListActive: "Las señales de Idea List están activas.",
  toolDealsOverlay: "Señales de dinero en Ofertas del Día",
  sumDealsOverlay: "Overlay de ofertas",
  dealsOverlayActive: "Las señales de ofertas están activas.",
  trendCount: (n) => `${n} productos puntuados`,
  trendSortTrending: "Los que más suben",
  trendSortRank: "Ranking de más vendidos",
  trendFewVideosOnly: "Solo con hueco de video",
  tileRank: (n) => `N.º ${n}`,
  tileGain: (pct) => `▲ ${pct}%`,

  toolGlobalMaximizer: "Alcance global (multi-tienda)",

  toolStoreOverlay: "Overlay de tienda de marca",
  sumStoreOverlay: "Overlay de tienda de marca",
  storeOverlayActive: "El overlay de tienda de marca está activo.",
  storeCount: (n) => `${n} productos puntuados`,
  storeCandidates: (n) => `${n} en recuadro verde`,
  storeCandidatesOnly: "Solo los mejores candidatos",
  storeEnriching: (done, total) => `Revisando páginas de producto ${done} de ${total}...`,
  storeEnrichPaused: "Amazon pausó las revisiones. Recarga la página más tarde para terminar.",
  tileVideos: (n) => `${n} videos`,
  tileHeroSlot: "Hueco de video",
  tileNoCarousel: "Sin carrusel",

  sumEarningsOverlay: "Ganancias en tienda",
  toolEarningsOverlay: "Ganancias en tienda (insignias en el storefront)",
  earnBadgeTitle: "Lo que has ganado con esta publicación. Haz clic para ver el desglose completo.",
  earnDetailTitle: "Ganancias del producto",
  earnByStore: "Ganancias por tienda",
  earnByYear: "Ganancias por año",
  earnByMonth: "Ganancias por mes",
  earnCampaigns: "Campañas de Creator Connections",
  earnOnsite: "en Amazon",
  earnOffsite: "fuera de Amazon",
  earnScopeThisMarket: "Este mercado",
  earnScopeAllStores: "Todas las tiendas",
  earnUnits: (n) => `${n} unidad${n === 1 ? "" : "es"}`,
  earnOrders: (n) => `${n} pedido${n === 1 ? "" : "s"}`,
  earnRate: (pct) => `tasa ${pct}%`,
  earnClicks: (n) => `${n} clic${n === 1 ? "" : "s"}`,
  earnViewBreakdown: "Ver desglose",
  earnNoBreakdown: "Actualiza la app de escritorio para ver el desglose por tienda, año, mes y campaña.",
  earnClose: "Cerrar",

  sumVideoMoney: "Dinero por vídeo",
  vmPanelTitle: "Dinero por vídeo",
  vmVideoCount: (n) => `${n} vídeo${n === 1 ? "" : "s"}`,
  vmEarnedTitle: "Tus ganancias reales del producto de este vídeo. Haz clic para ver el desglose.",
  vmEpv: (money) => `${money}/1k vistas`,
  vmProjected: (money) => `~${money} est.`,
  vmRateLive: (pct) => `Paga ${pct}% ahora`,
  vmRateEnding: (pct) => `${pct}% termina pronto`,
  vmBought: (n) => `${n.toLocaleString()} comprados/mes`,
  vmCoolingChip: "Demanda bajando",
  vmProjectionNote: "Conecta la app de escritorio para ver ganancias reales. Por ahora mostramos proyecciones.",
  vmTopEarners: "Los que más ganan",
  vmBestEpv: "Mejor por vista",
  vmReshoot: "Vuelve a grabar estos",
  vmReshootHint: "Comisión alta, pocas vistas",
  vmDrafts: "Termina tu borrador",
  vmDraftsHint: "Los vídeos sin publicar no ganan nada",
  vmCooling: "Enfriándose / retirar",
  vmCoolingHint: "Demanda a la baja o campaña terminada",
  vmExport: "Exportar CSV",

  sumCampaignRadar: "Radar de campañas",
  toolCampaignRadar: "Radar de campañas (resaltar campañas)",
  campaignRadarActive: "El Radar de campañas está activo.",
  radarCount: (n) => `${n} campañas puntuadas`,
  radarMinCommission: "Tasa mín. (%)",
  radarMinDays: "Días mín. restantes",
  radarMinBudget: "Presupuesto mín. ($)",
  radarOnlyPassing: "Solo campañas que cumplen",
  radarSortLabel: "Ordenar",
  radarSortScore: "Mejor coincidencia",
  radarSortRate: "Comisión",
  radarSortDays: "Días restantes",
  radarSortRelevance: "Orden de la página",
  radarChipOwned: "Ya lo tienes",
  radarChipEarner: "Ya has ganado con esto",
  radarChipEnded: "Finalizada",
  radarChipCc: "Elegible CC",
  radarChipSpcc: "Elegible SPCC",
  radarAvailChip: (code, status) =>
    status === "available" ? `${code} ✓` : status === "unavailable" ? `${code} ✗` : `${code} ?`,
  radarAvailTitle: (code, status) =>
    status === "available"
      ? `Disponible para comprar en la tienda de Amazon de ${code}`
      : status === "unavailable"
        ? `No disponible para comprar en la tienda de Amazon de ${code}`
        : `No se pudo comprobar la tienda de Amazon de ${code} ahora mismo`,
  radarVideoChip: (n) => (n === 0 ? "Sin vídeos aún" : `${n} ${n === 1 ? "vídeo" : "vídeos"}`),
  radarVideoTitle:
    "Vídeos de creadores que ya hay sobre este producto. Menos significa menos competencia.",
  popupAvailabilityLabel: "Mostrar disponibilidad para",
  popupAvailabilityHint:
    "Campaign Radar comprueba cada producto de campaña en las tiendas de Amazon de estos países y muestra un distintivo por país.",
  popupAvailabilityAuDenied:
    "Australia necesita permiso para leer amazon.com.au. Permítelo cuando Chrome lo pida y vuelve a intentarlo.",

  lastCallWatch: "Que el Butler vigile esta campaña",
  lastCallWatching: "El Butler está vigilando: alerta de Última Llamada activada",
  lastCallFull: "Completa",
  lastCallFillUnknown: "Ocupación desconocida",
  lastCallFillLabel: (pct, filled, total) => `${pct}% ocupada: ${filled}/${total}`,
  lastCallCampaignFallback: "Una campaña",
  lastCallNotifTitle: "Butler de Última Llamada",
  lastCallNotifNearFull: (name, pct) =>
    `Última Llamada: ${name} está ${pct}% ocupada. Acepta antes de que se cierre.`,
  lastCallNotifFilled: (name) => `${name} acaba de completarse.`,

  campaignBriefButton: "Informe",
  campaignBriefTitle: "El informe del Butler",
  campaignBriefLoading: "El Butler está analizando esta campaña...",
  campaignBriefConfidence: (n) => `${n} de confianza`,
  campaignBriefWhy: "Por qué la aceptaría",
  campaignBriefFilm: "Qué grabar",
  campaignBriefPick: "La mejor opción del catálogo",
  campaignBriefPickEst: (units, revenue) => `Est. ${units} unidades/mes, ${revenue}/mes`,
  campaignBriefSaturation: (n) =>
    n === 0
      ? "Aún no hay vídeos de creadores sobre este producto: un hueco libre."
      : `${n} ${n === 1 ? "vídeo" : "vídeos"} de creadores ya sobre este producto (saturación).`,
  campaignBriefOnAmazon: "En Amazon",
  campaignBriefOffAmazon: "Fuera de Amazon también",
  campaignBriefAudience: "Para quién es",
  campaignBriefAccept: "Aceptar campaña",
  campaignBriefCopy: "Copiar informe",
  campaignBriefCopied: "Copiado",
  campaignBriefClose: "Cerrar",
  campaignBriefError: "El Butler no pudo redactar un informe completo ahora mismo. Aquí tienes el desglose de la puntuación.",
  campaignBriefConnectHint: "Conecta tu propia clave de API de OpenAI y el Butler redactará un informe completo cada vez.",
  campaignBriefKeyErrorHint: "Tu clave de OpenAI conectada no pudo terminar este informe. Revísala en Ajustes.",
  campaignBriefConnectBtn: "Conectar OpenAI",
  campaignBriefOpenSettingsBtn: "Abrir ajustes",
  campaignBriefVerdictHot: "Vale la pena aceptar",
  campaignBriefVerdictWarm: "Merece un vistazo",
  campaignBriefVerdictCool: "Probablemente no",

  sumCampaignDetail: "Detalle de campaña",
  campaignDetailTitle: "Lectura de producto del Butler",
  campaignDetailProducts: "Productos de esta campaña",
  campaignDetailNoProducts: "Aún no se detectan productos en esta campaña.",
  campaignDetailNoData: "Todavía no hay datos de demanda en el catálogo.",
  campaignDetailBought: (n) => `${n}+ comprados/mes`,

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
  kvRoiPerMinute: "Ganancia por minuto de grabación",
  perMinuteSuffix: "/min",
  roiPerMinuteNote: "Ganancia mensual estimada dividida entre los minutos que dedicas a grabar y editar. Tu límite real es el tiempo: esto ordena los productos por el retorno que compra cada minuto de esfuerzo.",
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
  sfOpeningPhotos: (done, total) =>
    `Abriendo fotos y listas (los videos ya se escanearon desde el feed)... ${done} de ${total}`,
  sfOpeningProducts: (done, total) => `Abriendo productos... ${done} de ${total}`,
  sfEtaMinLeft: (min) => ` (unos ${min} min restantes)`,
  sfCheckedFirst: (cap) => `Revisados los primeros ${cap} productos (el storefront tiene más).`,
  sfScanFailed: "El escaneo falló. Recarga la pestaña del storefront e inténtalo de nuevo.",
  sfStopped: "Detenido.",
  sfDone: (items, pages, capped) =>
    `Listo: ${items} elementos en ${pages} páginas${capped ? " (feed limitado)" : ""}.`,
  sfCoverage: (items, reported) =>
    `Escaneados ${items} elementos; el storefront indica unas ${reported} publicaciones.`,
  sfStoppedEarly: (reason) =>
    `El feed se detuvo antes de tiempo (${reason}), así que puede faltar contenido. Vuelve a escanear para reintentar.`,
  sfDroppedCards: (n) => `${n} tarjetas del feed tenían un tipo no reconocido y se omitieron.`,
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
  ofrEarnedChip: (amount) => `${amount} ganados`,
  ofrFilmFirst: "Graba esto primero",
  ofrCoverage: (covered, total) => `${covered} de ${total} tienen tu contenido`,
  ofrGaps: (n) => `${n} hueco${n === 1 ? "" : "s"}`,
  ofrEarningGaps: (n) => `${n} que ya te paga${n === 1 ? "" : "n"} sin video`,
  countInfluencerN: (n) => `${n} video${n === 1 ? "" : "s"} de influencers`,
  countPending: "Recuento no disponible",

  campaigns: "Campañas",
  noCampaign: "No se encontró campaña de Creator Connections ni SPCC para este producto.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  ccNotAvailable: "Creator Connections no disponible",
  spccNotAvailable: "SPCC no disponible",
  enrolledCc: "Inscrito en Creator Connections",
  enrolledSpcc: "Inscrito en SPCC",
  enrolledRate: (pct) => `${pct}% de comisión`,
  epc: (money) => `EPC ${money}`,
  campaignConnectNote: "Abre la app Influencer Butler para aceptar esta campaña (la app confirma y acepta).",
  dealAvailable: "Oferta disponible",
  dealPushNote: "Envíala a Deals Butler desde la sección Send to your butler app de abajo.",

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
  pushToDailyDeals: "Enviar a Deals Butler",
  searchSendDeals: "Enviar ofertas a la app",
  searchNoDeals: "No hay ofertas con descuento en esta página.",
  searchSendingDeals: (n) => `Enviando ${n} oferta(s) a tu app...`,
  sendToContentButler: "Enviar a Content Butler",
  saveToLinkButler: "Guardar en Link Butler",
  savingLink: "Guardando enlace...",
  acceptCc: "Aceptar campaña CC",
  acceptSpcc: "Aceptar campaña SPCC",
  addToCollab: "Añadir a Collab Butler",
  addingCollab: "Añadiendo a Collab Butler...",
  pitchThisBrand: (brand) => `Contactar a ${brand}`,
  pitchingBrand: "Añadiendo a Pitch Butler...",
  generatePhoto: "Generar foto con IA",
  generatingPhoto: "Generando foto con IA en tu app...",
  requestSample: "Solicitar una muestra",
  requestingSample: "Preparando tu solicitud de muestra...",
  addToIdeaList: "Añadir a Idea List",
  addingToIdeaList: "Poniendo en cola para Idea List Butler...",
  ideaListNewListOption: "Nueva Idea List...",
  tileMenuAddToIdeaList: "Añadir a una Idea List de Amazon",
  pushingDeals: "Enviando a tu workspace de ofertas...",
  sendingContent: "Enviando a Content Butler...",
  checkingCc: "Comprobando Creator Connections...",
  checkingSpcc: "Comprobando Sponsored Products...",
  sentToApp: "Enviado a tu app.",
  couldNotReachApp: "No se pudo contactar la app. ¿Sigue abierta?",
  connectAppToPair:
    "Conecta la app primero: abre la ventana de la extensión y vincula con el código de 6 dígitos.",
  connectedToApp: (version) =>
    `Conectado a tu app de Influencer Butler${version}. La aceptación usa tu catálogo local de Creator Connections.`,
  upsellSignedIn:
    "Abre la app de escritorio de Influencer Butler para enviar este producto a tus Deals Butler, Content Butler y auto-aceptar campañas.",
  upsellSignedOut:
    "Haz el resto con la app: envía este producto a Deals Butler con tu plantilla de publicación y destinos sociales, mándalo a Content Butler y auto-acepta campañas de Creator Connections.",
  ctaOpenApp: "Abrir o instalar la app",
  ctaStartTrial: "Empieza tu prueba gratis",
  toolsAlwaysFree: "Las herramientas de escaneo de arriba siempre son gratis. La app añade la automatización.",

  sfSendToRetag: (n) => `Enviar ${n} problema(s) a Retag Butler`,
  sfSendToContent: (n) => `Enviar ${n} producto(s) a Content Butler`,
  sfSendingToContent: "Enviando a Content Butler...",
  sfSendingToRetag: "Enviando a Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Aceptar todas las campañas disponibles (${n})`,
  sfAcceptingCampaigns: "Aceptando campañas en la app...",
  obSendToContentButler: (n) => `Enviar ${n} producto(s) a Content Butler`,
  obSendingToContentButler: "Enviando a Content Butler...",
  obSentToContentButler: (n) => `Se enviaron ${n} producto(s) a Content Butler.`,
  appBridgeHeading: "App de escritorio",
  appBridgeBlurb:
    "Conecta la app de escritorio de Influencer Butler para aceptar campañas y enviar productos a tus butlers directamente desde Amazon.",
  appNextStepHint:
    "Ya estás sincronizado con tu panel. Para también aceptar campañas y enviar productos a tus butlers, conecta la app de escritorio abajo. Este paso es opcional.",
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
    "Llevas un día usando Influencer Butler. Únete a nuestro grupo de Facebook para intercambiar consejos y logros con otros Amazon Influencers y enterarte de las novedades antes que nadie. Para informar de errores o cualquier cosa que necesites de nuestro equipo, usa Feedback Butler.",
  nudgeFbJoin: "Unirme al grupo de Facebook",
  nudgeFbReport: "Mejor informar de un error",
  nudgeAppNotifTitle: "Descarga gratis la app de escritorio de Influencer Butler",
  nudgeAppNotifBody:
    "Automatiza ofertas, contenido y aceptación de campañas desde tu ordenador. Haz clic para descargarla gratis para Windows o Mac.",
  nudgeAppTitle: "¿List@ para la app de escritorio?",
  nudgeAppBody:
    "La app de escritorio hace el trabajo pesado: envía productos a Deals Butler, mándalos a Content Butler y auto-acepta campañas de Creator Connections.",
  nudgeAppFree: "Es gratis de descargar y funciona junto a esta extensión.",
  nudgeAppDownloadWindows: "Descargar para Windows",
  nudgeAppDownloadMac: "Descargar para Mac",
  nudgeAppDownloadGeneric: "Descargar la app de escritorio",
  nudgeAppIntelMac: "¿Usas un Mac con Intel?",
  nudgeCommunityNotifTitle: "Un consejo rápido para recibir ayuda",
  nudgeCommunityNotifBody:
    "Disfruta del grupo de Facebook para consejos y logros. Para informar de errores o pedir funciones, usa Feedback Butler para que nuestro equipo pueda ayudarte.",
  nudgeCommunityTitle: "Aprovecha al máximo la comunidad",
  nudgeCommunityBody:
    "Ya llevas unos días con nosotros. Nuestro grupo de Facebook es un gran lugar para consejos, trucos y logros de otros creadores. Ven a unirte.",
  nudgeCommunityNote:
    "Una cosa rápida: el grupo es para la comunidad y los consejos, no para informar de errores, quejas o facturación. Para cualquier cosa que necesites de nuestro equipo, usa Feedback Butler. Es la forma más rápida de contactarnos y llega directamente a las personas que pueden ayudarte.",
  nudgeCommunityUnderstand: "Entendido",
  nudgeCommunityReport: "Informar de un error (Feedback Butler)",

  updateBannerTitle: "Tu extensión de Influencer Butler tiene una actualización pendiente.",
  updateBannerBody: (version) =>
    `La versión ${version} está lista para instalarse. Solo toma un segundo y tus ajustes se conservan.`,
  updateNow: "Actualizar ahora",
  updateRemindLater: "Recuérdamelo luego",
  updateAppliedTitle: "Actualización instalada",
  updateRefreshBody: "Recarga esta página para terminar de pasar a la nueva versión.",
  updateRefreshBtn: "Recargar la página",
  updatePopupHeading: "Actualización disponible",
  updatePopupBody: (current, available) =>
    `La versión ${available} está lista para instalarse (tienes la ${current}). La extensión se reinicia en un momento; tus ajustes se conservan.`,

  whatsNewTitle: "Novedades",
  whatsNewFeaturesHeading: "Nuevas funciones",
  whatsNewFixesHeading: "Correcciones",
  whatsNewReportedHeading: "Problemas que reportaste y ya corregimos",
  whatsNewOtherHeading: "Otros cambios destacados",
  whatsNewDismiss: "Entendido",

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
  popupListsHeading: "Mis listas",
  popupListsEmpty: "Aún no tienes listas. Añade un producto a una lista desde el menú de acciones del overlay de búsqueda.",
  popupListItems: (n) => (n === 1 ? "1 producto" : `${n} productos`),
  popupListDelete: "Eliminar lista",
  watchCondBackInStock: "Vuelve a stock",
  watchCondSlotOpens: "Se abre espacio de video",
  watchCondPriceDrop: "Baja de precio",
  watchRemoveShort: "Eliminar",

  storefrontDetectedTitle: "Tienda detectada",
  storefrontDetectedBody: (handle) =>
    `Encontramos tu tienda (${handle}) y la guardamos en Ajustes. Puedes cambiarla allí cuando quieras.`,

  obReplayLink: "Guía de configuración",
  obTitle: "Configura Influencer Butler",
  obProgress: (current, total) => `Paso ${current} de ${total}`,
  obBack: "Atrás",
  obNext: "Siguiente",
  obSkip: "Omitir por ahora",
  obFinish: "Finalizar",
  obWelcomeTitle: "Te damos la bienvenida a Influencer Butler",
  obWelcomeBody:
    "Esta configuración rápida deja listas tus señales de ingresos, tu tienda y tus enlaces. Tarda alrededor de un minuto y puedes omitir cualquier paso.",
  obWelcomePin: "Consejo: fija la extensión para tener su botón siempre a un clic. Haz clic en el icono de pieza de puzle en la barra de Chrome y luego en la chincheta junto a Influencer Butler.",
  obAccountTitle: "Conecta tu cuenta",
  obAccountBody:
    "Añade tu clave de licencia para sincronizar los hallazgos con tu panel y con la app de escritorio. Todo funciona sin ella, así que puedes omitir este paso.",
  obAccountConnected: (email) => `Conectado como ${email}.`,
  obAccountSkipHint: "¿Aún no tienes cuenta? Omítelo: la extensión es totalmente utilizable gratis.",
  obStorefrontTitle: "Tu tienda",
  obStorefrontBody:
    "El identificador de tu tienda de Amazon impulsa tus enlaces y las comprobaciones de tienda. Es la parte que va después de /shop/ en la URL de tu tienda.",
  obStorefrontAuto:
    "No hace falta que lo busques: lo rellenamos automáticamente la primera vez que abras tu Creator Hub de Amazon.",
  obStorefrontDetected: (handle) => `Detectado: ${handle}`,
  obToolsTitle: "Activa las herramientas que quieras",
  obToolsBody:
    "Están activadas por defecto. Desactiva lo que no necesites ahora; puedes cambiar todo esto más tarde en Ajustes.",
  obAppTitle: "Conecta la app de escritorio",
  obAppBody:
    "Vincula la app de escritorio de Influencer Butler para aceptar campañas y enviar productos a tus butlers directamente desde Amazon. Introduce el código de 6 dígitos que muestra la app.",
  obAppSkipHint: "¿No tienes la app de escritorio abierta? Omítelo y vincúlala más tarde desde la ventana emergente.",
  obDoneTitle: "Todo listo",
  obDoneBody:
    "Influencer Butler está listo. Abre un producto, tu tienda o una campaña de Creator Connections para verlo en acción.",
  obDoneHelp: "Abrir Ayuda",
  obDoneDashboard: "Mi panel",
  obDoneClose: "Listo",

  syncTitle: "Sincronizar con la app de escritorio",
  syncBlurb:
    "Copia tus proveedores de enlaces, etiquetas de afiliado e ID de tienda entre esta extensión y la app de escritorio.",
  syncNow: "Sincronizar ahora",
  syncChecking: "Comprobando...",
  syncInSync: "Todo ya está sincronizado.",
  syncNotPaired: "Conecta primero la app de escritorio para sincronizar los ajustes.",
  syncAppOutdated: "Actualiza la app de escritorio para sincronizar los ajustes.",
  syncFilled: (n) =>
    n === 1 ? "Se rellenó 1 ajuste desde la app de escritorio." : `Se rellenaron ${n} ajustes desde la app de escritorio.`,
  syncFailed: "No se pudo contactar con la app de escritorio. Asegúrate de que esté abierta.",
  syncConfirmTitle: "Estos ajustes difieren",
  syncConfirmBody: (n) =>
    n === 1
      ? "1 ajuste es diferente entre la extensión y la app de escritorio. Elige qué lado conservar."
      : `${n} ajustes son diferentes entre la extensión y la app de escritorio. Elige qué lado conservar.`,
  syncConfirmList: "Ajustes diferentes:",
  syncConfirmAppWins: "Usar los valores de la app de escritorio",
  syncConfirmExtWins: "Usar los valores de la extensión",
  syncCancel: "Cancelar",
  syncDone: "Sincronizado.",
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
  ownedTitle: "Vous l'avez déjà",
  ownedNote: "Ce produit est dans votre historique de commandes.",
  ownedBought: (year) => `Acheté en ${year}`,
  ownedPaid: (price) => `Payé ${price}`,
  ownedPostedChip: "Déjà publié",
  ownedPostedSummary: (platforms) => `Déjà partagé sur ${platforms}`,
  ownedGridOwned: "Déjà acheté",
  ownedGridPosted: "Publié",
  priceHistoryTitle: "Historique des prix",
  priceHistoryNow: (amount) => `Maintenant ${amount}`,
  priceHistoryLow: (amount) => `Plus bas ${amount}`,
  priceHistoryLowest: "Plus bas jamais vu",
  priceHistoryNote: "Prix vus depuis que vous naviguez avec l'extension.",
  priceHistoryDesktopNote: "Historique complet depuis votre application Influencer Butler.",
  bsrHistoryTitle: "Historique du classement des ventes",
  bsrHistoryNow: (rank) => `Maintenant n°${rank}`,
  bsrHistoryBest: (rank) => `Meilleur n°${rank}`,
  salesEstTitle: "Ventes mensuelles estimées",
  salesEstValue: (n) => `~${n}/mois`,
  salesEstModeled: "Estimé d'après le classement des ventes",
  salesEstCalibrated: "Calibré sur des données réelles",
  boughtPastMonthChip: (n) => `${n}+ achetés/mois`,
  estUnitsLabel: "Unités/mois est.",
  estRevenueLabel: "Revenus/mois est.",
  estUnitsTip:
    "Unités mensuelles estimées, modélisées d'après le classement des ventes du produit. Une estimation, pas un chiffre officiel.",
  estRevenueTip:
    "Revenus mensuels estimés (unités estimées multipliées par le prix). Une estimation, pas un chiffre officiel.",
  marketPoolNote: "Issu du catalogue partagé Influencer Butler.",
  shotListTitle: "Plan de tournage",
  shotListShowFeatures: "Montrez ces caractéristiques à la caméra:",
  shotListBeatHook: "Accroche dans les 3 premières secondes: le résultat ou le problème résolu",
  shotListBeatUnbox: "Montrez l'emballage et le contenu de la boîte",
  shotListBeatUse: "Montrez-le en usage réel, pas seulement tenu devant la caméra",
  shotListBeatResult: "Montrez l'avant et l'après, ou le résultat final",
  shotListBeatCta: "Appel à l'action clair: envoyez les spectateurs vers votre boutique",
  shotListBeatFtc: "Ajoutez votre mention FTC à l'écran et dans la légende (#ad, #CommissionsEarned)",

  inlineCardTitle: "Infos produit",
  inlineAvailabilityHeading: "Disponibilité par pays",
  inlineInStock: "en stock",
  inlineUnavailable: "indisponible",
  inlineNotListed: "non listé",
  inlineConnectCreatorApi: "Connectez la Creator API pour la disponibilité multi-pays",

  tagFree: "Gratuit",
  navUpdate: "Mise à jour",
  navWhatsNew: "Nouveautés",
  navAiAssistant: "Assistant IA",
  navDeals: "Collecteur d'offres",
  navLinkButler: "Link Butler",
  navGrpWalmart: "Walmart",
  navGrpCross: "Multiplateforme",
  navGrpProduct: "Pages produit",
  navGrpResearch: "Recherche",
  navGrpCampaigns: "Campagnes",
  navGrpEarnings: "Gains",
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
  syncDashboardHint:
    "Les découvertes se chargent d'elles-mêmes sur votre tableau de bord web. L'app de bureau n'est pas nécessaire pour cela.",
  contributeToggleLabel: "Contribuer au catalogue de produits partagé",
  contributeBlurb:
    "Désactivé par défaut. Une fois activé, les données produit que vous voyez déjà (prix, classement des ventes, achats le mois dernier, catégorie) et quelles vidéos de créateurs figurent dans le carrousel d'un produit sont regroupées, jamais de données personnelles, afin que chacun voie la demande réelle, l'historique des prix et la concurrence vidéo au fil du temps.",
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
  groupWalmart: "Walmart",
  groupCrossPlatform: "Amazon et Walmart",
  groupAmazonProduct: "Amazon : pages produit",
  groupAmazonResearch: "Amazon : recherche et découverte",
  groupAmazonCampaigns: "Amazon : campagnes et storefront",
  groupAmazonEarnings: "Amazon : gains et alertes",
  toolWalmart: "Prise en charge de Walmart",
  toolWalmartHint:
    "Active les signaux de revenus et les overlays sur Walmart.com. L'overlay des résultats de recherche (ci-dessous) fonctionne aussi sur les grilles Walmart.",
  toolVideoCounts: "Comptage de vidéos",
  toolVideoLandscape: "Panorama vidéo",
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

  openAmazonToStart: "Ouvrez une page produit Amazon ou Walmart, vos commandes ou votre storefront pour commencer.",
  noToolsOnPage: "Cette page Amazon n'a pas d'outils butler. Essayez une page produit.",
  productToolsActive: "Les outils de la page produit sont actifs.",
  orderScanReady: "L'analyse de l'historique de commandes est prête.",
  storefrontCheckupReady: "Le bilan du storefront est prêt.",
  uploadHelperReady: "L'assistant de mise en ligne est prêt.",
  reloadTabToActivate: "Rechargez cet onglet pour activer les outils (la page était ouverte avant l'installation).",
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
  carouselReading: (label) => `${label} : lecture des données vidéo...`,
  upperSlotOn:
    "Carrousel supérieur d'influenceurs : activé. Les vidéos d'influenceurs peuvent occuper l'emplacement du haut, à côté de la galerie d'images.",
  upperSlotOff:
    "Carrousel supérieur d'influenceurs : désactivé. Sur cette fiche, les vidéos d'influenceurs n'apparaissent que dans le carrousel inférieur.",
  upperSlotChecking: "Carrousel supérieur d'influenceurs : vérification...",
  upperSlotUnknown: "Carrousel supérieur d'influenceurs : inconnu",
  upperSlotInfo:
    "Quand une marque active le carrousel supérieur d'influenceurs, une vidéo de créateur peut être placée juste à côté de la galerie d'images : l'emplacement vidéo le plus rentable de la fiche. Désactivé signifie que votre vidéo n'apparaîtrait que dans le carrousel inférieur des vidéos du produit.",
  influencerFallback: "Influenceur",
  influencerVideosLabel: (n) => `Vidéos d'influenceurs (${n})`,
  influencerVideosMore: (n) => `+${n} de plus`,

  deepScan: "Balayer toutes les vidéos",
  deepScanIntro:
    "Amazon ne charge que quelques vidéos à l'écran. Ce balayage parcourt le flux du widget pour classer toutes les vidéos qu'il fournit, réparties entre carrousel supérieur (vidéo de marque) et inférieur (vidéos liées).",
  deepScanRunning: (videos, pages) => `Récolte: ${videos} vidéos sur ${pages} pages...`,
  deepScanStop: "Arrêter",
  deepScanRescan: "Relancer le balayage",
  deepScanDone: (classified, total) => `${classified} vidéos classées sur ${total}.`,
  deepScanPartial:
    "Amazon n'a fourni qu'une partie de la liste: ceci est un minimum, pas l'ensemble complet.",
  deepScanNoEndpoint:
    "Faites défiler une fois jusqu'à la section Vidéos du produit, puis lancez le balayage pour qu'il trouve le flux de vidéos.",
  deepScanStopped: "Balayage arrêté.",
  upperCarousel: "Carrousel supérieur (vidéo de marque)",
  lowerCarousel: "Carrousel inférieur (vidéos liées)",
  estTotalVideos: (n) => `Total estimé de vidéos: ${n}`,
  allVideosLabel: (n) => `Toutes les vidéos récoltées (${n})`,
  videoNoTitle: "Vidéo sans titre",
  videoExportCsv: "Exporter les vidéos (CSV)",
  copySummary: "Copier le résumé",
  shareSummaryHeading: "Concurrence vidéo du produit (via Influencer Butler)",
  shareTopCreators: "Principaux créateurs:",

  videoLandscape: "Panorama vidéo",
  lsStatKnown: "Vidéos connues",
  lsStatPlaced: "Placées actuellement",
  lsStatCreators: "Créateurs uniques",
  lsStatRepeat: "Créateurs récurrents",
  lsContentMixLabel: "Répartition par type de créateur",
  lsConcentrationLabel: "Concentration des créateurs",
  lsConcentrationShare: (pct) => `Les 5 premiers détiennent ${pct}% des vidéos`,
  lsTopStrengthLabel: "Meilleures vidéos par position dans le carrousel (approx.)",
  lsUpper: "Supérieur",
  lsLower: "Inférieur",
  lsPulseLabel: (dated, total) => `Rythme de publication (${dated} sur ${total} datées)`,
  lsNewIn30: (n) => `${n} nouvelles au cours des 30 derniers jours`,
  lsDatesUnavailable: "Cette fiche n'expose pas les dates de publication, le rythme de publication est donc indisponible.",
  lsTypicalLengthLabel: "Durée typique",
  lsLengthBand: (median, low, high) => `Médiane ${median} (typique de ${low} à ${high})`,
  lsLengthMedian: (median) => `Médiane ${median}`,
  lsDurationsUnavailable: "Cette fiche n'expose pas la durée des vidéos.",

  passportOpen: "Historique de placement",
  passportClose: "Masquer l'historique",
  passportLoading: "Chargement de l'historique de placement...",
  passportUnidentified: "Cette vidéo ne peut pas encore être suivie.",
  passportUnavailable: "L'historique de placement n'est pas encore disponible.",
  passportNoData: "Aucun historique de placement enregistré pour cette vidéo pour l'instant.",
  passportNoDataDay: "aucune donnée",
  passportCollecting: (days) => `Collecte de preuves de placement quotidiennes: ${days} sur 90 jours enregistrés`,
  passportSinceFirstSeen: (date) => `depuis la première apparition le ${date}`,
  passportPresence: "Taux de présence",
  passportStability: "Stabilité du placement",
  passportStrength: "Force des jours actifs",
  passportReach: "Portée produits",
  passportActiveDays: "Jours observés",
  passportUpperLower: (upper, lower) => `Supérieur ${upper}% / Inférieur ${lower}%`,
  passportCurrentSnapshot: "Placement actuel",
  passportLastObserved: (date) => `Vu pour la dernière fois le ${date}`,

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
  sortRevenue: "Revenu estimé",
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
  tileCampaignRate: (pct) => `Campagne ${pct}%`,
  tileProvenEarner: "Déjà rentable",
  tileEarned: (money) => `${money} gagnés`,
  tileInfluencer: (n) => `${n} vidéos d'infl.`,
  tileApproved: "Approuvé par Butler",
  tileLikelyFit: "Bon candidat",
  tileDeal: "Promo",
  tileCoupon: "Coupon",
  tileRevenue: (money) => `~${money}/mois`,
  tileBsr: (rank, category) => (category ? `#${rank} ${category}` : `#${rank}`),
  tileEstUnits: (n) => `~${n} unités/mois`,
  tileMenuLabel: "Plus d'actions",
  tileMenuAddToList: "Ajouter à une liste",
  tileMenuNewList: "Nouvelle liste",
  tileMenuNewListPlaceholder: "Nom de la liste",
  tileMenuCreate: "Créer",
  tileMenuAddedTo: (name) => `Enregistré dans ${name}`,
  tileMenuListFull: "Cette liste est pleine.",
  tileMenuListsCapped: "Vous avez atteint le nombre maximal de listes.",
  tileMenuCopyLink: "Copier le lien",
  tileMenuCopied: "Copié",
  tileMenuLinkFailed: "Impossible de créer un lien",
  tileMenuOpenPage: "Ouvrir la page produit",
  tileMenuAppLocked: "Ouvrez l'app pour envoyer ce produit.",
  tileMenuWorking: "En cours...",
  listPanelHeading: "Listes de produits",
  listPanelIntro: "Enregistrez ce produit (ou toutes ses variantes) dans une de vos listes.",
  listPanelNewOption: "Nouvelle liste...",
  listPanelAddProduct: "Ajouter ce produit",
  listPanelAddVariations: (n) => `Ajouter les ${n} variantes`,
  listPanelAddedCount: (n, name) => `${n} ajoutés à ${name}`,
  listPanelNothingNew: "Déjà dans cette liste.",
  searchEnriching: (done, total) => `Vérification des détails ${done}/${total}`,
  searchEnrichPaused: "Vérifications suspendues par Amazon, nouvel essai plus tard",
  searchOverlayActive: "L'overlay de recherche est actif.",

  toolTrendRadar: "Radar de Tendances (Meilleures ventes et Movers)",
  sumTrendRadar: "Radar de Tendances",
  trendRadarActive: "Le Radar de Tendances est actif.",
  toolIdeaList: "Signaux d'argent sur les Idea Lists",
  sumIdeaList: "Overlay Idea List",
  ideaListActive: "Les signaux Idea List sont actifs.",
  toolDealsOverlay: "Signaux d'argent sur les Offres du jour",
  sumDealsOverlay: "Overlay des offres",
  dealsOverlayActive: "Les signaux des offres sont actifs.",
  trendCount: (n) => `${n} produits notés`,
  trendSortTrending: "Plus fortes hausses",
  trendSortRank: "Classement des ventes",
  trendFewVideosOnly: "Créneau vidéo libre seulement",
  tileRank: (n) => `N° ${n}`,
  tileGain: (pct) => `▲ ${pct}%`,

  toolGlobalMaximizer: "Portée mondiale (multi-boutique)",

  toolStoreOverlay: "Overlay de boutique de marque",
  sumStoreOverlay: "Overlay de boutique de marque",
  storeOverlayActive: "L'overlay de boutique de marque est actif.",
  storeCount: (n) => `${n} produits notés`,
  storeCandidates: (n) => `${n} encadrés en vert`,
  storeCandidatesOnly: "Meilleurs candidats seulement",
  storeEnriching: (done, total) => `Vérification des pages produit ${done} sur ${total}...`,
  storeEnrichPaused: "Amazon a suspendu les vérifications. Rechargez la page plus tard pour terminer.",
  tileVideos: (n) => `${n} vidéos`,
  tileHeroSlot: "Emplacement vidéo",
  tileNoCarousel: "Pas de carrousel",

  sumEarningsOverlay: "Gains en boutique",
  toolEarningsOverlay: "Gains en boutique (badges sur le storefront)",
  earnBadgeTitle: "Ce que vous avez gagné sur cette publication. Cliquez pour le détail complet.",
  earnDetailTitle: "Gains du produit",
  earnByStore: "Gains par boutique",
  earnByYear: "Gains par année",
  earnByMonth: "Gains par mois",
  earnCampaigns: "Campagnes Creator Connections",
  earnOnsite: "sur Amazon",
  earnOffsite: "hors Amazon",
  earnScopeThisMarket: "Ce marché",
  earnScopeAllStores: "Toutes les boutiques",
  earnUnits: (n) => `${n} unité${n === 1 ? "" : "s"}`,
  earnOrders: (n) => `${n} commande${n === 1 ? "" : "s"}`,
  earnRate: (pct) => `taux ${pct}%`,
  earnClicks: (n) => `${n} clic${n === 1 ? "" : "s"}`,
  earnViewBreakdown: "Voir le détail",
  earnNoBreakdown: "Mettez à jour l'application de bureau pour voir le détail par boutique, année, mois et campagne.",
  earnClose: "Fermer",

  sumVideoMoney: "Revenus par vidéo",
  vmPanelTitle: "Revenus par vidéo",
  vmVideoCount: (n) => `${n} vidéo${n === 1 ? "" : "s"}`,
  vmEarnedTitle: "Vos gains réels sur le produit de cette vidéo. Cliquez pour le détail.",
  vmEpv: (money) => `${money}/1k vues`,
  vmProjected: (money) => `~${money} est.`,
  vmRateLive: (pct) => `Paie ${pct}% maintenant`,
  vmRateEnding: (pct) => `${pct}% bientôt fini`,
  vmBought: (n) => `${n.toLocaleString()} achetés/mois`,
  vmCoolingChip: "Demande en baisse",
  vmProjectionNote: "Connectez l'application de bureau pour voir les gains réels. Projections affichées pour l'instant.",
  vmTopEarners: "Meilleurs revenus",
  vmBestEpv: "Meilleur par vue",
  vmReshoot: "À refilmer",
  vmReshootHint: "Commission élevée, peu de vues",
  vmDrafts: "Terminez votre brouillon",
  vmDraftsHint: "Les vidéos non publiées ne rapportent rien",
  vmCooling: "En refroidissement / à retirer",
  vmCoolingHint: "Demande en baisse ou campagne terminée",
  vmExport: "Exporter CSV",

  sumCampaignRadar: "Radar de campagnes",
  toolCampaignRadar: "Radar de campagnes (mettre en évidence)",
  campaignRadarActive: "Le Radar de campagnes est actif.",
  radarCount: (n) => `${n} campagnes notées`,
  radarMinCommission: "Taux min. (%)",
  radarMinDays: "Jours min. restants",
  radarMinBudget: "Budget min. ($)",
  radarOnlyPassing: "Seulement les campagnes qui passent",
  radarSortLabel: "Trier",
  radarSortScore: "Meilleure correspondance",
  radarSortRate: "Commission",
  radarSortDays: "Jours restants",
  radarSortRelevance: "Ordre de la page",
  radarChipOwned: "Vous l'avez déjà",
  radarChipEarner: "Vous avez déjà gagné dessus",
  radarChipEnded: "Terminée",
  radarChipCc: "Éligible CC",
  radarChipSpcc: "Éligible SPCC",
  radarAvailChip: (code, status) =>
    status === "available" ? `${code} ✓` : status === "unavailable" ? `${code} ✗` : `${code} ?`,
  radarAvailTitle: (code, status) =>
    status === "available"
      ? `Disponible à l'achat sur la boutique Amazon ${code}`
      : status === "unavailable"
        ? `Indisponible à l'achat sur la boutique Amazon ${code}`
        : `Impossible de vérifier la boutique Amazon ${code} pour le moment`,
  radarVideoChip: (n) => (n === 0 ? "Aucune vidéo pour l'instant" : `${n} ${n === 1 ? "vidéo" : "vidéos"}`),
  radarVideoTitle:
    "Vidéos de créateurs déjà présentes sur ce produit. Moins il y en a, moins la concurrence est forte.",
  popupAvailabilityLabel: "Afficher la disponibilité pour",
  popupAvailabilityHint:
    "Campaign Radar vérifie chaque produit de campagne sur les boutiques Amazon de ces pays et affiche une pastille par pays.",
  popupAvailabilityAuDenied:
    "L'Australie nécessite l'autorisation de lire amazon.com.au. Autorisez-la quand Chrome le demande, puis réessayez.",

  lastCallWatch: "Demander au Butler de surveiller cette campagne",
  lastCallWatching: "Le Butler surveille : alerte Dernier Appel activée",
  lastCallFull: "Complète",
  lastCallFillUnknown: "Remplissage inconnu",
  lastCallFillLabel: (pct, filled, total) => `${pct}% remplie : ${filled}/${total}`,
  lastCallCampaignFallback: "Une campagne",
  lastCallNotifTitle: "Butler Dernier Appel",
  lastCallNotifNearFull: (name, pct) =>
    `Dernier Appel : ${name} est remplie à ${pct}%. Acceptez avant la fermeture.`,
  lastCallNotifFilled: (name) => `${name} vient de se remplir.`,

  campaignBriefButton: "Fiche",
  campaignBriefTitle: "La fiche du Butler",
  campaignBriefLoading: "Le Butler analyse cette campagne...",
  campaignBriefConfidence: (n) => `${n} de confiance`,
  campaignBriefWhy: "Pourquoi je la prendrais",
  campaignBriefFilm: "Quoi filmer",
  campaignBriefPick: "Le meilleur choix du catalogue",
  campaignBriefPickEst: (units, revenue) => `Est. ${units} unités/mois, ${revenue}/mois`,
  campaignBriefSaturation: (n) =>
    n === 0
      ? "Aucune vidéo de créateur sur ce produit pour l'instant : une place à prendre."
      : `${n} ${n === 1 ? "vidéo" : "vidéos"} de créateurs déjà sur ce produit (saturation).`,
  campaignBriefOnAmazon: "Sur Amazon",
  campaignBriefOffAmazon: "Hors Amazon aussi",
  campaignBriefAudience: "Pour qui",
  campaignBriefAccept: "Accepter la campagne",
  campaignBriefCopy: "Copier la fiche",
  campaignBriefCopied: "Copié",
  campaignBriefClose: "Fermer",
  campaignBriefError: "Le Butler n'a pas pu rédiger une fiche complète pour le moment. Voici le détail du score.",
  campaignBriefConnectHint: "Connectez votre propre clé d'API OpenAI et le Butler rédigera une fiche complète à chaque fois.",
  campaignBriefKeyErrorHint: "Votre clé OpenAI connectée n'a pas pu terminer cette fiche. Vérifiez-la dans les Réglages.",
  campaignBriefConnectBtn: "Connecter OpenAI",
  campaignBriefOpenSettingsBtn: "Ouvrir les réglages",
  campaignBriefVerdictHot: "À accepter",
  campaignBriefVerdictWarm: "Vaut un coup d'oeil",
  campaignBriefVerdictCool: "Plutôt à laisser",

  sumCampaignDetail: "Détail de campagne",
  campaignDetailTitle: "Lecture produit du Butler",
  campaignDetailProducts: "Produits de cette campagne",
  campaignDetailNoProducts: "Aucun produit détecté sur cette campagne pour l'instant.",
  campaignDetailNoData: "Pas encore de données de demande dans le catalogue.",
  campaignDetailBought: (n) => `${n}+ achetés/mois`,

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
  kvRoiPerMinute: "Profit par minute de tournage",
  perMinuteSuffix: "/min",
  roiPerMinuteNote: "Profit mensuel estimé divisé par les minutes passées à tourner et monter. Votre vraie limite est le temps: ceci classe les produits selon le retour que chaque minute d'effort rapporte.",
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
  sfOpeningPhotos: (done, total) =>
    `Ouverture des photos et listes (vidéos déjà analysées via le flux)... ${done} sur ${total}`,
  sfOpeningProducts: (done, total) => `Ouverture des produits... ${done} sur ${total}`,
  sfEtaMinLeft: (min) => ` (environ ${min} min restantes)`,
  sfCheckedFirst: (cap) => `Les ${cap} premiers produits vérifiés (le storefront en a plus).`,
  sfScanFailed: "L'analyse a échoué. Rechargez l'onglet du storefront et réessayez.",
  sfStopped: "Arrêté.",
  sfDone: (items, pages, capped) =>
    `Terminé: ${items} éléments sur ${pages} pages${capped ? " (flux limité)" : ""}.`,
  sfCoverage: (items, reported) =>
    `${items} éléments analysés; le storefront indique environ ${reported} publications.`,
  sfStoppedEarly: (reason) =>
    `Le flux s'est arrêté prématurément (${reason}), du contenu peut donc manquer. Relancez l'analyse pour réessayer.`,
  sfDroppedCards: (n) => `${n} cartes du flux avaient un type non reconnu et ont été ignorées.`,
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
  ofrEarnedChip: (amount) => `${amount} gagnés`,
  ofrFilmFirst: "Filmez ceci d'abord",
  ofrCoverage: (covered, total) => `${covered} sur ${total} ont votre contenu`,
  ofrGaps: (n) => `${n} manque${n === 1 ? "" : "s"}`,
  ofrEarningGaps: (n) => `${n} déjà rentable${n === 1 ? "" : "s"} sans vidéo`,
  countInfluencerN: (n) => `${n} vidéo${n === 1 ? "" : "s"} d'influenceurs`,
  countPending: "Nombre non disponible",

  campaigns: "Campagnes",
  noCampaign: "Aucune campagne Creator Connections ou SPCC trouvée pour ce produit.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  ccNotAvailable: "Creator Connections non disponible",
  spccNotAvailable: "SPCC non disponible",
  enrolledCc: "Inscrit à Creator Connections",
  enrolledSpcc: "Inscrit à SPCC",
  enrolledRate: (pct) => `${pct}% de commission`,
  epc: (money) => `EPC ${money}`,
  campaignConnectNote: "Ouvrez l'app Influencer Butler pour accepter cette campagne (l'app confirme et accepte).",
  dealAvailable: "Offre disponible",
  dealPushNote: "Envoyez-la vers Deals Butler depuis la section Send to your butler app ci-dessous.",

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
  pushToDailyDeals: "Envoyer vers Deals Butler",
  searchSendDeals: "Envoyer les deals vers l'app",
  searchNoDeals: "Aucune promo sur cette page.",
  searchSendingDeals: (n) => `Envoi de ${n} deal(s) vers votre app...`,
  sendToContentButler: "Envoyer à Content Butler",
  saveToLinkButler: "Enregistrer dans Link Butler",
  savingLink: "Enregistrement du lien...",
  acceptCc: "Accepter la campagne CC",
  acceptSpcc: "Accepter la campagne SPCC",
  addToCollab: "Ajouter à Collab Butler",
  addingCollab: "Ajout à Collab Butler...",
  pitchThisBrand: (brand) => `Contacter ${brand}`,
  pitchingBrand: "Ajout à Pitch Butler...",
  generatePhoto: "Générer une photo IA",
  generatingPhoto: "Génération d'une photo IA dans votre app...",
  requestSample: "Demander un échantillon",
  requestingSample: "Préparation de votre demande d'échantillon...",
  addToIdeaList: "Ajouter à une Idea List",
  addingToIdeaList: "Mise en file pour Idea List Butler...",
  ideaListNewListOption: "Nouvelle Idea List...",
  tileMenuAddToIdeaList: "Ajouter à une Idea List Amazon",
  pushingDeals: "Envoi vers votre espace deals...",
  sendingContent: "Envoi à Content Butler...",
  checkingCc: "Vérification de Creator Connections...",
  checkingSpcc: "Vérification de Sponsored Products...",
  sentToApp: "Envoyé à votre app.",
  couldNotReachApp: "Impossible de joindre l'app. Est-elle toujours ouverte?",
  connectAppToPair:
    "Connectez l'app d'abord : ouvrez la fenetre de l'extension et associez avec le code a 6 chiffres.",
  connectedToApp: (version) =>
    `Connecté à votre app Influencer Butler${version}. L'acceptation utilise votre catalogue Creator Connections local.`,
  upsellSignedIn:
    "Ouvrez l'app de bureau Influencer Butler pour envoyer ce produit vers vos Deals Butler, Content Butler et auto-accepter les campagnes.",
  upsellSignedOut:
    "Faites le reste avec l'app: envoyez ce produit vers Deals Butler avec votre modèle de publication et vos destinations sociales, envoyez-le à Content Butler et auto-acceptez les campagnes Creator Connections.",
  ctaOpenApp: "Ouvrir ou installer l'app",
  ctaStartTrial: "Démarrer votre essai gratuit",
  toolsAlwaysFree: "Les outils d'analyse ci-dessus sont toujours gratuits. L'app ajoute l'automatisation.",

  sfSendToRetag: (n) => `Envoyer ${n} problème(s) vers Retag Butler`,
  sfSendToContent: (n) => `Envoyer ${n} produit(s) vers Content Butler`,
  sfSendingToContent: "Envoi vers Content Butler...",
  sfSendingToRetag: "Envoi vers Retag Butler...",
  sfAcceptAllCampaigns: (n) => `Accepter toutes les campagnes disponibles (${n})`,
  sfAcceptingCampaigns: "Acceptation des campagnes dans l'app...",
  obSendToContentButler: (n) => `Envoyer ${n} produit(s) vers Content Butler`,
  obSendingToContentButler: "Envoi vers Content Butler...",
  obSentToContentButler: (n) => `${n} produit(s) envoyé(s) vers Content Butler.`,
  appBridgeHeading: "App de bureau",
  appBridgeBlurb:
    "Connectez l'app de bureau Influencer Butler pour accepter des campagnes et envoyer des produits à vos butlers directement depuis Amazon.",
  appNextStepHint:
    "Vous êtes synchronisé avec votre tableau de bord. Pour aussi accepter des campagnes et envoyer des produits à vos butlers, connectez l'app de bureau ci-dessous. Cette étape est facultative.",
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
    "Vous utilisez Influencer Butler depuis un jour. Rejoignez notre groupe Facebook pour échanger des astuces et des réussites avec d'autres Amazon Influencers et découvrir les nouveautés en premier. Pour signaler un bug ou tout ce dont vous avez besoin de notre équipe, utilisez plutôt Feedback Butler.",
  nudgeFbJoin: "Rejoindre le groupe Facebook",
  nudgeFbReport: "Plutôt signaler un bug",
  nudgeAppNotifTitle: "Obtenez l'app de bureau Influencer Butler gratuite",
  nudgeAppNotifBody:
    "Automatisez les deals, le contenu et l'acceptation des campagnes depuis votre ordinateur. Cliquez pour la télécharger gratuitement pour Windows ou Mac.",
  nudgeAppTitle: "Prêt pour l'app de bureau?",
  nudgeAppBody:
    "L'app de bureau fait le gros du travail: envoyez des produits vers Deals Butler, transmettez-les à Content Butler et auto-acceptez les campagnes Creator Connections.",
  nudgeAppFree: "Elle est gratuite à télécharger et fonctionne avec cette extension.",
  nudgeAppDownloadWindows: "Télécharger pour Windows",
  nudgeAppDownloadMac: "Télécharger pour Mac",
  nudgeAppDownloadGeneric: "Télécharger l'app de bureau",
  nudgeAppIntelMac: "Vous utilisez un Mac Intel?",
  nudgeCommunityNotifTitle: "Une astuce rapide pour obtenir de l'aide",
  nudgeCommunityNotifBody:
    "Profitez du groupe Facebook pour les astuces et les réussites. Pour signaler un bug ou demander une fonctionnalité, utilisez Feedback Butler pour que notre équipe puisse vous aider.",
  nudgeCommunityTitle: "Tirez le meilleur de la communauté",
  nudgeCommunityBody:
    "Vous êtes avec nous depuis quelques jours maintenant. Notre groupe Facebook est un endroit idéal pour les astuces, les conseils et les réussites d'autres créateurs. Venez nous rejoindre.",
  nudgeCommunityNote:
    "Une petite chose : le groupe est dédié à la communauté et aux astuces, pas aux signalements de bugs, aux réclamations ni à la facturation. Pour tout ce dont vous avez besoin de notre équipe, utilisez Feedback Butler. C'est le moyen le plus rapide de nous joindre et cela arrive directement aux personnes qui peuvent vous aider.",
  nudgeCommunityUnderstand: "J'ai compris",
  nudgeCommunityReport: "Signaler un bug (Feedback Butler)",

  updateBannerTitle: "Votre extension Influencer Butler a une mise à jour en attente.",
  updateBannerBody: (version) =>
    `La version ${version} est prête à être installée. Cela ne prend qu'une seconde et vos réglages sont conservés.`,
  updateNow: "Mettre à jour",
  updateRemindLater: "Me le rappeler plus tard",
  updateAppliedTitle: "Mise à jour installée",
  updateRefreshBody: "Actualisez cette page pour terminer le passage à la nouvelle version.",
  updateRefreshBtn: "Actualiser la page",
  updatePopupHeading: "Mise à jour disponible",
  updatePopupBody: (current, available) =>
    `La version ${available} est prête à être installée (vous avez la ${current}). L'extension redémarre dans un instant; vos réglages sont conservés.`,

  whatsNewTitle: "Nouveautés",
  whatsNewFeaturesHeading: "Nouvelles fonctionnalités",
  whatsNewFixesHeading: "Corrections",
  whatsNewReportedHeading: "Problèmes que vous avez signalés et corrigés",
  whatsNewOtherHeading: "Autres changements notables",
  whatsNewDismiss: "Compris",

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
  popupListsHeading: "Mes listes",
  popupListsEmpty: "Aucune liste pour l'instant. Ajoutez un produit à une liste depuis le menu d'actions de l'overlay de recherche.",
  popupListItems: (n) => (n === 1 ? "1 produit" : `${n} produits`),
  popupListDelete: "Supprimer la liste",
  watchCondBackInStock: "De retour en stock",
  watchCondSlotOpens: "Créneau vidéo libre",
  watchCondPriceDrop: "Baisse de prix",
  watchRemoveShort: "Retirer",

  storefrontDetectedTitle: "Boutique détectée",
  storefrontDetectedBody: (handle) =>
    `Nous avons trouvé votre boutique (${handle}) et l'avons enregistrée dans les Réglages. Vous pouvez la modifier à tout moment.`,

  obReplayLink: "Guide de configuration",
  obTitle: "Configurer Influencer Butler",
  obProgress: (current, total) => `Étape ${current} sur ${total}`,
  obBack: "Retour",
  obNext: "Suivant",
  obSkip: "Ignorer pour l'instant",
  obFinish: "Terminer",
  obWelcomeTitle: "Bienvenue dans Influencer Butler",
  obWelcomeBody:
    "Cette configuration rapide prépare vos signaux de revenus, votre boutique et vos liens. Cela prend environ une minute, et vous pouvez ignorer toute étape.",
  obWelcomePin: "Astuce: épinglez l'extension pour garder son bouton à portée de clic. Cliquez sur l'icône de pièce de puzzle dans la barre de Chrome, puis sur l'épingle à côté d'Influencer Butler.",
  obAccountTitle: "Connectez votre compte",
  obAccountBody:
    "Ajoutez votre clé de licence pour synchroniser vos trouvailles avec votre tableau de bord et l'app de bureau. Tout fonctionne sans elle, vous pouvez donc ignorer cette étape.",
  obAccountConnected: (email) => `Connecté en tant que ${email}.`,
  obAccountSkipHint: "Pas encore de compte? Ignorez cette étape: l'extension est entièrement utilisable gratuitement.",
  obStorefrontTitle: "Votre boutique",
  obStorefrontBody:
    "L'identifiant de votre boutique Amazon alimente vos liens et les vérifications de boutique. C'est la partie qui suit /shop/ dans l'URL de votre boutique.",
  obStorefrontAuto:
    "Pas besoin de la chercher: nous la remplissons automatiquement la première fois que vous ouvrez votre Creator Hub Amazon.",
  obStorefrontDetected: (handle) => `Détecté: ${handle}`,
  obToolsTitle: "Activez les outils souhaités",
  obToolsBody:
    "Ils sont activés par défaut. Désactivez ce dont vous n'avez pas besoin maintenant; vous pourrez tout modifier plus tard dans les Réglages.",
  obAppTitle: "Connectez l'app de bureau",
  obAppBody:
    "Appairez l'app de bureau Influencer Butler pour accepter des campagnes et envoyer des produits à vos butlers directement depuis Amazon. Saisissez le code à 6 chiffres affiché dans l'app.",
  obAppSkipHint: "L'app de bureau n'est pas ouverte? Ignorez cette étape et appairez plus tard depuis la fenêtre.",
  obDoneTitle: "Tout est prêt",
  obDoneBody:
    "Influencer Butler est prêt. Ouvrez un produit, votre boutique ou une campagne Creator Connections pour le voir à l'œuvre.",
  obDoneHelp: "Ouvrir l'aide",
  obDoneDashboard: "Mon tableau de bord",
  obDoneClose: "Terminé",

  syncTitle: "Synchroniser avec l'app de bureau",
  syncBlurb:
    "Copiez vos fournisseurs de liens, vos balises d'affiliation et votre ID de boutique entre cette extension et l'app de bureau.",
  syncNow: "Synchroniser maintenant",
  syncChecking: "Vérification...",
  syncInSync: "Tout est déjà synchronisé.",
  syncNotPaired: "Connectez d'abord l'app de bureau pour synchroniser les réglages.",
  syncAppOutdated: "Mettez à jour l'app de bureau pour synchroniser les réglages.",
  syncFilled: (n) =>
    n === 1 ? "1 réglage rempli depuis l'app de bureau." : `${n} réglages remplis depuis l'app de bureau.`,
  syncFailed: "Impossible de joindre l'app de bureau. Assurez-vous qu'elle est ouverte.",
  syncConfirmTitle: "Ces réglages diffèrent",
  syncConfirmBody: (n) =>
    n === 1
      ? "1 réglage diffère entre l'extension et l'app de bureau. Choisissez le côté à conserver."
      : `${n} réglages diffèrent entre l'extension et l'app de bureau. Choisissez le côté à conserver.`,
  syncConfirmList: "Réglages différents:",
  syncConfirmAppWins: "Utiliser les valeurs de l'app de bureau",
  syncConfirmExtWins: "Utiliser les valeurs de l'extension",
  syncCancel: "Annuler",
  syncDone: "Synchronisé.",
};

export type Locale = "en" | "es" | "fr";

export const CATALOG: Record<Locale, Dict> = { en, es, fr };
