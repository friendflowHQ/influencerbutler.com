import { copyButton, el, getQuickBar } from "../../ui/components";
import { resolveLocale } from "../../i18n";
import { CATALOG as I18N } from "../../i18n/catalog";
import { getState } from "../../storage/store";
import { sendToBackground, type GenerateLinkResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import { cleanLink } from "../../integrations/clean-link";
import { retailerFromHost } from "../../shared/retailer";

// Pinned quick-links bar under the HUD header: the two link actions creators
// reach for most, without scrolling past every other tool section.
//   - Get link: the user's own attributed/branded affiliate link for this
//     product (same pipeline as "Copy my link").
//   - Scrub link: the base product url with every affiliate tag, UTM param and
//     click id stripped, so nobody else keeps the credit. The stripping is the
//     pure cleanLink() cleaner run on the current page url (no network needed).
// Both copy to the clipboard and show the resulting url so it can be seen or
// re-copied.

type Strings = {
  getLink: string;
  scrubLink: string;
  working: string;
  copied: string;
  getFailed: string;
  getTitle: string;
  scrubTitle: string;
  // Shown under the Get link readout when a branded link was asked for but the
  // user is signed out: the plain (still working) affiliate link is copied.
  signInNote: string;
};

const EN: Strings = {
  getLink: "Get link",
  scrubLink: "Scrub link",
  working: "Working...",
  copied: "Copied",
  getFailed: "Could not build a link",
  getTitle: "Copy your affiliate link for this product",
  scrubTitle: "Copy the base link with tags and tracking removed",
  signInNote:
    "Copied the plain Amazon link. Sign in with your license key (in My link below) for a branded short link.",
};

const CATALOG: Record<string, Strings> = {
  en: EN,
  es: {
    getLink: "Obtener enlace",
    scrubLink: "Limpiar enlace",
    working: "Procesando...",
    copied: "Copiado",
    getFailed: "No se pudo crear el enlace",
    getTitle: "Copia tu enlace de afiliado de este producto",
    scrubTitle: "Copia el enlace base sin etiquetas ni rastreo",
    signInNote:
      "Se copió el enlace normal de Amazon. Inicia sesión con tu clave de licencia (en Mi enlace, abajo) para un enlace corto de marca.",
  },
  fr: {
    getLink: "Obtenir le lien",
    scrubLink: "Nettoyer le lien",
    working: "Traitement...",
    copied: "Copié",
    getFailed: "Impossible de créer le lien",
    getTitle: "Copiez votre lien d'affiliation pour ce produit",
    scrubTitle: "Copiez le lien de base sans balises ni suivi",
    signInNote:
      "Le lien Amazon simple a été copié. Connectez-vous avec votre clé de licence (dans Mon lien, ci-dessous) pour un lien court de marque.",
  },
};

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // clipboard blocked (rare): the readout still shows the url to copy by hand.
  }
}

// Fill a readout group with the resulting url (plus a re-copy button), an
// optional notice line, and an optional small muted note. Replaces any previous
// contents so repeat clicks refresh.
function showUrl(group: HTMLElement, url: string, note?: string, mutedNote?: string): void {
  const readout = el("div", "link-readout");
  readout.append(el("span", "link-readout-url", url), copyButton(url));
  const children: HTMLElement[] = [readout];
  if (note) children.push(el("p", "link-notice", note));
  if (mutedNote) children.push(el("p", "affiliate-note", mutedNote));
  group.replaceChildren(...children);
  group.hidden = false;
}

export async function renderQuickLinks(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const state = await getState();
  const locale = resolveLocale(state.settings.locale);
  const s = CATALOG[locale] ?? EN;
  // "Opens in the Amazon app on phones": only when the setting is on and this
  // is an Amazon product (the params are Amazon's own SiteStripe share params).
  const appOpensNote =
    state.integrations.global.appOpeningLinks !== false && retailerFromHost(signals.marketplace) === "amazon"
      ? I18N[locale].appOpensNote
      : undefined;

  const bar = getQuickBar();
  // The bar is a shared singleton in the sticky topbar; build its contents once.
  if (bar.dataset.built) return;
  bar.dataset.built = "1";

  const actions = el("div", "quickbar-actions");

  const getBtn = el("button", "btn secondary small") as HTMLButtonElement;
  getBtn.type = "button";
  getBtn.textContent = s.getLink;
  getBtn.title = s.getTitle;

  const scrubBtn = el("button", "btn secondary small") as HTMLButtonElement;
  scrubBtn.type = "button";
  scrubBtn.textContent = s.scrubLink;
  scrubBtn.title = s.scrubTitle;

  actions.append(getBtn, scrubBtn);

  const getOut = el("div");
  getOut.hidden = true;
  const scrubOut = el("div");
  scrubOut.hidden = true;

  bar.append(actions, getOut, scrubOut);

  // Get link: the user's attributed/branded link, via the same background call
  // "Copy my link" uses. The returned url is always a working affiliate link
  // (plain when signed out), so we copy and show it either way.
  getBtn.addEventListener("click", () => {
    getBtn.disabled = true;
    getBtn.textContent = s.working;
    void sendToBackground<GenerateLinkResult>({
      kind: "GENERATE_AFFILIATE_LINK",
      asin: signals.asin as string,
      marketplace: signals.marketplace,
    }).then(async (result) => {
      if (result.ok && result.url) {
        await copyToClipboard(result.url);
        showUrl(
          getOut,
          result.url,
          result.notice === "signInRequired" ? s.signInNote : undefined,
          appOpensNote,
        );
        getBtn.textContent = s.copied;
      } else {
        getBtn.textContent = s.getFailed;
      }
      window.setTimeout(() => {
        getBtn.textContent = s.getLink;
        getBtn.disabled = false;
      }, 1500);
    });
  });

  // Scrub link: the base link, tags and tracking gone. cleanLink is pure and we
  // already hold the full product url, so this needs no background round-trip.
  scrubBtn.addEventListener("click", () => {
    const url = cleanLink(location.href).cleanUrl;
    void copyToClipboard(url).then(() => {
      showUrl(scrubOut, url);
      scrubBtn.textContent = s.copied;
      window.setTimeout(() => {
        scrubBtn.textContent = s.scrubLink;
      }, 1500);
    });
  });
}
