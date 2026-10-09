import { addSection, el } from "../../ui/components";
import { showModal } from "../../ui/modal";
import { getLocale } from "../../i18n";
import { sendToBackground, type GenAiPostResult, type GenerateLinkResult } from "../../shared/messages";
import type { ProductSignals } from "../../amazon/product-signals";
import { cleanLink } from "../../integrations/clean-link";
import { buildAiPostFacts } from "./facts";
import { copyImageToClipboard } from "./image";
import {
  FORMULA_TOKENS,
  deleteFormula,
  listFormulas,
  saveFormula,
  selectFormula,
  type PostFormula,
} from "./formulas";

// "Your AI Post is ready!": a popup on the product page that writes a ready-to-post
// caption from the creator's own post FORMULAS and the listing's real facts (title,
// percent off, coupon / promo code). Tabs: Product Details | AI Post. Buttons: Copy
// Text, Copy Image, Regenerate. The model never sees or invents a price (Amazon is
// percent-only), and the site falls back to the plain filled-in formula whenever
// the AI is unavailable, so the box is never empty. The desktop app's Deals
// Butler has the same popup over the same endpoint.

type Strings = {
  section: string;
  sectionNote: string;
  open: string;
  title: string;
  close: string;
  tabDetails: string;
  tabPost: string;
  working: string;
  copyText: string;
  copyImage: string;
  regenerate: string;
  copied: string;
  imageCopied: string;
  imageFailed: string;
  formula: string;
  manage: string;
  name: string;
  body: string;
  save: string;
  remove: string;
  saved: string;
  tokenHint: string;
  formulaOnly: string;
  postLabel: string;
  comment: string;
  link: string;
  percentOff: (n: number) => string;
  promo: string;
  noDiscount: string;
  failed: string;
};

const EN: Strings = {
  section: "AI Post",
  sectionNote: "Write a ready-to-post caption for this product from your formulas.",
  open: "Write my AI post",
  title: "Your AI Post is ready!",
  close: "Close",
  tabDetails: "Product Details",
  tabPost: "AI Post",
  working: "Writing your post...",
  copyText: "Copy Text",
  copyImage: "Copy Image",
  regenerate: "Regenerate",
  copied: "Copied",
  imageCopied: "Image copied",
  imageFailed: "Could not copy the image. Right-click it to copy instead.",
  formula: "Formula",
  manage: "Edit formulas",
  name: "Formula name",
  body: "Formula (one line per line of the post)",
  save: "Save formula",
  remove: "Delete",
  saved: "Formula saved",
  tokenHint: "Fill-ins:",
  formulaOnly: "Shown from your formula as written. Press Regenerate to try the AI again.",
  postLabel: "Your post",
  comment: "Pinned comment",
  link: "Your link",
  percentOff: (n) => `${n}% off`,
  promo: "Promo available",
  noDiscount: "No discount found on this page",
  failed: "Could not write the post right now.",
};

const CATALOG: Record<string, Strings> = {
  en: EN,
  es: {
    section: "Publicación con IA",
    sectionNote: "Escribe una publicación lista para usar de este producto con tus fórmulas.",
    open: "Escribir mi publicación",
    title: "¡Tu publicación con IA está lista!",
    close: "Cerrar",
    tabDetails: "Detalles del producto",
    tabPost: "Publicación IA",
    working: "Escribiendo tu publicación...",
    copyText: "Copiar texto",
    copyImage: "Copiar imagen",
    regenerate: "Regenerar",
    copied: "Copiado",
    imageCopied: "Imagen copiada",
    imageFailed: "No se pudo copiar la imagen. Haz clic derecho en ella para copiarla.",
    formula: "Fórmula",
    manage: "Editar fórmulas",
    name: "Nombre de la fórmula",
    body: "Fórmula (una línea por línea de la publicación)",
    save: "Guardar fórmula",
    remove: "Eliminar",
    saved: "Fórmula guardada",
    tokenHint: "Campos:",
    formulaOnly: "Se muestra tu fórmula tal cual. Pulsa Regenerar para probar la IA de nuevo.",
    postLabel: "Tu publicación",
    comment: "Comentario fijado",
    link: "Tu enlace",
    percentOff: (n) => `${n}% de descuento`,
    promo: "Promoción disponible",
    noDiscount: "No se encontró descuento en esta página",
    failed: "No se pudo escribir la publicación ahora.",
  },
  fr: {
    section: "Publication IA",
    sectionNote: "Rédigez une publication prête à l'emploi pour ce produit à partir de vos formules.",
    open: "Écrire ma publication",
    title: "Votre publication IA est prête !",
    close: "Fermer",
    tabDetails: "Détails du produit",
    tabPost: "Publication IA",
    working: "Rédaction de votre publication...",
    copyText: "Copier le texte",
    copyImage: "Copier l'image",
    regenerate: "Régénérer",
    copied: "Copié",
    imageCopied: "Image copiée",
    imageFailed: "Impossible de copier l'image. Faites un clic droit dessus pour la copier.",
    formula: "Formule",
    manage: "Modifier les formules",
    name: "Nom de la formule",
    body: "Formule (une ligne par ligne de la publication)",
    save: "Enregistrer la formule",
    remove: "Supprimer",
    saved: "Formule enregistrée",
    tokenHint: "Champs :",
    formulaOnly: "Affichée telle que votre formule. Appuyez sur Régénérer pour réessayer l'IA.",
    postLabel: "Votre publication",
    comment: "Commentaire épinglé",
    link: "Votre lien",
    percentOff: (n) => `${n}% de réduction`,
    promo: "Promo disponible",
    noDiscount: "Aucune réduction trouvée sur cette page",
    failed: "Impossible de rédiger la publication pour le moment.",
  },
};

function strings(): Strings {
  return CATALOG[getLocale()] ?? EN;
}

export function renderAiPost(signals: ProductSignals): HTMLElement | null {
  if (!signals.asin) return null;
  const s = strings();
  const section = addSection(s.section);
  section.append(el("p", "note", s.sectionNote));
  const row = el("div", "row");
  const btn = el("button", "btn secondary") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = s.open;
  btn.addEventListener("click", () => openAiPostModal(signals));
  row.append(btn);
  section.append(row);
  return section;
}

function button(label: string, cls: string): HTMLButtonElement {
  const b = el("button", cls, label) as HTMLButtonElement;
  b.type = "button";
  return b;
}

function labelled<T extends HTMLElement>(text: string, control: T, id: string): HTMLElement {
  const wrap = el("div", "aip-field");
  const label = el("label", undefined, text);
  label.htmlFor = id;
  control.id = id;
  wrap.append(label, control);
  return wrap;
}

export function openAiPostModal(signals: ProductSignals): void {
  const s = strings();
  const facts = buildAiPostFacts(signals);
  const fallbackLink = cleanLink(location.href).cleanUrl;

  let formulas: PostFormula[] = [];
  let current: PostFormula | null = null;
  let variant = 0;
  const previous: string[] = [];
  let link = fallbackLink;
  let linkReady: Promise<void> = Promise.resolve();
  let seq = 0;

  const root = el("div", "aip");

  // ---- Tabs ------------------------------------------------------------
  const tablist = el("div", "aip-tabs");
  tablist.setAttribute("role", "tablist");
  const tabDetails = button(s.tabDetails, "aip-tab");
  const tabPost = button(s.tabPost, "aip-tab");
  tabDetails.id = "aip-tab-details";
  tabPost.id = "aip-tab-post";
  for (const [tab, panelId] of [[tabDetails, "aip-panel-details"], [tabPost, "aip-panel-post"]] as const) {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panelId);
  }
  tablist.append(tabDetails, tabPost);

  const panelDetails = el("div", "aip-panel");
  panelDetails.id = "aip-panel-details";
  panelDetails.setAttribute("role", "tabpanel");
  panelDetails.setAttribute("aria-labelledby", "aip-tab-details");
  const panelPost = el("div", "aip-panel");
  panelPost.id = "aip-panel-post";
  panelPost.setAttribute("role", "tabpanel");
  panelPost.setAttribute("aria-labelledby", "aip-tab-post");

  const showTab = (which: "details" | "post"): void => {
    const post = which === "post";
    tabPost.setAttribute("aria-selected", String(post));
    tabDetails.setAttribute("aria-selected", String(!post));
    tabPost.tabIndex = post ? 0 : -1;
    tabDetails.tabIndex = post ? -1 : 0;
    tabPost.classList.toggle("active", post);
    tabDetails.classList.toggle("active", !post);
    panelPost.hidden = !post;
    panelDetails.hidden = post;
  };
  tabDetails.addEventListener("click", () => showTab("details"));
  tabPost.addEventListener("click", () => showTab("post"));
  tablist.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const toPost = e.key === "ArrowRight";
      showTab(toPost ? "post" : "details");
      (toPost ? tabPost : tabDetails).focus();
    }
  });

  // ---- Shared product image --------------------------------------------
  const makeImage = (): HTMLElement => {
    const box = el("div", "aip-image");
    if (signals.imageUrl) {
      const img = el("img") as HTMLImageElement;
      img.src = signals.imageUrl;
      img.alt = signals.title ?? "";
      box.append(img);
    }
    return box;
  };

  // ---- Product Details tab ---------------------------------------------
  const detailsRow = el("div", "aip-grid");
  const detailsText = el("div", "aip-col");
  detailsText.append(el("p", "aip-product-title", signals.title ?? ""));
  if (facts.brand) detailsText.append(el("p", "note", facts.brand));
  const chips = el("div", "counts");
  if (facts.percentOff !== null) chips.append(el("span", "chip good", s.percentOff(facts.percentOff)));
  if (signals.promo) chips.append(el("span", "chip good", s.promo));
  if (!chips.childElementCount) chips.append(el("span", "chip muted", s.noDiscount));
  detailsText.append(chips);
  if (signals.promo) detailsText.append(el("p", "note", signals.promo.text));
  const linkLine = el("p", "note");
  detailsText.append(linkLine);
  const renderLinkLine = (): void => {
    linkLine.textContent = `${s.link}: ${link}`;
  };
  renderLinkLine();
  detailsRow.append(makeImage(), detailsText);
  panelDetails.append(detailsRow);

  // ---- AI Post tab -----------------------------------------------------
  const postGrid = el("div", "aip-grid");
  const postCol = el("div", "aip-col");

  const formulaSelect = el("select") as HTMLSelectElement;
  const formulaField = labelled(s.formula, formulaSelect, "aip-formula");
  const manageBtn = button(s.manage, "aip-link");
  manageBtn.setAttribute("aria-expanded", "false");
  const formulaRow = el("div", "aip-formula-row");
  formulaRow.append(formulaField, manageBtn);

  const textarea = el("textarea") as HTMLTextAreaElement;
  textarea.rows = 9;
  const postField = labelled(s.postLabel, textarea, "aip-post");
  const status = el("p", "note aip-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const commentWrap = el("div", "aip-comment");
  commentWrap.hidden = true;
  const commentArea = el("textarea") as HTMLTextAreaElement;
  commentArea.rows = 2;
  const commentField = labelled(s.comment, commentArea, "aip-comment-text");
  commentWrap.append(commentField);

  // Formula editor (collapsed by default).
  const editor = el("div", "aip-editor");
  editor.hidden = true;
  const nameInput = el("input") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.maxLength = 60;
  const bodyInput = el("textarea") as HTMLTextAreaElement;
  bodyInput.rows = 5;
  const editorActions = el("div", "aip-actions");
  const saveBtn = button(s.save, "btn secondary small");
  const delBtn = button(s.remove, "btn secondary small");
  editorActions.append(saveBtn, delBtn);
  editor.append(
    labelled(s.name, nameInput, "aip-name"),
    labelled(s.body, bodyInput, "aip-body"),
    el("p", "note", `${s.tokenHint} ${FORMULA_TOKENS.join(" ")}`),
    editorActions,
  );

  const actions = el("div", "aip-actions");
  const copyTextBtn = button(s.copyText, "btn secondary");
  const copyImageBtn = button(s.copyImage, "btn secondary");
  const regenBtn = button(s.regenerate, "btn");
  actions.append(copyTextBtn, copyImageBtn, regenBtn);

  postCol.append(formulaRow, postField, status, commentWrap, editor);
  postGrid.append(makeImage(), postCol);
  panelPost.append(postGrid, actions);

  root.append(tablist, panelDetails, panelPost);

  // ---- Behavior ----------------------------------------------------------
  const flash = (btn: HTMLButtonElement, label: string, original: string): void => {
    btn.textContent = label;
    window.setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  };

  const fillEditor = (): void => {
    const custom = current && !current.builtIn;
    nameInput.value = custom && current ? current.name : "";
    bodyInput.value = current?.post ?? "";
    delBtn.hidden = !custom;
  };

  const renderFormulaOptions = (): void => {
    formulaSelect.replaceChildren();
    for (const f of formulas) {
      const opt = el("option", undefined, f.name) as HTMLOptionElement;
      opt.value = f.id;
      formulaSelect.append(opt);
    }
    if (current) formulaSelect.value = current.id;
  };

  const generate = async (): Promise<void> => {
    if (!current) return;
    const mine = ++seq;
    status.textContent = s.working;
    regenBtn.disabled = true;
    copyTextBtn.disabled = true;
    const result = await sendToBackground<GenAiPostResult>({
      kind: "GEN_AI_POST",
      input: {
        facts: { ...facts },
        formula: { id: current.id, name: current.name, post: current.post, comment: current.comment },
        variant,
        previous: previous.slice(-3),
        locale: getLocale(),
      },
    }).catch((): GenAiPostResult => ({ ok: false, error: s.failed }));
    if (mine !== seq) return; // a newer request superseded this one
    await linkReady;
    regenBtn.disabled = false;
    copyTextBtn.disabled = false;
    if (!result.ok || !result.post) {
      status.textContent = result.error ?? s.failed;
      return;
    }
    previous.push(result.post);
    textarea.value = result.post.split("{{url}}").join(link);
    if (result.comment) {
      commentArea.value = result.comment.split("{{url}}").join(link);
      commentWrap.hidden = false;
    } else {
      commentWrap.hidden = true;
    }
    status.textContent = result.source === "formula" ? s.formulaOnly : "";
  };

  formulaSelect.addEventListener("change", () => {
    current = formulas.find((f) => f.id === formulaSelect.value) ?? current;
    if (!current) return;
    void selectFormula(current.id);
    variant = 0;
    previous.length = 0;
    fillEditor();
    void generate();
  });

  manageBtn.addEventListener("click", () => {
    editor.hidden = !editor.hidden;
    manageBtn.setAttribute("aria-expanded", String(!editor.hidden));
  });

  saveBtn.addEventListener("click", () => {
    void saveFormula(nameInput.value, bodyInput.value).then(async (res) => {
      if (!res.ok) {
        status.textContent = res.error;
        return;
      }
      const list = await listFormulas();
      formulas = list.formulas;
      current = formulas.find((f) => f.id === res.formula.id) ?? list.formulas[0] ?? null;
      renderFormulaOptions();
      fillEditor();
      variant = 0;
      previous.length = 0;
      status.textContent = s.saved;
      void generate();
    });
  });

  delBtn.addEventListener("click", () => {
    if (!current || current.builtIn) return;
    void deleteFormula(current.id).then(async () => {
      const list = await listFormulas();
      formulas = list.formulas;
      current = formulas.find((f) => f.id === list.selectedId) ?? formulas[0] ?? null;
      renderFormulaOptions();
      fillEditor();
      variant = 0;
      previous.length = 0;
      void generate();
    });
  });

  regenBtn.addEventListener("click", () => {
    variant += 1;
    void generate();
  });

  copyTextBtn.addEventListener("click", () => {
    const text = textarea.value;
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => flash(copyTextBtn, s.copied, s.copyText))
      .catch(() => {
        textarea.select();
      });
  });

  copyImageBtn.addEventListener("click", () => {
    if (!signals.imageUrl) return;
    void copyImageToClipboard(signals.imageUrl).then((ok) => {
      if (ok) flash(copyImageBtn, s.imageCopied, s.copyImage);
      else status.textContent = s.imageFailed;
    });
  });
  copyImageBtn.disabled = !signals.imageUrl;

  // ---- Open ------------------------------------------------------------
  showTab("post");
  showModal({ title: s.title, closeLabel: s.close, wide: true, body: [root] });

  void listFormulas().then((list) => {
    formulas = list.formulas;
    current = formulas.find((f) => f.id === list.selectedId) ?? formulas[0] ?? null;
    renderFormulaOptions();
    fillEditor();
    void generate();
  });

  // The creator's own attributed link replaces {{url}}; the plain cleaned link is
  // the fallback so a copied post always carries a working link.
  linkReady = sendToBackground<GenerateLinkResult>({
    kind: "GENERATE_AFFILIATE_LINK",
    asin: signals.asin as string,
    marketplace: signals.marketplace,
  })
    .then((res) => {
      if (res.ok && res.url) link = res.url;
    })
    .catch(() => {})
    .then(() => renderLinkLine());
}
