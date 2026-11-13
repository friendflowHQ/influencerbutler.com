import type { Locale } from "../i18n/catalog";

// Strings for the "Send these deals to Influencer Butler" button on walmart.com
// deal pages (tools/walmart-deal-capture). Kept in their own small catalog,
// like deals/strings.ts, so the shared content catalog does not grow for one
// button. No em dashes anywhere (repo rule). The "app not running" and "connect
// the app" lines are reused from the Send to Deals chips (DEALS_CATALOG) so
// both surfaces say the same thing.

export interface DealCaptureDict {
  button: string;
  hint: string;
  dismiss: string;
  reading: string;
  sending: (sent: number, total: number) => string;
  noProducts: string;
  sent: (added: number) => string;
  tableTotal: (total: number) => string;
  nothingNew: (total: number) => string;
  capped: (max: number) => string;
  partial: (sent: number, total: number) => string;
  needsUpdate: string;
  failed: string;
}

const en: DealCaptureDict = {
  button: "Send these deals to Influencer Butler",
  hint: "Scroll down first to load more products. The deals go to the Black Friday Deals table in Walmart Butler.",
  dismiss: "Hide the Influencer Butler button",
  reading: "Reading the products on this page...",
  sending: (sent, total) => `Sending ${sent} of ${total} deals...`,
  noProducts: "No products found on this page yet. Scroll down to load some, then click again.",
  sent: (added) => `Sent ${added} deal${added === 1 ? "" : "s"} to your Black Friday Deals table.`,
  tableTotal: (total) => `It now has ${total} deal${total === 1 ? "" : "s"}.`,
  nothingNew: (total) =>
    `No new deals here. Your Black Friday Deals table already has these (${total} deal${total === 1 ? "" : "s"} in it).`,
  capped: (max) => `Only the first ${max} products on the page were sent.`,
  partial: (sent, total) => `${sent} of ${total} deals were sent before this stopped.`,
  needsUpdate: "Update the Influencer Butler desktop app to send these deals, then click again.",
  failed: "Could not send these deals. Try again in a moment.",
};

const es: DealCaptureDict = {
  button: "Enviar estas ofertas a Influencer Butler",
  hint: "Primero desplázate hacia abajo para cargar más productos. Las ofertas van a la tabla Ofertas de Black Friday en Walmart Butler.",
  dismiss: "Ocultar el botón de Influencer Butler",
  reading: "Leyendo los productos de esta página...",
  sending: (sent, total) => `Enviando ${sent} de ${total} ofertas...`,
  noProducts: "Todavía no hay productos en esta página. Desplázate hacia abajo para cargar algunos y vuelve a hacer clic.",
  sent: (added) =>
    added === 1
      ? "Se envió 1 oferta a tu tabla Ofertas de Black Friday."
      : `Se enviaron ${added} ofertas a tu tabla Ofertas de Black Friday.`,
  tableTotal: (total) => (total === 1 ? "Ahora tiene 1 oferta." : `Ahora tiene ${total} ofertas.`),
  nothingNew: (total) =>
    `No hay ofertas nuevas aquí. Tu tabla Ofertas de Black Friday ya las tiene (${total} ${total === 1 ? "oferta" : "ofertas"}).`,
  capped: (max) => `Solo se enviaron los primeros ${max} productos de la página.`,
  partial: (sent, total) => `Se enviaron ${sent} de ${total} ofertas antes de que se detuviera.`,
  needsUpdate: "Actualiza la app de escritorio Influencer Butler para enviar estas ofertas y vuelve a hacer clic.",
  failed: "No se pudieron enviar estas ofertas. Inténtalo de nuevo en un momento.",
};

const fr: DealCaptureDict = {
  button: "Envoyer ces offres à Influencer Butler",
  hint: "Faites d'abord défiler la page pour charger plus de produits. Les offres vont dans le tableau Offres du Black Friday de Walmart Butler.",
  dismiss: "Masquer le bouton Influencer Butler",
  reading: "Lecture des produits de cette page...",
  sending: (sent, total) => `Envoi de ${sent} offres sur ${total}...`,
  noProducts: "Aucun produit sur cette page pour l'instant. Faites défiler pour en charger, puis recliquez.",
  sent: (added) =>
    added === 1
      ? "1 offre envoyée dans votre tableau Offres du Black Friday."
      : `${added} offres envoyées dans votre tableau Offres du Black Friday.`,
  tableTotal: (total) => (total === 1 ? "Il contient maintenant 1 offre." : `Il contient maintenant ${total} offres.`),
  nothingNew: (total) =>
    `Aucune nouvelle offre ici. Votre tableau Offres du Black Friday les contient déjà (${total} ${total === 1 ? "offre" : "offres"}).`,
  capped: (max) => `Seuls les ${max} premiers produits de la page ont été envoyés.`,
  partial: (sent, total) => `${sent} offres sur ${total} ont été envoyées avant l'arrêt.`,
  needsUpdate: "Mettez à jour l'application Influencer Butler pour envoyer ces offres, puis recliquez.",
  failed: "Impossible d'envoyer ces offres. Réessayez dans un instant.",
};

export const DEAL_CAPTURE_CATALOG: Record<Locale, DealCaptureDict> = { en, es, fr };
