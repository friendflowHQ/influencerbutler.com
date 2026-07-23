// String catalog for the Link Butler (Ledger) tab. Same shape/pattern as the
// Deal Sites Harvester's DEALS_CATALOG. No em dashes anywhere (repo rule): use
// ":" for label separators and "-" for mid-sentence breaks.

export type LinksDict = {
  pageTitle: string;
  pageIntro: string;
  signedOut: string;

  // Ledger
  ledgerHeading: string;
  rangeToday: string;
  range7d: string;
  range30d: string;
  range90d: string;
  totalClicks: string;
  vsPrevious: string;
  linksCreated: string;
  noClicks: string;
  topLinksHeading: string;
  colLink: string;
  colClicks: string;
  colTarget: string;
  byCountry: string;
  byDevice: string;
  bySurface: string;

  // Registry
  registryHeading: string;
  registryIntro: string;
  noLinks: string;
  loadMore: string;
  repoint: string;
  repointPrompt: string;
  repointDone: string;
  repointUnchanged: string;
  repointInUse: string;
  repointNotFound: string;
  repointBadUrl: string;
  repointedNote: (when: string) => string;
  openLink: string;

  // Pixels
  pixelsHeading: string;
  pixelsIntro: string;
  pixelPlatform: string;
  pixelId: string;
  pixelName: string;
  pixelIdPlaceholder: string;
  pixelNamePlaceholder: string;
  addPixel: string;
  removePixel: string;
  savePixels: string;
  pixelsSaved: string;
  pixelsCleared: string;
  pixelsFailed: string;

  // Settings
  settingsHeading: string;
  smartRoutingLabel: string;
  smartRoutingHelp: string;

  // shared
  loading: string;
  couldNotLoad: string;
  upgradeNeeded: string;
  working: string;
};

const EN: LinksDict = {
  pageTitle: "Link Butler",
  pageIntro:
    "Your branded Influencer Butler links: see how they are performing, fix a posted link, and manage smart routing.",
  signedOut: "Sign in with your license key from the extension popup to use the Link Butler.",

  ledgerHeading: "The Ledger",
  rangeToday: "Today",
  range7d: "7 days",
  range30d: "30 days",
  range90d: "90 days",
  totalClicks: "Total clicks",
  vsPrevious: "vs previous period",
  linksCreated: "Links created",
  noClicks: "No clicks recorded in this period yet.",
  topLinksHeading: "Top links",
  colLink: "Link",
  colClicks: "Clicks",
  colTarget: "Target",
  byCountry: "By country",
  byDevice: "By device",
  bySurface: "By surface",

  registryHeading: "My links",
  registryIntro:
    "Every branded link on your account. Repoint one to send every already-posted copy to a new target.",
  noLinks: "No branded links yet. Mint one from a product page or a harvest.",
  loadMore: "Load more",
  repoint: "Repoint",
  repointPrompt: "New target URL for this link:",
  repointDone: "Repointed. Every posted copy now goes to the new target.",
  repointUnchanged: "That link already points there.",
  repointInUse: "You already have a different link pointing at that URL.",
  repointNotFound: "That link was not found on your account.",
  repointBadUrl: "That is not a valid URL.",
  repointedNote: (when) => `Repointed ${when}`,
  openLink: "Open",

  pixelsHeading: "Retargeting pixels (Doorbell)",
  pixelsIntro:
    "Optional. Pixels fire only on an interstitial page and never for visitors in the EU, UK, or Switzerland.",
  pixelPlatform: "Platform",
  pixelId: "Pixel ID",
  pixelName: "Label (optional)",
  pixelIdPlaceholder: "e.g. 123456789012345",
  pixelNamePlaceholder: "e.g. Main Meta pixel",
  addPixel: "Add pixel",
  removePixel: "Remove",
  savePixels: "Save pixels",
  pixelsSaved: "Pixels saved.",
  pixelsCleared: "Pixels cleared.",
  pixelsFailed: "Could not save pixels.",

  settingsHeading: "Settings",
  smartRoutingLabel: "Publish smart routing when I mint a link",
  smartRoutingHelp:
    "Sends each new branded link to the shopper's local Amazon with your best-earning tag, and heals dead links. Uses the per-country tags from API integrations.",

  loading: "Loading...",
  couldNotLoad: "Could not load. Are you online and signed in?",
  upgradeNeeded: "This needs a paid plan.",
  working: "Working...",
};

const ES: LinksDict = {
  pageTitle: "Link Butler",
  pageIntro:
    "Tus enlaces de marca de Influencer Butler: mira su rendimiento, corrige un enlace publicado y gestiona el enrutamiento inteligente.",
  signedOut: "Inicia sesion con tu clave de licencia desde el popup de la extension para usar Link Butler.",

  ledgerHeading: "El Libro",
  rangeToday: "Hoy",
  range7d: "7 dias",
  range30d: "30 dias",
  range90d: "90 dias",
  totalClicks: "Clics totales",
  vsPrevious: "frente al periodo anterior",
  linksCreated: "Enlaces creados",
  noClicks: "Aun no hay clics en este periodo.",
  topLinksHeading: "Enlaces principales",
  colLink: "Enlace",
  colClicks: "Clics",
  colTarget: "Destino",
  byCountry: "Por pais",
  byDevice: "Por dispositivo",
  bySurface: "Por plataforma",

  registryHeading: "Mis enlaces",
  registryIntro:
    "Todos los enlaces de marca de tu cuenta. Redirige uno para enviar cada copia ya publicada a un nuevo destino.",
  noLinks: "Aun no hay enlaces de marca. Crea uno desde una pagina de producto o una recoleccion.",
  loadMore: "Cargar mas",
  repoint: "Redirigir",
  repointPrompt: "Nueva URL de destino para este enlace:",
  repointDone: "Redirigido. Cada copia publicada ahora va al nuevo destino.",
  repointUnchanged: "Ese enlace ya apunta ahi.",
  repointInUse: "Ya tienes un enlace distinto que apunta a esa URL.",
  repointNotFound: "No se encontro ese enlace en tu cuenta.",
  repointBadUrl: "Esa no es una URL valida.",
  repointedNote: (when) => `Redirigido ${when}`,
  openLink: "Abrir",

  pixelsHeading: "Pixeles de retargeting (Doorbell)",
  pixelsIntro:
    "Opcional. Los pixeles se activan solo en una pagina intermedia y nunca para visitantes de la UE, Reino Unido o Suiza.",
  pixelPlatform: "Plataforma",
  pixelId: "ID del pixel",
  pixelName: "Etiqueta (opcional)",
  pixelIdPlaceholder: "p. ej. 123456789012345",
  pixelNamePlaceholder: "p. ej. Pixel principal de Meta",
  addPixel: "Anadir pixel",
  removePixel: "Quitar",
  savePixels: "Guardar pixeles",
  pixelsSaved: "Pixeles guardados.",
  pixelsCleared: "Pixeles borrados.",
  pixelsFailed: "No se pudieron guardar los pixeles.",

  settingsHeading: "Ajustes",
  smartRoutingLabel: "Publicar enrutamiento inteligente al crear un enlace",
  smartRoutingHelp:
    "Envia cada nuevo enlace de marca al Amazon local del comprador con tu etiqueta mas rentable, y repara enlaces caidos. Usa las etiquetas por pais de las integraciones de API.",

  loading: "Cargando...",
  couldNotLoad: "No se pudo cargar. Estas en linea y con sesion iniciada?",
  upgradeNeeded: "Esto requiere un plan de pago.",
  working: "Procesando...",
};

const FR: LinksDict = {
  pageTitle: "Link Butler",
  pageIntro:
    "Vos liens de marque Influencer Butler : suivez leurs performances, corrigez un lien publie et gerez le routage intelligent.",
  signedOut: "Connectez-vous avec votre cle de licence depuis le popup de l'extension pour utiliser Link Butler.",

  ledgerHeading: "Le Registre",
  rangeToday: "Aujourd'hui",
  range7d: "7 jours",
  range30d: "30 jours",
  range90d: "90 jours",
  totalClicks: "Clics totaux",
  vsPrevious: "par rapport a la periode precedente",
  linksCreated: "Liens crees",
  noClicks: "Aucun clic enregistre sur cette periode pour l'instant.",
  topLinksHeading: "Meilleurs liens",
  colLink: "Lien",
  colClicks: "Clics",
  colTarget: "Cible",
  byCountry: "Par pays",
  byDevice: "Par appareil",
  bySurface: "Par plateforme",

  registryHeading: "Mes liens",
  registryIntro:
    "Tous les liens de marque de votre compte. Redirigez-en un pour envoyer chaque copie deja publiee vers une nouvelle cible.",
  noLinks: "Aucun lien de marque pour l'instant. Creez-en un depuis une page produit ou une collecte.",
  loadMore: "Charger plus",
  repoint: "Rediriger",
  repointPrompt: "Nouvelle URL cible pour ce lien :",
  repointDone: "Redirige. Chaque copie publiee pointe maintenant vers la nouvelle cible.",
  repointUnchanged: "Ce lien pointe deja la.",
  repointInUse: "Vous avez deja un autre lien qui pointe vers cette URL.",
  repointNotFound: "Ce lien est introuvable sur votre compte.",
  repointBadUrl: "Ce n'est pas une URL valide.",
  repointedNote: (when) => `Redirige ${when}`,
  openLink: "Ouvrir",

  pixelsHeading: "Pixels de reciblage (Doorbell)",
  pixelsIntro:
    "Optionnel. Les pixels ne se declenchent que sur une page intermediaire et jamais pour les visiteurs de l'UE, du Royaume-Uni ou de Suisse.",
  pixelPlatform: "Plateforme",
  pixelId: "ID du pixel",
  pixelName: "Libelle (optionnel)",
  pixelIdPlaceholder: "ex. 123456789012345",
  pixelNamePlaceholder: "ex. Pixel Meta principal",
  addPixel: "Ajouter un pixel",
  removePixel: "Retirer",
  savePixels: "Enregistrer les pixels",
  pixelsSaved: "Pixels enregistres.",
  pixelsCleared: "Pixels effaces.",
  pixelsFailed: "Impossible d'enregistrer les pixels.",

  settingsHeading: "Reglages",
  smartRoutingLabel: "Publier le routage intelligent quand je cree un lien",
  smartRoutingHelp:
    "Envoie chaque nouveau lien de marque vers l'Amazon local de l'acheteur avec votre tag le plus remunerateur, et repare les liens morts. Utilise les tags par pays des integrations API.",

  loading: "Chargement...",
  couldNotLoad: "Chargement impossible. Etes-vous en ligne et connecte ?",
  upgradeNeeded: "Ceci necessite un plan payant.",
  working: "Traitement...",
};

export const LINKS_CATALOG: Record<"en" | "es" | "fr", LinksDict> = { en: EN, es: ES, fr: FR };
