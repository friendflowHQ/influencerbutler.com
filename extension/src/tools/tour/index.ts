import { showHudPanel } from "../../ui/components";
import { startTour, type TourLabels, type TourStep } from "../../ui/tour";
import { getLocale } from "../../i18n";
import type { Locale } from "../../i18n/catalog";
import { patchState, getState } from "../../storage/store";
import { UI_PREFIX } from "../../shared/constants";
import type { PageType } from "../../content/page-type";

// Guided page tours. One short tour per page type, offered once (a dismissible
// corner card, never auto-started) and replayable from the popup. Copy lives
// here, not in the shared catalog, to keep that bundle lean (same pattern as
// deals/strings.ts). No em dashes (repo rule).

type TourKey = "product" | "search" | "storefront" | "campaign";

type TourDict = {
  labels: TourLabels;
  offerTitle: string;
  offerBody: string;
  offerYes: string;
  offerNo: string;
  steps: Record<TourKey, Array<{ title: string; body: string }>>;
};

const EN: TourDict = {
  labels: { next: "Next", back: "Back", skip: "Skip tour", done: "Got it", stepOf: (n, total) => `Step ${n} of ${total}` },
  offerTitle: "New here? Take a 30 second tour",
  offerBody: "See what Influencer Butler shows on this kind of page and how to use it.",
  offerYes: "Show me",
  offerNo: "Not now",
  steps: {
    product: [
      { title: "Your Butler panel", body: "Everything for this product lives here: earnings, commission, price history, your link, and more. Click the header to collapse it." },
      { title: "Open it any time", body: "Click the Influencer Butler icon in the Chrome toolbar to show or hide this panel on any product page." },
      { title: "Turn tools on or off", body: "Open the toolbar popup and scroll to the tool list to switch individual tools. The popup's 'This page' card tells you what is active here." },
    ],
    search: [
      { title: "Money signals on every result", body: "Each product gets a row of chips: Butler score, estimated commission, sales rank, and whether you already own or posted it. Hover a chip for what it means." },
      { title: "Filter and sort by money", body: "Use the Influencer Butler toolbar above the results to sort by commission or hide products that do not fit. Use the ? button there for a color legend." },
      { title: "Nothing showing?", body: "Make sure Search overlay is on in the toolbar popup. If the desktop app is closed, some chips (like earnings) stay hidden until you open it." },
    ],
    storefront: [
      { title: "Storefront check", body: "Butler scans your storefront for untagged, dead, or duplicate videos. Start the check from the panel on this page." },
      { title: "Keep your storefront healthy", body: "Run it after you upload a batch so you catch broken links early." },
    ],
    campaign: [
      { title: "Campaign radar", body: "Each campaign card is scored by commission rate and how full it is, so you can see the best opportunities at a glance." },
      { title: "Last Call", body: "Campaigns that are almost full are flagged. Use the watch bell to get told before a spot disappears." },
    ],
  },
};

const ES: TourDict = {
  labels: { next: "Siguiente", back: "Atras", skip: "Omitir tour", done: "Entendido", stepOf: (n, total) => `Paso ${n} de ${total}` },
  offerTitle: "Nuevo aqui? Haz un tour de 30 segundos",
  offerBody: "Mira que muestra Influencer Butler en este tipo de pagina y como usarlo.",
  offerYes: "Mostrarme",
  offerNo: "Ahora no",
  steps: {
    product: [
      { title: "Tu panel Butler", body: "Todo lo de este producto vive aqui: ganancias, comision, historial de precios, tu enlace y mas. Haz clic en el encabezado para contraerlo." },
      { title: "Abrelo cuando quieras", body: "Haz clic en el icono de Influencer Butler en la barra de Chrome para mostrar u ocultar este panel en cualquier pagina de producto." },
      { title: "Activa o desactiva herramientas", body: "Abre el popup de la barra y baja hasta la lista de herramientas. La tarjeta 'Esta pagina' te dice que esta activo aqui." },
    ],
    search: [
      { title: "Senales de dinero en cada resultado", body: "Cada producto muestra chips: puntuacion Butler, comision estimada, ranking de ventas y si ya lo tienes o lo publicaste. Pasa el cursor por un chip para ver que significa." },
      { title: "Filtra y ordena por dinero", body: "Usa la barra de Influencer Butler sobre los resultados para ordenar por comision u ocultar productos. El boton ? muestra la leyenda de colores." },
      { title: "No se ve nada?", body: "Verifica que Search overlay este activado en el popup. Si la app de escritorio esta cerrada, algunos chips (como ganancias) no aparecen hasta abrirla." },
    ],
    storefront: [
      { title: "Revision del storefront", body: "Butler busca videos sin etiqueta, rotos o duplicados en tu storefront. Inicia la revision desde el panel de esta pagina." },
      { title: "Mantén tu storefront sano", body: "Ejecutala despues de subir varios videos para detectar enlaces rotos a tiempo." },
    ],
    campaign: [
      { title: "Radar de campanas", body: "Cada campana recibe una puntuacion segun la comision y lo llena que esta, para ver las mejores oportunidades de un vistazo." },
      { title: "Last Call", body: "Las campanas casi llenas se marcan. Usa la campana de seguimiento para que te avisemos antes de que se acabe el cupo." },
    ],
  },
};

const FR: TourDict = {
  labels: { next: "Suivant", back: "Retour", skip: "Passer le tour", done: "Compris", stepOf: (n, total) => `Etape ${n} sur ${total}` },
  offerTitle: "Nouveau ici ? Faites un tour de 30 secondes",
  offerBody: "Voyez ce qu'Influencer Butler affiche sur ce type de page et comment l'utiliser.",
  offerYes: "Montrez-moi",
  offerNo: "Pas maintenant",
  steps: {
    product: [
      { title: "Votre panneau Butler", body: "Tout pour ce produit est ici : gains, commission, historique des prix, votre lien et plus. Cliquez sur l'en-tete pour le replier." },
      { title: "Ouvrez-le quand vous voulez", body: "Cliquez sur l'icone Influencer Butler dans la barre Chrome pour afficher ou masquer ce panneau sur toute page produit." },
      { title: "Activer ou desactiver des outils", body: "Ouvrez le popup de la barre et descendez jusqu'a la liste des outils. La carte 'Cette page' indique ce qui est actif ici." },
    ],
    search: [
      { title: "Signaux d'argent sur chaque resultat", body: "Chaque produit affiche des pastilles : score Butler, commission estimee, rang des ventes et si vous le possedez ou l'avez publie. Survolez une pastille pour sa signification." },
      { title: "Filtrer et trier par argent", body: "Utilisez la barre Influencer Butler au-dessus des resultats pour trier par commission ou masquer des produits. Le bouton ? affiche la legende des couleurs." },
      { title: "Rien ne s'affiche ?", body: "Verifiez que Search overlay est active dans le popup. Si l'application de bureau est fermee, certaines pastilles (comme les gains) restent masquees jusqu'a son ouverture." },
    ],
    storefront: [
      { title: "Controle du storefront", body: "Butler detecte les videos sans etiquette, mortes ou en double dans votre storefront. Lancez le controle depuis le panneau de cette page." },
      { title: "Gardez votre storefront en forme", body: "Lancez-le apres l'ajout de plusieurs videos pour reperer vite les liens casses." },
    ],
    campaign: [
      { title: "Radar de campagnes", body: "Chaque campagne est notee selon la commission et son remplissage, pour reperer d'un coup d'oeil les meilleures opportunites." },
      { title: "Last Call", body: "Les campagnes presque pleines sont signalees. Utilisez la cloche de suivi pour etre prevenu avant qu'une place disparaisse." },
    ],
  },
};

const DICTS: Record<Locale, TourDict> = { en: EN, es: ES, fr: FR };

export function tourKeyForPage(pageType: PageType): TourKey | null {
  switch (pageType) {
    case "product":
      return "product";
    case "search":
    case "brand-store":
    case "discovery":
    case "deals":
    case "idea-list":
      return "search";
    case "storefront":
      return "storefront";
    case "campaign-grid":
    case "campaign-detail":
      return "campaign";
    default:
      return null;
  }
}

function buildSteps(key: TourKey): TourStep[] {
  const d = DICTS[getLocale()] ?? EN;
  const copy = d.steps[key];
  const tileAnchor = (): DOMRect | null => document.querySelector("[data-ib-search]")?.getBoundingClientRect() ?? null;
  return copy.map((c, i) => {
    const step: TourStep = { title: c.title, body: c.body };
    if (key === "product" && i === 0) step.anchor = () => showHudPanel();
    if (key === "search" && i === 0) step.anchor = tileAnchor;
    return step;
  });
}

async function markSeen(key: TourKey): Promise<void> {
  try {
    await patchState((s) => {
      s.hints.tours = { ...(s.hints.tours ?? {}), [key]: Date.now() };
    });
  } catch {
    // Storage unavailable: the offer may show again, which is harmless.
  }
}

// Run the tour for this page type now. Returns false when the page has none.
export function runTourForPage(pageType: PageType): boolean {
  const key = tourKeyForPage(pageType);
  if (!key) return false;
  const d = DICTS[getLocale()] ?? EN;
  startTour(buildSteps(key), d.labels, () => void markSeen(key));
  return true;
}

let offerHost: HTMLElement | null = null;

export function removeTourOffer(): void {
  offerHost?.remove();
  offerHost = null;
}

// Offer the tour once per page type: a small corner card, only for a page type
// the user has never been offered. Dismissing it counts as seen.
export async function maybeOfferTour(pageType: PageType): Promise<void> {
  const key = tourKeyForPage(pageType);
  if (!key || offerHost) return;
  let seen = true;
  try {
    const state = await getState();
    seen = Boolean(state.hints.tours?.[key]);
  } catch {
    return;
  }
  if (seen) return;
  const d = DICTS[getLocale()] ?? EN;

  offerHost = document.createElement("div");
  offerHost.className = `${UI_PREFIX}-tour-offer`;
  const root = offerHost.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .offer { position: fixed; right: 16px; bottom: 16px; z-index: 2147483645; width: min(300px, calc(100vw - 32px));
      box-sizing: border-box; background: #fff; color: #0f172a; border: 1px solid #fed7aa; border-radius: 12px;
      padding: 12px 14px; font: 13px/1.5 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.25); }
    h2 { margin: 0 0 4px; font-size: 14px; } p { margin: 0 0 10px; color: #334155; }
    .row { display: flex; gap: 8px; justify-content: flex-end; }
    button { font: inherit; font-weight: 600; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid #cbd5e1; background: #f1f5f9; color: #0f172a; }
    button.primary { background: #c2410c; border-color: #c2410c; color: #fff; }
    button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }`;
  const card = document.createElement("div");
  card.className = "offer";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", d.offerTitle);
  const h = document.createElement("h2");
  h.textContent = d.offerTitle;
  const p = document.createElement("p");
  p.textContent = d.offerBody;
  const row = document.createElement("div");
  row.className = "row";
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = d.offerNo;
  no.addEventListener("click", () => {
    removeTourOffer();
    void markSeen(key);
  });
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "primary";
  yes.textContent = d.offerYes;
  yes.addEventListener("click", () => {
    removeTourOffer();
    runTourForPage(pageType);
  });
  row.append(no, yes);
  card.append(h, p, row);
  root.append(style, card);
  document.documentElement.append(offerHost);
}
