import { addSection, el } from "../../ui/components";
import { resolveLocale } from "../../i18n";
import { getState, patchState } from "../../storage/store";
import {
  sendToBackground,
  type GenerateLinkResult,
  type IntegrationsView,
  type OpenAiResult,
  type SignInResult,
} from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import { buildVoiceoverPrompt, findDeniedBrand } from "./voiceover-prompt";

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
  voiceover: string;
  voiceoverGating: string;
  voiceoverFailed: string;
  copyScript: string;
  // {brand} is replaced with the offending brand name at render time.
  denylistWarning: string;
  signInForBranded: string;
  connectPlaceholder: string;
  connectButton: string;
  connecting: string;
  connectError: string;
  openSettings: string;
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
  voiceover: "Draft voiceover (AI)",
  voiceoverGating: "Connect OpenAI in Settings to draft voiceover scripts.",
  voiceoverFailed: "Voiceover failed",
  copyScript: "Copy script",
  denylistWarning:
    'Heads up: this script mentions "{brand}", which is on your never-mention list. Edit it out before you use the script.',
  signInForBranded:
    "Copied the plain Amazon link. Sign in with your license key to copy a branded short link instead:",
  connectPlaceholder: "License key",
  connectButton: "Connect",
  connecting: "Connecting...",
  connectError: "Could not connect. Check your license key and try again.",
  openSettings: "Enter it in settings instead",
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
    voiceover: "Redactar guion de voz (IA)",
    voiceoverGating: "Conecta OpenAI en Ajustes para redactar guiones de voz.",
    voiceoverFailed: "Fallo al generar el guion",
    copyScript: "Copiar guion",
    denylistWarning:
      'Atención: este guion menciona "{brand}", que está en tu lista de marcas prohibidas. Elimínala antes de usar el guion.',
    signInForBranded:
      "Se copió el enlace normal de Amazon. Inicia sesión con tu clave de licencia para copiar un enlace corto de marca:",
    connectPlaceholder: "Clave de licencia",
    connectButton: "Conectar",
    connecting: "Conectando...",
    connectError: "No se pudo conectar. Revisa tu clave de licencia e inténtalo de nuevo.",
    openSettings: "Introdúcela en Ajustes",
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
    voiceover: "Rédiger un script voix off (IA)",
    voiceoverGating: "Connectez OpenAI dans les Réglages pour rédiger des scripts voix off.",
    voiceoverFailed: "Échec du script",
    copyScript: "Copier le script",
    denylistWarning:
      'Attention : ce script mentionne "{brand}", qui figure dans votre liste de marques à ne jamais citer. Retirez-la avant d\'utiliser le script.',
    signInForBranded:
      "Le lien Amazon simple a été copié. Connectez-vous avec votre clé de licence pour copier un lien court de marque :",
    connectPlaceholder: "Clé de licence",
    connectButton: "Connecter",
    connecting: "Connexion...",
    connectError: "Connexion impossible. Vérifiez votre clé de licence et réessayez.",
    openSettings: "La saisir dans les Réglages",
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

  // Signed-out sign-in, inline. Chrome cannot open the toolbar popup for us, so
  // rather than dead-ending the user with "go open the popup", we let them enter
  // their license key right here. It is safe: the panel lives in a closed shadow
  // root (the host page cannot read the field), and the key is sent to the
  // background via the same SIGN_IN message the popup and Link Butler page use,
  // never persisting on the page. Hidden until a copy comes back needing sign-in.
  const connect = el("div", "connect-row");
  connect.hidden = true;
  const keyInput = el("input") as HTMLInputElement;
  keyInput.type = "password";
  keyInput.autocomplete = "off";
  keyInput.placeholder = s.connectPlaceholder;
  const connectBtn = el("button", "btn small") as HTMLButtonElement;
  connectBtn.type = "button";
  connectBtn.textContent = s.connectButton;
  connect.append(keyInput, connectBtn);

  const connectError = el("p", "link-notice");
  connectError.hidden = true;

  // Fallback for anyone who would rather use the full settings page: same route
  // as the header gear. Only shown alongside the connect form.
  const openSettings = el("a", "inline-connect") as HTMLAnchorElement;
  openSettings.href = "#";
  openSettings.textContent = s.openSettings;
  openSettings.hidden = true;
  openSettings.addEventListener("click", (event) => {
    event.preventDefault();
    void sendToBackground({ kind: "OPEN_OPTIONS" });
  });

  // The copy itself: ask the background for this product's link (branded once a
  // license is signed in, plain otherwise) and put it on the clipboard. Shared
  // by the button and the post-sign-in success so connecting copies the branded
  // short link straight away.
  const copyLink = (): Promise<void> => {
    copyBtn.disabled = true;
    copyBtn.textContent = s.working;
    notice.hidden = true;
    return sendToBackground<GenerateLinkResult>({
      kind: "GENERATE_AFFILIATE_LINK",
      asin: signals.asin as string,
      marketplace: signals.marketplace,
    }).then(async (result) => {
      if (result.notice === "signInRequired") {
        notice.textContent = s.signInForBranded;
        notice.hidden = false;
        connect.hidden = false;
        openSettings.hidden = false;
        keyInput.focus();
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
        copyBtn.textContent = s.copyLink;
        copyBtn.disabled = false;
      }, 1500);
    });
  };
  copyBtn.addEventListener("click", () => void copyLink());

  const submitConnect = async (): Promise<void> => {
    const licenseKey = keyInput.value.trim();
    if (!licenseKey) return;
    connectBtn.disabled = true;
    connectBtn.textContent = s.connecting;
    connectError.hidden = true;
    const result = await sendToBackground<SignInResult>({ kind: "SIGN_IN", licenseKey });
    connectBtn.disabled = false;
    connectBtn.textContent = s.connectButton;
    if (result.ok) {
      connect.hidden = true;
      connectError.hidden = true;
      openSettings.hidden = true;
      notice.hidden = true;
      keyInput.value = "";
      // Signed in now: copy the branded short link the user was after.
      void copyLink();
    } else {
      connectError.textContent = result.error ?? s.connectError;
      connectError.hidden = false;
    }
  };
  connectBtn.addEventListener("click", () => void submitConnect());
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submitConnect();
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

  // Voiceover Butler, extension edition: one spoken script for this product,
  // shaped by the Voiceover section of the options page (creator profile,
  // script defaults, About Me, brand denylist). Same OpenAI gating as the
  // caption button; the prompt is built in voiceover-prompt.ts.
  const voBtn = el("button", "btn secondary") as HTMLButtonElement;
  voBtn.type = "button";
  voBtn.textContent = s.voiceover;
  voBtn.disabled = !openaiReady;
  voBtn.title = openaiReady ? "" : s.voiceoverGating;
  const voOut = el("div", "caption-out");
  voOut.hidden = true;
  voBtn.addEventListener("click", () => {
    voBtn.disabled = true;
    voBtn.textContent = s.working;
    // Settings are re-read at click time so an options-page edit made after
    // this page loaded still shapes the script.
    void getState().then((fresh) => {
      const vo = fresh.settings.voiceover;
      const prompt = buildVoiceoverPrompt(signals, vo);
      return sendToBackground<OpenAiResult>({ kind: "OPENAI_COMPLETE", prompt }).then((result) => {
        voBtn.textContent = s.voiceover;
        voBtn.disabled = false;
        voOut.hidden = false;
        if (!result.ok || !result.text) {
          voOut.textContent = result.error ?? s.voiceoverFailed;
          return;
        }
        const script = result.text.trim();
        const children: HTMLElement[] = [el("div", "", script)];
        const denied = findDeniedBrand(script, vo.brandDenylist);
        if (denied) {
          children.push(el("p", "link-notice", s.denylistWarning.replace("{brand}", denied)));
        }
        const copyScriptBtn = el("button", "btn secondary") as HTMLButtonElement;
        copyScriptBtn.type = "button";
        copyScriptBtn.textContent = s.copyScript;
        copyScriptBtn.addEventListener("click", () => {
          void navigator.clipboard
            ?.writeText(script)
            .then(() => {
              copyScriptBtn.textContent = s.copied;
              window.setTimeout(() => {
                copyScriptBtn.textContent = s.copyScript;
              }, 1500);
            })
            .catch(() => undefined);
        });
        const actions = el("div", "row");
        actions.append(copyScriptBtn);
        children.push(actions);
        voOut.replaceChildren(...children);
      });
    });
  });
  row.append(voBtn);

  const disclosure = el("p", "affiliate-note");
  disclosure.textContent = s.disclosure;

  section.append(row, notice, connect, connectError, openSettings, out, voOut, disclosure);
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
