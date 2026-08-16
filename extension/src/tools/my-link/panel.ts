import { addSection, el } from "../../ui/components";
import { resolveLocale } from "../../i18n";
import { getState, patchState } from "../../storage/store";
import {
  sendToBackground,
  type GenerateLinkResult,
  type IntegrationsView,
  type OpenAiResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";

// On-page "My link" section: generate the user's affiliate/deeplink for this
// product, and (when OpenAI is connected) draft a caption. Keys never reach
// this content script: the background does the provider calls and returns only
// the finished link or text.

// Adapter id of the first-party branded-link provider (integrations/adapters/
// influencerbutler). Selecting it as the primary deeplink provider is all it
// takes to turn branded links on: routing needs no credentials for it.
const IB_LINKS = "influencerbutler";

type Strings = {
  heading: string;
  copyLink: string;
  copied: string;
  working: string;
  linkFailed: string;
  caption: string;
  captionGating: string;
  captionFailed: string;
  signInForBranded: string;
  disclosure: string;
  brandedBody: string;
  brandedTurnOn: string;
  brandedNotNow: string;
  brandedOn: string;
};

const EN: Strings = {
  heading: "My link",
  copyLink: "Copy my link",
  copied: "Copied",
  working: "Working...",
  linkFailed: "Could not build a link",
  caption: "Draft caption (AI)",
  captionGating: "Connect OpenAI in Settings to draft captions.",
  captionFailed: "Caption failed",
  signInForBranded:
    "Copied the plain Amazon link. Branded short links need you signed in: open the Influencer Butler extension popup and enter your license key.",
  disclosure:
    "This is an affiliate link tagged with your own Amazon Associates account, so qualifying purchases earn you a commission. Add your own #ad or #CommissionsEarned disclosure when you share it.",
  brandedBody:
    "Tip: you can copy a short links.influencerbutler.com link instead. It keeps your affiliate tag out of the link you post and counts your clicks. No setup, free on any plan.",
  brandedTurnOn: "Use branded links",
  brandedNotNow: "Not now",
  brandedOn: "Branded links are on. Your next copy will be a short link.",
};

const CATALOG: Record<string, Strings> = {
  en: EN,
  es: {
    heading: "Mi enlace",
    copyLink: "Copiar mi enlace",
    copied: "Copiado",
    working: "Procesando...",
    linkFailed: "No se pudo crear el enlace",
    caption: "Redactar pie de foto (IA)",
    captionGating: "Conecta OpenAI en Ajustes para redactar pies de foto.",
    captionFailed: "Fallo al redactar",
    signInForBranded:
      "Se copió el enlace normal de Amazon. Los enlaces cortos de marca requieren iniciar sesión: abre la ventana de la extensión Influencer Butler e introduce tu clave de licencia.",
    disclosure:
      "Este es un enlace de afiliado con tu propia cuenta de Amazon Associates, así que las compras que califiquen te generan una comisión. Añade tu propia divulgación (#ad o #CommissionsEarned) al compartirlo.",
    brandedBody:
      "Consejo: puedes copiar un enlace corto de links.influencerbutler.com. Mantiene tu etiqueta de afiliado fuera del enlace que publicas y cuenta tus clics. Sin configuración, gratis en cualquier plan.",
    brandedTurnOn: "Usar enlaces de marca",
    brandedNotNow: "Ahora no",
    brandedOn: "Los enlaces de marca están activos. Tu próxima copia será un enlace corto.",
  },
  fr: {
    heading: "Mon lien",
    copyLink: "Copier mon lien",
    copied: "Copié",
    working: "Traitement...",
    linkFailed: "Impossible de créer le lien",
    caption: "Rédiger une légende (IA)",
    captionGating: "Connectez OpenAI dans les Réglages pour rédiger des légendes.",
    captionFailed: "Échec de la rédaction",
    signInForBranded:
      "Le lien Amazon simple a été copié. Les liens courts de marque exigent une connexion : ouvrez la fenêtre de l'extension Influencer Butler et saisissez votre clé de licence.",
    disclosure:
      "Ceci est un lien d'affiliation associé à votre propre compte Amazon Associates : les achats admissibles vous rapportent une commission. Ajoutez votre propre mention (#ad ou #CommissionsEarned) lorsque vous le partagez.",
    brandedBody:
      "Astuce : vous pouvez copier un lien court links.influencerbutler.com. Il garde votre balise d'affiliation hors du lien que vous publiez et compte vos clics. Sans configuration, gratuit sur toute offre.",
    brandedTurnOn: "Utiliser les liens de marque",
    brandedNotNow: "Pas maintenant",
    brandedOn: "Les liens de marque sont actifs. Votre prochaine copie sera un lien court.",
  },
};

export async function renderMyLink(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const state = await getState();
  const s = CATALOG[resolveLocale(state.settings.locale)] ?? EN;
  const integrations = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  const openai = integrations.providers.find((p) => p.id === "openai");
  const openaiReady = Boolean(openai?.configured && openai.lastTest.status === "ok");
  // The branded-link tip is worth showing only to someone it would actually work
  // for: signed in (the license is the credential) and not already using it.
  // `configured` for this provider means "a license key is signed in".
  const showBrandedHint =
    state.hints.brandedLinks === null &&
    integrations.global.primaryDeeplinkProvider !== IB_LINKS &&
    Boolean(integrations.providers.find((p) => p.id === IB_LINKS)?.configured);

  const section = addSection(s.heading);
  const row = el("div", "row");

  // Why the copied link is not the branded one the user's setup asked for. The
  // link is still copied and still works, so this stays a notice under the row
  // rather than an error on the button. It sticks around after the button
  // resets, so the reason is still readable.
  const notice = el("p", "link-notice");
  notice.hidden = true;

  const copyBtn = el("button", "btn") as HTMLButtonElement;
  copyBtn.type = "button";
  copyBtn.textContent = s.copyLink;
  copyBtn.addEventListener("click", () => {
    copyBtn.disabled = true;
    const original = copyBtn.textContent;
    copyBtn.textContent = s.working;
    notice.hidden = true;
    void sendToBackground<GenerateLinkResult>({
      kind: "GENERATE_AFFILIATE_LINK",
      asin: signals.asin as string,
      marketplace: signals.marketplace,
    }).then(async (result) => {
      if (result.notice === "signInRequired") {
        notice.textContent = s.signInForBranded;
        notice.hidden = false;
      }
      if (result.ok && result.url) {
        try {
          await navigator.clipboard.writeText(result.url);
          copyBtn.textContent = s.copied;
        } catch {
          copyBtn.textContent = result.url;
        }
      } else {
        copyBtn.textContent = s.linkFailed;
      }
      window.setTimeout(() => {
        copyBtn.textContent = original;
        copyBtn.disabled = false;
      }, 1500);
    });
  });
  row.append(copyBtn);

  const captionBtn = el("button", "btn secondary") as HTMLButtonElement;
  captionBtn.type = "button";
  captionBtn.textContent = s.caption;
  captionBtn.disabled = !openaiReady;
  captionBtn.title = openaiReady ? "" : s.captionGating;
  const out = el("div", "caption-out");
  out.hidden = true;
  captionBtn.addEventListener("click", () => {
    captionBtn.disabled = true;
    captionBtn.textContent = s.working;
    const prompt = `Write a short, upbeat social caption for this Amazon product as an affiliate. Product: ${signals.title ?? signals.asin}. Keep it under 220 characters and add 3 relevant hashtags.`;
    void sendToBackground<OpenAiResult>({ kind: "OPENAI_COMPLETE", prompt }).then((result) => {
      captionBtn.textContent = s.caption;
      captionBtn.disabled = false;
      if (result.ok && result.text) {
        out.hidden = false;
        out.textContent = result.text;
      } else {
        out.hidden = false;
        out.textContent = result.error ?? s.captionFailed;
      }
    });
  });
  row.append(captionBtn);

  const disclosure = el("p", "affiliate-note");
  disclosure.textContent = s.disclosure;

  section.append(row, notice, out, disclosure);
  if (showBrandedHint) section.append(brandedHint(s));
}

// One-time tip under the copy row: branded short links exist, are free, and need
// no setup. It is drawn at most once per install, and either button settles it
// for good, so copying a link never nags. Turning it on is a single click here
// rather than a trip to the options page: routing only needs the provider id.
function brandedHint(s: Strings): HTMLElement {
  const box = el("div", "hint");
  const body = el("p", "hint-body", s.brandedBody);

  const actions = el("div", "row");
  const turnOn = el("button", "btn small") as HTMLButtonElement;
  turnOn.type = "button";
  turnOn.textContent = s.brandedTurnOn;
  const notNow = el("button", "btn secondary small") as HTMLButtonElement;
  notNow.type = "button";
  notNow.textContent = s.brandedNotNow;
  actions.append(turnOn, notNow);

  turnOn.addEventListener("click", () => {
    turnOn.disabled = true;
    notNow.disabled = true;
    void sendToBackground({
      kind: "SET_INTEGRATION_GLOBAL",
      partial: { primaryDeeplinkProvider: IB_LINKS },
    })
      .then(() => {
        // Only settle the hint once the setting actually landed, so a failed
        // write leaves the offer on screen instead of silently swallowing it.
        void settleHint();
        box.replaceChildren(el("p", "hint-body", s.brandedOn));
      })
      .catch(() => {
        turnOn.disabled = false;
        notNow.disabled = false;
      });
  });

  notNow.addEventListener("click", () => {
    void settleHint();
    box.remove();
  });

  box.append(body, actions);
  return box;
}

async function settleHint(): Promise<void> {
  await patchState((s) => {
    s.hints.brandedLinks = Date.now();
  });
}
