import { addSection, el } from "../../ui/components";
import { resolveLocale } from "../../i18n";
import { getSettings } from "../../storage/store";
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
  },
};

export async function renderMyLink(signals: ProductSignals): Promise<void> {
  if (!signals.asin) return;
  const settings = await getSettings();
  const s = CATALOG[resolveLocale(settings.locale)] ?? EN;
  const integrations = await sendToBackground<IntegrationsView>({ kind: "GET_INTEGRATIONS" });
  const openai = integrations.providers.find((p) => p.id === "openai");
  const openaiReady = Boolean(openai?.configured && openai.lastTest.status === "ok");

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
}
