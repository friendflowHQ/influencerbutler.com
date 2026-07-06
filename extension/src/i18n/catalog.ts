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

  // Butler Approved panel
  butlerApproved: string;
  approvedYes: string;
  approvedNo: string;
  approvedCriteriaNote: string;
  critBought: (n: number) => string;
  critOpenSlot: (n: number) => string;
  critInStock: string;
  critPriceFloor: (n: number) => string;

  // Calculator panel
  breakEvenMath: string;
  noPriceForMath: string;
  calcIntro: string;
  commissionFromSiteStripe: (pct: number) => string;
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

  // Storefront checkup panel
  storefrontCheckup: string;
  sfFastScanNote: string;
  sfDeepContent: string;
  sfCheckAvailability: string;
  sfParentAsins: string;
  sfCheckButton: string;
  sfStop: string;
  sfRescan: string;
  sfScanningFeed: string;
  sfScanningProgress: (items: number, pages: number) => string;
  sfOpeningPhotos: (done: number, total: number) => string;
  sfOpeningProducts: (done: number, total: number) => string;
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
  sfNoIssues: string;
  sfExportCsv: string;
  sfOpen: string;

  // Order-history content-gap panel
  contentGapsHeading: string;
  contentGapsIntro: (n: number) => string;
  scanTheseOrders: (n: number) => string;
  checkingOrder: (i: number, n: number) => string;
  gapNoVideos: string;
  gapNoInfluencer: string;
  gapFewInfluencer: (n: number) => string;
  openProduct: string;
  badgeNoVideos: string;
  badgePending: (n: number) => string;
  badgeNoInfluencer: string;
  badgeInfluencerVideos: (n: number) => string;
  rescan: string;
  scanStopped: string;
  gapsFound: (n: number) => string;
  noGaps: string;

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

  // Campaigns panel
  campaigns: string;
  noCampaign: string;
  ccAvailable: string;
  spccAvailable: string;
  campaignAcceptNote: string;

  // Send to app (HUD) panel
  sendToApp: string;
  pushToDailyDeals: string;
  sendToContentButler: string;
  acceptCc: string;
  acceptSpcc: string;
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
}

const en: Dict = {
  panelChevronHide: "hide",
  panelChevronShow: "show",

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

  videoCompetition: "Video competition",
  noCarousel: "No video carousel found on this page.",
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

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: worth making content for",
  approvedNo: "Not Butler Approved yet",
  approvedCriteriaNote: "Criteria read from this page. Tune thresholds in the extension popup.",
  critBought: (n) => `${n}+ bought in past month`,
  critOpenSlot: (n) => `Fewer than ${n} influencer videos`,
  critInStock: "In stock",
  critPriceFloor: (n) => `Price at least $${n}`,

  breakEvenMath: "Break-even math",
  noPriceForMath: "No price found on this page, so no math to run.",
  calcIntro:
    "How many sales pay back the time you spend filming one video. This assumes the product is free (Creator Connections) or you already own it, not that you buy it.",
  commissionFromSiteStripe: (pct) => `Commission rate ${pct}% read live from your SiteStripe bar.`,
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

  storefrontCheckup: "Storefront checkup",
  sfFastScanNote:
    "Fast scan of your whole storefront through Amazon's own feed: no scrolling, no images loaded. The boxes below add slower deep checks that open each item.",
  sfDeepContent: "Also scan photo and list product tags",
  sfCheckAvailability: "Check product availability (opens each product)",
  sfParentAsins: "Resolve parent ASINs (opens each product)",
  sfCheckButton: "Check my storefront",
  sfStop: "Stop",
  sfRescan: "Rescan",
  sfScanningFeed: "Scanning the feed...",
  sfScanningProgress: (items, pages) => `Scanning the feed... ${items} items across ${pages} pages`,
  sfOpeningPhotos: (done, total) => `Opening photos and lists... ${done} of ${total}`,
  sfOpeningProducts: (done, total) => `Opening products... ${done} of ${total}`,
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
  sfNoIssues: "No untagged or unavailable issues found.",
  sfExportCsv: "Export tagged products (CSV)",
  sfOpen: "Open",

  contentGapsHeading: "Content gaps in your orders",
  contentGapsIntro: (n) =>
    `${n} products on this page. Scan to find ones with few or no influencer videos: products you own and can film today.`,
  scanTheseOrders: (n) => `Scan these orders (up to ${n})`,
  checkingOrder: (i, n) => `Checking ${i} of ${n}...`,
  gapNoVideos: "No videos at all: wide open",
  gapNoInfluencer: "No influencer videos yet",
  gapFewInfluencer: (n) => `Only ${n} influencer video${n === 1 ? "" : "s"}`,
  openProduct: "Open product",
  badgeNoVideos: "No videos at all",
  badgePending: (n) => `${n} videos (visit to classify)`,
  badgeNoInfluencer: "No influencer videos",
  badgeInfluencerVideos: (n) => `${n} influencer videos`,
  rescan: "Rescan",
  scanStopped: "Scan stopped.",
  gapsFound: (n) => `Done: ${n} content gap${n === 1 ? "" : "s"} found. Film what you already own.`,
  noGaps: "Done: no content gaps in these orders.",

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

  campaigns: "Campaigns",
  noCampaign: "No Creator Connections or SPCC campaign found for this product.",
  ccAvailable: "Creator Connections available",
  spccAvailable: "SPCC available",
  campaignAcceptNote: "Accept it from the Send to your butler app section below (the app confirms and accepts).",

  sendToApp: "Send to your butler app",
  pushToDailyDeals: "Push to Daily Deals",
  sendToContentButler: "Send to Content Butler",
  acceptCc: "Accept CC campaign",
  acceptSpcc: "Accept SPCC campaign",
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
};

const es: Dict = {
  panelChevronHide: "ocultar",
  panelChevronShow: "mostrar",

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

  videoCompetition: "Competencia de videos",
  noCarousel: "No se encontró carrusel de videos en esta página.",
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

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: vale la pena crear contenido",
  approvedNo: "Todavía no es Butler Approved",
  approvedCriteriaNote: "Criterios leídos de esta página. Ajusta los umbrales en el popup de la extensión.",
  critBought: (n) => `${n}+ comprados el mes pasado`,
  critOpenSlot: (n) => `Menos de ${n} videos de influencers`,
  critInStock: "En stock",
  critPriceFloor: (n) => `Precio de al menos $${n}`,

  breakEvenMath: "Cálculo de punto de equilibrio",
  noPriceForMath: "No se encontró precio en esta página, así que no hay cálculo que hacer.",
  calcIntro:
    "Cuántas ventas recuperan el tiempo que pasas grabando un video. Esto asume que el producto es gratis (Creator Connections) o que ya lo tienes, no que lo compras.",
  commissionFromSiteStripe: (pct) => `Comisión del ${pct}% leída en vivo de tu barra SiteStripe.`,
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

  storefrontCheckup: "Chequeo del storefront",
  noVideosOnStorefront:
    "Aún no se detectan videos en esta vista del storefront. Desplázate para que carguen los videos y reabre el panel recargando la página.",
  storefrontIntro: (n) => `${n} videos visibles. Revísalos por videos sin etiquetas, exceso de etiquetas y productos caídos.`,
  checkMyStorefront: (n) => `Revisar mi storefront (hasta ${n})`,
  checkingProgress: (done, total) => `Revisados ${done} de ${total} videos...`,
  storefrontDone: (n) => `Listo: ${n} videos revisados.`,
  chipUntagged: (n) => `${n} sin etiquetas`,
  chipOverTagged: (n) => `${n} con exceso de etiquetas`,
  chipDeadProducts: (n) => `${n} con productos caídos`,
  videoFallback: "Video",
  noStorefrontIssues: "No se encontraron problemas. Storefront limpio.",
  storefrontScanFailed: "El escaneo falló; inténtalo de nuevo en un minuto.",
  recheck: "Volver a revisar",

  contentGapsHeading: "Huecos de contenido en tus pedidos",
  contentGapsIntro: (n) =>
    `${n} productos en esta página. Escanea para encontrar los que tienen pocos o cero videos de influencers: productos que ya tienes y puedes grabar hoy.`,
  scanTheseOrders: (n) => `Escanear estos pedidos (hasta ${n})`,
  checkingOrder: (i, n) => `Comprobando ${i} de ${n}...`,
  gapNoVideos: "Sin videos: totalmente abierto",
  gapNoInfluencer: "Aún sin videos de influencers",
  gapFewInfluencer: (n) => `Solo ${n} video${n === 1 ? "" : "s"} de influencers`,
  openProduct: "Abrir producto",
  badgeNoVideos: "Sin videos",
  badgePending: (n) => `${n} videos (visita para clasificar)`,
  badgeNoInfluencer: "Sin videos de influencers",
  badgeInfluencerVideos: (n) => `${n} videos de influencers`,
  rescan: "Volver a escanear",
  scanStopped: "Escaneo detenido.",
  gapsFound: (n) => `Listo: ${n} hueco${n === 1 ? "" : "s"} de contenido encontrado${n === 1 ? "" : "s"}. Graba lo que ya tienes.`,
  noGaps: "Listo: no hay huecos de contenido en estos pedidos.",

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

  campaigns: "Campañas",
  noCampaign: "No se encontró campaña de Creator Connections ni SPCC para este producto.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  campaignAcceptNote: "Acéptala desde la sección Send to your butler app de abajo (la app confirma y acepta).",

  sendToApp: "Enviar a tu app butler",
  pushToDailyDeals: "Enviar a Daily Deals",
  sendToContentButler: "Enviar a Content Butler",
  acceptCc: "Aceptar campaña CC",
  acceptSpcc: "Aceptar campaña SPCC",
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
};

const fr: Dict = {
  panelChevronHide: "masquer",
  panelChevronShow: "afficher",

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

  videoCompetition: "Concurrence vidéo",
  noCarousel: "Aucun carrousel vidéo trouvé sur cette page.",
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

  butlerApproved: "Butler Approved",
  approvedYes: "Butler Approved: ça vaut le coup de créer du contenu",
  approvedNo: "Pas encore Butler Approved",
  approvedCriteriaNote: "Critères lus sur cette page. Réglez les seuils dans le popup de l'extension.",
  critBought: (n) => `${n}+ achetés le mois dernier`,
  critOpenSlot: (n) => `Moins de ${n} vidéos d'influenceurs`,
  critInStock: "En stock",
  critPriceFloor: (n) => `Prix d'au moins ${n} $`,

  breakEvenMath: "Calcul du seuil de rentabilité",
  noPriceForMath: "Aucun prix trouvé sur cette page, donc aucun calcul à faire.",
  calcIntro:
    "Combien de ventes remboursent le temps passé à filmer une vidéo. Cela suppose que le produit est gratuit (Creator Connections) ou que vous le possédez déjà, pas que vous l'achetez.",
  commissionFromSiteStripe: (pct) => `Taux de commission ${pct}% lu en direct de votre barre SiteStripe.`,
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

  storefrontCheckup: "Bilan du storefront",
  noVideosOnStorefront:
    "Aucune vidéo détectée sur cette vue du storefront pour l'instant. Faites défiler pour charger les vidéos, puis rouvrez le panneau en rechargeant la page.",
  storefrontIntro: (n) => `${n} vidéos visibles. Vérifiez-les: vidéos sans étiquettes, sur-étiquetage et produits indisponibles.`,
  checkMyStorefront: (n) => `Vérifier mon storefront (jusqu'à ${n})`,
  checkingProgress: (done, total) => `${done} sur ${total} vidéos vérifiées...`,
  storefrontDone: (n) => `Terminé: ${n} vidéos vérifiées.`,
  chipUntagged: (n) => `${n} sans étiquettes`,
  chipOverTagged: (n) => `${n} sur-étiquetées`,
  chipDeadProducts: (n) => `${n} avec produits indisponibles`,
  videoFallback: "Vidéo",
  noStorefrontIssues: "Aucun problème trouvé. Storefront propre.",
  storefrontScanFailed: "L'analyse a échoué; réessayez dans une minute.",
  recheck: "Revérifier",

  contentGapsHeading: "Manques de contenu dans vos commandes",
  contentGapsIntro: (n) =>
    `${n} produits sur cette page. Analysez pour trouver ceux avec peu ou zéro vidéos d'influenceurs: des produits que vous possédez et pouvez filmer aujourd'hui.`,
  scanTheseOrders: (n) => `Analyser ces commandes (jusqu'à ${n})`,
  checkingOrder: (i, n) => `Vérification ${i} sur ${n}...`,
  gapNoVideos: "Aucune vidéo: grand ouvert",
  gapNoInfluencer: "Pas encore de vidéos d'influenceurs",
  gapFewInfluencer: (n) => `Seulement ${n} vidéo${n === 1 ? "" : "s"} d'influenceurs`,
  openProduct: "Ouvrir le produit",
  badgeNoVideos: "Aucune vidéo",
  badgePending: (n) => `${n} vidéos (visitez pour classer)`,
  badgeNoInfluencer: "Pas de vidéos d'influenceurs",
  badgeInfluencerVideos: (n) => `${n} vidéos d'influenceurs`,
  rescan: "Réanalyser",
  scanStopped: "Analyse arrêtée.",
  gapsFound: (n) => `Terminé: ${n} manque${n === 1 ? "" : "s"} de contenu trouvé${n === 1 ? "" : "s"}. Filmez ce que vous avez déjà.`,
  noGaps: "Terminé: aucun manque de contenu dans ces commandes.",

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

  campaigns: "Campagnes",
  noCampaign: "Aucune campagne Creator Connections ou SPCC trouvée pour ce produit.",
  ccAvailable: "Creator Connections disponible",
  spccAvailable: "SPCC disponible",
  campaignAcceptNote: "Acceptez-la depuis la section Send to your butler app ci-dessous (l'app confirme et accepte).",

  sendToApp: "Envoyer à votre app butler",
  pushToDailyDeals: "Envoyer vers Daily Deals",
  sendToContentButler: "Envoyer à Content Butler",
  acceptCc: "Accepter la campagne CC",
  acceptSpcc: "Accepter la campagne SPCC",
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
};

export type Locale = "en" | "es" | "fr";

export const CATALOG: Record<Locale, Dict> = { en, es, fr };
