import { getLocale } from "../../i18n";
import type { Locale } from "../../i18n/catalog";

// Plain-language key for the chips on search tiles, shown from the "?" button on
// the search toolbar and reused as hover tips. Kept out of the shared catalog
// (same pattern as tools/tour). No em dashes (repo rule).

type LegendDict = {
  button: string;
  hideBadges: string;
  showBadges: string;
  less: string;
  more: (n: number) => string;
  scanFailed: (n: number) => string;
  title: string;
  rows: Array<{ chip: string; text: string }>;
  tips: { score: string; commission: string; bsr: string; owned: string; posted: string; coupon: string; deal: string };
};

const EN: LegendDict = {
  button: "Legend",
  hideBadges: "Hide badges",
  showBadges: "Show badges",
  less: "Less",
  more: (n) => `Show ${n} more`,
  scanFailed: (n) => `${n} video scan${n === 1 ? "" : "s"} failed. Click Scan again to retry.`,
  title: "What the chips mean",
  rows: [
    { chip: "Score (orange, amber, gray)", text: "Butler score for how promising the product is for you. Orange is hot, amber is warm, gray is cool." },
    { chip: "Green chips", text: "Good news: Butler Approved, already owned, or a Creator Connections / SPCC campaign you can join." },
    { chip: "Amber chips", text: "Heads up, such as a product you already posted." },
    { chip: "~ or est.", text: "An estimate from sales rank, not an exact number." },
    { chip: "Missing chips", text: "Some chips need the desktop app open (earnings) or a tool turned on in the toolbar popup." },
  ],
  tips: {
    score: "Butler score: how promising this product is for you",
    commission: "Commission you would earn per sale at the current price",
    bsr: "Best Sellers Rank: lower is a bigger seller in that category",
    owned: "You already own this product",
    posted: "You already posted a video for this product",
    coupon: "Amazon shows a coupon on this product",
    deal: "This product is on a deal right now",
  },
};

const ES: LegendDict = {
  button: "Leyenda",
  hideBadges: "Ocultar chips",
  showBadges: "Mostrar chips",
  less: "Menos",
  more: (n) => `Mostrar ${n} mas`,
  scanFailed: (n) => `Fallaron ${n} escaneo${n === 1 ? "" : "s"} de video. Haz clic en Escanear de nuevo.`,
  title: "Que significan los chips",
  rows: [
    { chip: "Puntuacion (naranja, ambar, gris)", text: "Puntuacion Butler de lo prometedor que es el producto para ti. Naranja es caliente, ambar tibio, gris frio." },
    { chip: "Chips verdes", text: "Buenas noticias: Butler Approved, ya lo tienes, o una campana de Creator Connections / SPCC a la que puedes unirte." },
    { chip: "Chips ambar", text: "Aviso, por ejemplo un producto que ya publicaste." },
    { chip: "~ o est.", text: "Una estimacion a partir del ranking de ventas, no un numero exacto." },
    { chip: "Chips ausentes", text: "Algunos chips necesitan la app de escritorio abierta (ganancias) o una herramienta activada en el popup." },
  ],
  tips: {
    score: "Puntuacion Butler: lo prometedor que es este producto para ti",
    commission: "Comision que ganarias por venta al precio actual",
    bsr: "Ranking de ventas: menor es mejor vendedor en esa categoria",
    owned: "Ya tienes este producto",
    posted: "Ya publicaste un video de este producto",
    coupon: "Amazon muestra un cupon en este producto",
    deal: "Este producto esta en oferta ahora",
  },
};

const FR: LegendDict = {
  button: "Legende",
  hideBadges: "Masquer les pastilles",
  showBadges: "Afficher les pastilles",
  less: "Moins",
  more: (n) => `Afficher ${n} de plus`,
  scanFailed: (n) => `${n} analyse${n === 1 ? "" : "s"} video en echec. Cliquez de nouveau sur Analyser.`,
  title: "Signification des pastilles",
  rows: [
    { chip: "Score (orange, ambre, gris)", text: "Score Butler du potentiel du produit pour vous. Orange chaud, ambre tiede, gris froid." },
    { chip: "Pastilles vertes", text: "Bonne nouvelle : Butler Approved, deja possede, ou une campagne Creator Connections / SPCC a rejoindre." },
    { chip: "Pastilles ambre", text: "Attention, par exemple un produit deja publie." },
    { chip: "~ ou est.", text: "Une estimation a partir du rang des ventes, pas un chiffre exact." },
    { chip: "Pastilles absentes", text: "Certaines pastilles demandent l'application de bureau ouverte (gains) ou un outil active dans le popup." },
  ],
  tips: {
    score: "Score Butler : potentiel de ce produit pour vous",
    commission: "Commission gagnee par vente au prix actuel",
    bsr: "Rang des ventes : plus bas, meilleur vendeur dans la categorie",
    owned: "Vous possedez deja ce produit",
    posted: "Vous avez deja publie une video pour ce produit",
    coupon: "Amazon affiche un coupon sur ce produit",
    deal: "Ce produit est en promotion actuellement",
  },
};

const DICTS: Record<Locale, LegendDict> = { en: EN, es: ES, fr: FR };

export function legend(): LegendDict {
  return DICTS[getLocale()] ?? EN;
}
