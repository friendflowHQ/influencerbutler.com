import type { Locale } from "../i18n/catalog";

// Strings for the Deal Sites Harvester page. Kept separate from the shared
// popup/content catalog so this page does not bloat those bundles, same pattern
// as the options page. No em dashes anywhere (repo rule).

export interface DealsDict {
  pageTitle: string;
  pageIntro: string;
  sourcesHeading: string;
  curatedLabel: string;
  savedLabel: string;
  pasteLabel: string;
  pastePlaceholder: string;
  addSaved: string;
  remove: string;
  harvest: string;
  harvesting: string;
  stop: string;
  resultsHeading: string;
  selectAll: string;
  none: string;
  colProduct: string;
  colPrice: string;
  colDiscount: string;
  colCommission: string;
  colSource: string;
  noResults: string;
  someErrors: string;
  cappedNote: string;
  enriching: string;
  sendHeading: string;
  workspaceLabel: string;
  sendSelected: string;
  sending: string;
  sentToApp: string;
  appNotConnected: string;
  signInFirst: string;
  savedToDashboard: string;
  syncFailed: string;
  permissionDenied: string;
  nothingSelected: string;
  addUrlsFirst: string;
}

const en: DealsDict = {
  pageTitle: "Deal Sites Harvester",
  pageIntro:
    "Paste the daily-deal sites you follow. The harvester reads each one, pulls out the Amazon products, fills in price and commission, and sends the ones you pick into a Daily Deals workspace in the app.",
  sourcesHeading: "Sites to harvest",
  curatedLabel: "Include the recommended sites",
  savedLabel: "Your saved sites",
  pasteLabel: "Paste more sites (one URL per line)",
  pastePlaceholder: "https://www.example-deals.com/",
  addSaved: "Save these sites",
  remove: "Remove",
  harvest: "Harvest deals",
  harvesting: "Harvesting...",
  stop: "Stop",
  resultsHeading: "Found deals",
  selectAll: "Select all",
  none: "None",
  colProduct: "Product",
  colPrice: "Price",
  colDiscount: "Discount",
  colCommission: "Commission",
  colSource: "From",
  noResults: "No Amazon products were found on those sites.",
  someErrors: "Some sites could not be read:",
  cappedNote: "Results were capped. Harvest fewer sites at a time for full coverage.",
  enriching: "Filling in prices and commission...",
  sendHeading: "Send to a workspace",
  workspaceLabel: "Daily Deals workspace",
  sendSelected: "Send selected to workspace",
  sending: "Sending...",
  sentToApp: "Sent to the app.",
  appNotConnected: "Open the desktop app and pair it (from the extension popup) to receive deals.",
  signInFirst: "Sign in from the extension popup to enrich and record deals.",
  savedToDashboard: "Saved to your dashboard.",
  syncFailed: "Could not save to your dashboard.",
  permissionDenied: "Permission to read those sites was declined.",
  nothingSelected: "Select at least one deal to send.",
  addUrlsFirst: "Add at least one site to harvest.",
};

const es: DealsDict = {
  pageTitle: "Recolector de sitios de ofertas",
  pageIntro:
    "Pega los sitios de ofertas diarias que sigues. El recolector lee cada uno, extrae los productos de Amazon, completa precio y comisión, y envía los que elijas a un espacio de Ofertas Diarias en la app.",
  sourcesHeading: "Sitios a recolectar",
  curatedLabel: "Incluir los sitios recomendados",
  savedLabel: "Tus sitios guardados",
  pasteLabel: "Pega más sitios (una URL por línea)",
  pastePlaceholder: "https://www.ejemplo-ofertas.com/",
  addSaved: "Guardar estos sitios",
  remove: "Quitar",
  harvest: "Recolectar ofertas",
  harvesting: "Recolectando...",
  stop: "Detener",
  resultsHeading: "Ofertas encontradas",
  selectAll: "Seleccionar todo",
  none: "Ninguno",
  colProduct: "Producto",
  colPrice: "Precio",
  colDiscount: "Descuento",
  colCommission: "Comisión",
  colSource: "De",
  noResults: "No se encontraron productos de Amazon en esos sitios.",
  someErrors: "Algunos sitios no se pudieron leer:",
  cappedNote: "Se limitaron los resultados. Recolecta menos sitios a la vez para cobertura completa.",
  enriching: "Completando precios y comisión...",
  sendHeading: "Enviar a un espacio",
  workspaceLabel: "Espacio de Ofertas Diarias",
  sendSelected: "Enviar seleccionados al espacio",
  sending: "Enviando...",
  sentToApp: "Enviado a la app.",
  appNotConnected: "Abre la app de escritorio y vincúlala (desde el popup de la extensión) para recibir ofertas.",
  signInFirst: "Inicia sesión desde el popup de la extensión para enriquecer y registrar ofertas.",
  savedToDashboard: "Guardado en tu panel.",
  syncFailed: "No se pudo guardar en tu panel.",
  permissionDenied: "Se rechazó el permiso para leer esos sitios.",
  nothingSelected: "Selecciona al menos una oferta para enviar.",
  addUrlsFirst: "Añade al menos un sitio para recolectar.",
};

const fr: DealsDict = {
  pageTitle: "Collecteur de sites de bons plans",
  pageIntro:
    "Collez les sites de bons plans que vous suivez. Le collecteur lit chacun, en extrait les produits Amazon, complète le prix et la commission, et envoie ceux que vous choisissez vers un espace Offres du Jour dans l'app.",
  sourcesHeading: "Sites à collecter",
  curatedLabel: "Inclure les sites recommandés",
  savedLabel: "Vos sites enregistrés",
  pasteLabel: "Collez d'autres sites (une URL par ligne)",
  pastePlaceholder: "https://www.exemple-bons-plans.com/",
  addSaved: "Enregistrer ces sites",
  remove: "Retirer",
  harvest: "Collecter les offres",
  harvesting: "Collecte...",
  stop: "Arrêter",
  resultsHeading: "Offres trouvées",
  selectAll: "Tout sélectionner",
  none: "Aucun",
  colProduct: "Produit",
  colPrice: "Prix",
  colDiscount: "Remise",
  colCommission: "Commission",
  colSource: "De",
  noResults: "Aucun produit Amazon trouvé sur ces sites.",
  someErrors: "Certains sites n'ont pas pu être lus:",
  cappedNote: "Les résultats ont été limités. Collectez moins de sites à la fois pour une couverture complète.",
  enriching: "Ajout des prix et de la commission...",
  sendHeading: "Envoyer vers un espace",
  workspaceLabel: "Espace Offres du Jour",
  sendSelected: "Envoyer la sélection vers l'espace",
  sending: "Envoi...",
  sentToApp: "Envoyé à l'app.",
  appNotConnected: "Ouvrez l'app de bureau et associez-la (depuis le popup de l'extension) pour recevoir les offres.",
  signInFirst: "Connectez-vous depuis le popup de l'extension pour enrichir et enregistrer les offres.",
  savedToDashboard: "Enregistré dans votre tableau de bord.",
  syncFailed: "Impossible d'enregistrer dans votre tableau de bord.",
  permissionDenied: "L'autorisation de lire ces sites a été refusée.",
  nothingSelected: "Sélectionnez au moins une offre à envoyer.",
  addUrlsFirst: "Ajoutez au moins un site à collecter.",
};

export const DEALS_CATALOG: Record<Locale, DealsDict> = { en, es, fr };
