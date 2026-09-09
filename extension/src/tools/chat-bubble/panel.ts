// In-page chat bubble: a floating launcher + compact panel injected on the pages
// the content script runs on, mirroring the desktop app's chat bubble. It has
// three views: Chat (the same hosted AI concierge as the full-tab assistant, via
// the AI_CHAT background message), Report (a Bug/Feature/Question with title,
// description, optional reply email, a diagnostic log bundle, and up to 6
// screenshots by picker / paste / "capture this page"), and My reports (the
// local submission history). It lives in its own closed shadow host so it stays
// style-isolated and survives the main floating panel's SPA-nav rebuilds.
//
// Strings are localized inline (keyed by getLocale()) like the full-tab chat
// page, rather than through the compile-enforced Dict catalog.
import { el } from "../../ui/components";
import { UI_PREFIX } from "../../shared/constants";
import { getLocale } from "../../i18n";
import type { Locale } from "../../i18n/catalog";
import { sendToBackground } from "../../shared/messages";
import type {
  AiChatResult,
  AiChatTurn,
  RichFeedbackResult,
  MyFeedbackListResult,
  MyFeedbackItem,
  DismissFeedbackResult,
  CaptureScreenshotResult,
  FeedbackThread,
  FeedbackThreadReply,
  FeedbackThreadsResult,
  PostReplyResult,
} from "../../shared/messages";
import {
  validateScreenshot,
  isEmailShaped,
  formatBytes,
  SCREENSHOT_MAX_COUNT,
  type FeedbackType,
  type Screenshot,
} from "../../shared/feedback-report-core";

const HOST_ID = `${UI_PREFIX}-chat-bubble-host`;

type View = "chat" | "report" | "thread";
type ReportTab = "form" | "history";

type Strings = {
  launcher: string;
  title: string;
  role: string;
  close: string;
  back: string;
  placeholder: string;
  send: string;
  thinking: string;
  intro: string;
  reportCta: string;
  reportHeading: string;
  reportSub: string;
  tabNew: string;
  tabHistory: string;
  type: string;
  typeBug: string;
  typeFeature: string;
  typeQuestion: string;
  fTitle: string;
  titlePlaceholder: string;
  titleRequired: string;
  description: string;
  descPlaceholder: string;
  email: string;
  emailPlaceholder: string;
  emailHint: string;
  attachLogs: string;
  attachScreenshots: string;
  capturePage: string;
  screenshotHint: string;
  sendFeedback: string;
  sending: string;
  sent: string;
  sendFailed: string;
  captureFailed: string;
  historyEmpty: string;
  historyError: string;
  loading: string;
  dismiss: string;
  threadRole: string;
  threadUntitled: string;
  threadNewReply: string;
  threadConversation: string;
  threadEmpty: string;
  replyPlaceholder: string;
  replySending: string;
  replySent: string;
  replyFailed: string;
};

const STRINGS: Record<Locale, Strings> = {
  en: {
    launcher: "Ask the assistant",
    title: "Butler AI",
    role: "Your Influencer Butler assistant",
    close: "Close",
    back: "Back",
    placeholder: "Type your question...",
    send: "Send",
    thinking: "Thinking...",
    intro: "Ask anything about setting up or using Influencer Butler.",
    reportCta: "🐛 Report a bug",
    reportHeading: "Report a bug or idea",
    reportSub: "Goes straight to the team",
    tabNew: "New report",
    tabHistory: "My reports",
    type: "Type",
    typeBug: "Bug Report",
    typeFeature: "Feature Request",
    typeQuestion: "Question",
    fTitle: "Title",
    titlePlaceholder: "Short summary...",
    titleRequired: "Please enter a title",
    description: "Description",
    descPlaceholder: "For bugs: what happened, what you expected, steps to reproduce.",
    email: "Your email (optional, so we can reply)",
    emailPlaceholder: "you@example.com",
    emailHint: "This does not look like a valid email address. Your report will still send, but we will not be able to reply.",
    attachLogs: "Attach diagnostic details (recommended)",
    attachScreenshots: "Attach screenshots",
    capturePage: "Capture this page",
    screenshotHint: "Add up to 6, or paste images with Ctrl+V",
    sendFeedback: "Send feedback",
    sending: "Sending report...",
    sent: "Sent! Thanks for the report.",
    sendFailed: "Send failed",
    captureFailed: "Could not capture the page.",
    historyEmpty: "No reports sent from this browser yet.",
    historyError: "Could not load your reports.",
    loading: "Loading...",
    dismiss: "Dismiss",
    threadRole: "Support conversation",
    threadUntitled: "Support ticket",
    threadNewReply: "New reply from support",
    threadConversation: "Support conversation",
    threadEmpty: "No messages yet.",
    replyPlaceholder: "Type your reply...",
    replySending: "Sending...",
    replySent: "Sent",
    replyFailed: "Could not send your reply.",
  },
  es: {
    launcher: "Pregunta al asistente",
    title: "Butler AI",
    role: "Tu asistente de Influencer Butler",
    close: "Cerrar",
    back: "Atrás",
    placeholder: "Escribe tu pregunta...",
    send: "Enviar",
    thinking: "Pensando...",
    intro: "Pregunta lo que quieras sobre cómo configurar o usar Influencer Butler.",
    reportCta: "🐛 Informar de un error",
    reportHeading: "Informar de un error o idea",
    reportSub: "Va directo al equipo",
    tabNew: "Nuevo informe",
    tabHistory: "Mis informes",
    type: "Tipo",
    typeBug: "Informe de error",
    typeFeature: "Solicitud de función",
    typeQuestion: "Pregunta",
    fTitle: "Título",
    titlePlaceholder: "Resumen breve...",
    titleRequired: "Introduce un título",
    description: "Descripción",
    descPlaceholder: "Para errores: qué pasó, qué esperabas y cómo reproducirlo.",
    email: "Tu correo (opcional, para poder responderte)",
    emailPlaceholder: "tu@ejemplo.com",
    emailHint: "Esto no parece un correo válido. Tu informe se enviará igualmente, pero no podremos responderte.",
    attachLogs: "Adjuntar detalles de diagnóstico (recomendado)",
    attachScreenshots: "Adjuntar capturas",
    capturePage: "Capturar esta página",
    screenshotHint: "Añade hasta 6, o pega imágenes con Ctrl+V",
    sendFeedback: "Enviar comentarios",
    sending: "Enviando informe...",
    sent: "¡Enviado! Gracias por el informe.",
    sendFailed: "No se pudo enviar",
    captureFailed: "No se pudo capturar la página.",
    historyEmpty: "Aún no has enviado informes desde este navegador.",
    historyError: "No se pudieron cargar tus informes.",
    loading: "Cargando...",
    dismiss: "Descartar",
    threadRole: "Conversación con soporte",
    threadUntitled: "Ticket de soporte",
    threadNewReply: "Nueva respuesta de soporte",
    threadConversation: "Conversación con soporte",
    threadEmpty: "Aún no hay mensajes.",
    replyPlaceholder: "Escribe tu respuesta...",
    replySending: "Enviando...",
    replySent: "Enviado",
    replyFailed: "No se pudo enviar tu respuesta.",
  },
  fr: {
    launcher: "Poser une question à l'assistant",
    title: "Butler AI",
    role: "Votre assistant Influencer Butler",
    close: "Fermer",
    back: "Retour",
    placeholder: "Saisissez votre question...",
    send: "Envoyer",
    thinking: "Réflexion...",
    intro: "Posez une question sur la configuration ou l'utilisation d'Influencer Butler.",
    reportCta: "🐛 Signaler un bug",
    reportHeading: "Signaler un bug ou une idée",
    reportSub: "Va directement à l'équipe",
    tabNew: "Nouveau signalement",
    tabHistory: "Mes signalements",
    type: "Type",
    typeBug: "Signalement de bug",
    typeFeature: "Demande de fonctionnalité",
    typeQuestion: "Question",
    fTitle: "Titre",
    titlePlaceholder: "Résumé court...",
    titleRequired: "Saisissez un titre",
    description: "Description",
    descPlaceholder: "Pour les bugs : ce qui s'est passé, ce que vous attendiez et comment le reproduire.",
    email: "Votre e-mail (facultatif, pour vous répondre)",
    emailPlaceholder: "vous@exemple.com",
    emailHint: "Cela ne ressemble pas à un e-mail valide. Votre signalement partira quand même, mais nous ne pourrons pas vous répondre.",
    attachLogs: "Joindre les détails de diagnostic (recommandé)",
    attachScreenshots: "Joindre des captures",
    capturePage: "Capturer cette page",
    screenshotHint: "Ajoutez-en jusqu'à 6, ou collez des images avec Ctrl+V",
    sendFeedback: "Envoyer le commentaire",
    sending: "Envoi du signalement...",
    sent: "Envoyé ! Merci pour le signalement.",
    sendFailed: "Échec de l'envoi",
    captureFailed: "Impossible de capturer la page.",
    historyEmpty: "Aucun signalement envoyé depuis ce navigateur pour l'instant.",
    historyError: "Impossible de charger vos signalements.",
    loading: "Chargement...",
    dismiss: "Ignorer",
    threadRole: "Conversation avec l'assistance",
    threadUntitled: "Ticket d'assistance",
    threadNewReply: "Nouvelle réponse de l'assistance",
    threadConversation: "Conversation avec l'assistance",
    threadEmpty: "Aucun message pour le moment.",
    replyPlaceholder: "Saisissez votre réponse...",
    replySending: "Envoi...",
    replySent: "Envoyé",
    replyFailed: "Impossible d'envoyer votre réponse.",
  },
};

const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap * { box-sizing: border-box; }
.launcher { order: 2; width: 54px; height: 54px; border: 0; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 24px; line-height: 1;
  background: linear-gradient(135deg, #fb923c, #ea580c);
  box-shadow: 0 10px 26px rgba(234,88,12,.36); }
.launcher:hover { transform: translateY(-2px); }
.panel { order: 1; width: 360px; max-width: calc(100vw - 32px);
  height: 540px; max-height: calc(100vh - 120px);
  background: #fff; color: #111827; border: 1px solid #e8eaed;
  border-radius: 16px; box-shadow: 0 18px 48px rgba(15,23,42,.28);
  display: flex; flex-direction: column; overflow: hidden; }
.panel[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  border-bottom: 1px solid #eef0f2; background: #fafafa; flex: 0 0 auto; }
.head .avatar { width: 32px; height: 32px; border-radius: 9px; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; color: #fff;
  font-size: 15px; background: linear-gradient(135deg, #fb923c, #ea580c); }
.head .idbox { flex: 1 1 auto; min-width: 0; }
.head .name { font-size: 14px; font-weight: 800; line-height: 1.2; }
.head .role { font-size: 11px; color: #6b7280; line-height: 1.3; }
.iconbtn { width: 26px; height: 26px; border: 0; background: transparent;
  color: #6b7280; font-size: 18px; cursor: pointer; border-radius: 6px; flex: 0 0 auto; }
.iconbtn:hover { background: rgba(0,0,0,.06); color: #111827; }
.transcript { flex: 1 1 auto; overflow-y: auto; padding: 14px; display: flex;
  flex-direction: column; gap: 10px; }
.msg { max-width: 86%; padding: 9px 12px; border-radius: 14px; font-size: 13px;
  line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.msg.assistant { align-self: flex-start; background: #f4f5f7; border: 1px solid #eceef1;
  border-bottom-left-radius: 5px; }
.msg.user { align-self: flex-end; color: #fff; border-bottom-right-radius: 5px;
  background: linear-gradient(135deg, #fb923c, #ea580c); }
.msg.error { align-self: flex-start; color: #b91c1c; background: rgba(220,38,38,.08);
  border: 1px solid rgba(220,38,38,.25); }
.msg.thinking { opacity: .7; font-style: italic; }
.msg img { max-width: 100%; border-radius: 8px; margin-top: 6px; display: block; }
.reportcta { flex: 0 0 auto; display: flex; justify-content: center; padding: 0 12px 8px;
  background: #fafafa; }
.reportcta button { border: 1px solid #e2e5ea; background: #fff; color: #6b7280;
  cursor: pointer; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 6px 12px; }
.reportcta button:hover { color: #ea580c; border-color: rgba(234,88,12,.4); }
.composer { flex: 0 0 auto; display: flex; align-items: flex-end; gap: 8px;
  padding: 10px 12px 12px; border-top: 1px solid #eef0f2; background: #fafafa; }
.composer input { flex: 1 1 auto; padding: 9px 11px; border: 1px solid #d9dce1;
  border-radius: 10px; font-size: 13px; font-family: inherit; outline: none; }
.composer input:focus { border-color: #f59e0b; }
.sendbtn { flex: 0 0 auto; border: 0; color: #fff; border-radius: 10px; padding: 9px 15px;
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  background: linear-gradient(135deg, #fb923c, #ea580c); }
.sendbtn:disabled { opacity: .55; cursor: default; }
.report { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.report[hidden] { display: none; }
.tabs { flex: 0 0 auto; display: flex; gap: 6px; padding: 10px 14px 0; }
.tabs button { flex: 1 1 auto; border: 1px solid #e2e5ea; background: #fff; color: #6b7280;
  cursor: pointer; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 6px 10px; }
.tabs button.active { color: #ea580c; border-color: rgba(234,88,12,.4); background: rgba(234,88,12,.08); }
.rbody { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px; display: flex;
  flex-direction: column; gap: 10px; }
.rbody[hidden] { display: none; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; }
.field select, .field input, .field textarea { width: 100%; padding: 8px 10px;
  border: 1px solid #d9dce1; border-radius: 9px; font-size: 13px; font-family: inherit;
  font-weight: 400; line-height: 1.4; outline: none; }
.field textarea { resize: vertical; min-height: 72px; }
.field select:focus, .field input:focus, .field textarea:focus { border-color: #f59e0b; }
.checkrow { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; }
.hint { font-size: 11.5px; font-weight: 400; color: #6b7280; line-height: 1.4; }
.hint[hidden] { display: none; }
.pickrow { display: flex; gap: 8px; flex-wrap: wrap; }
.pickbtn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d9dce1;
  background: #fff; color: #111827; border-radius: 9px; padding: 7px 11px; font-size: 12.5px;
  font-weight: 600; cursor: pointer; }
.pickbtn:hover { border-color: rgba(234,88,12,.4); color: #ea580c; }
.shots { display: flex; flex-direction: column; gap: 6px; }
.shots[hidden] { display: none; }
.shot { display: flex; align-items: center; gap: 8px; border: 1px solid #eceef1;
  border-radius: 8px; padding: 5px 7px; }
.shot img { width: 34px; height: 34px; object-fit: cover; border-radius: 5px; flex: 0 0 auto; }
.shot .meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.shot .nm { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shot .sz { font-size: 10.5px; color: #6b7280; }
.shot .del { flex: 0 0 auto; border: 0; background: transparent; color: #6b7280;
  font-size: 16px; cursor: pointer; width: 22px; height: 22px; }
.shot .del:hover { color: #dc2626; }
.rfoot { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 14px 12px;
  border-top: 1px solid #eef0f2; background: #fafafa; }
.rfoot[hidden] { display: none; }
.status { flex: 1 1 auto; font-size: 12px; line-height: 1.35; }
.status.ok { color: #16a34a; }
.status.err { color: #dc2626; }
.history { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px; display: flex;
  flex-direction: column; gap: 8px; min-height: 0; }
.history[hidden] { display: none; }
.hempty { font-size: 12.5px; color: #6b7280; line-height: 1.5; padding: 6px 2px; }
.hempty[hidden] { display: none; }
.hitem { border: 1px solid #eceef1; border-radius: 10px; padding: 8px 10px; display: flex;
  flex-direction: column; gap: 5px; }
.htop { display: flex; align-items: center; gap: 7px; }
.hbadge { flex: 0 0 auto; font-size: 10px; font-weight: 800; text-transform: uppercase;
  border-radius: 999px; padding: 2px 7px; background: rgba(234,88,12,.12); color: #ea580c; }
.hbadge.feature { background: rgba(99,102,241,.14); color: #6366f1; }
.hbadge.question { background: rgba(16,163,74,.14); color: #16a34a; }
.htitle { flex: 1 1 auto; min-width: 0; font-size: 12.5px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hstatus { flex: 0 0 auto; font-size: 10.5px; font-weight: 700; color: #6b7280; text-transform: capitalize; }
.hmeta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #6b7280; }
.hwhen { flex: 1 1 auto; }
.hdismiss { flex: 0 0 auto; border: 0; background: transparent; color: #ea580c;
  font-size: 11.5px; font-weight: 700; cursor: pointer; }
.hdismiss:hover { text-decoration: underline; }
.launcher { position: relative; }
.badge { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px;
  padding: 0 5px; border-radius: 999px; background: #dc2626; color: #fff;
  font-size: 11px; font-weight: 800; line-height: 20px; text-align: center;
  border: 2px solid #fff; box-shadow: 0 2px 6px rgba(220,38,38,.4); }
.badge[hidden] { display: none; }
.convo { text-align: left; width: 100%; cursor: pointer; border: 1px solid #eceef1;
  border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: #fff; font-family: inherit; }
.convo:hover { border-color: rgba(234,88,12,.4); }
.convo.unread { border-color: rgba(234,88,12,.55); background: rgba(234,88,12,.06); }
.convo .ctop { display: flex; align-items: center; gap: 7px; }
.convo .cdot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: #ea580c; }
.convo .ctitle { flex: 1 1 auto; min-width: 0; font-size: 12.5px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.convo .cmeta { font-size: 11px; color: #6b7280; }
.convo.unread .cmeta { color: #ea580c; font-weight: 700; }
.thread { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.thread[hidden] { display: none; }
.thread .transcript { flex: 1 1 auto; }
.tstatus { padding: 0 12px 8px; font-size: 12px; background: #fafafa; }
.tstatus.ok { color: #16a34a; }
.tstatus.err { color: #dc2626; }
.msg .atts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.msg .attchip { font-size: 11px; border-radius: 999px; padding: 2px 8px;
  background: rgba(0,0,0,.06); color: #6b7280; }
.msg.user .attchip { background: rgba(255,255,255,.25); color: #fff; }
`;

let mounted = false;

export function initChatBubble(): void {
  if (mounted) return;
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.isConnected) {
    mounted = true;
    return;
  }
  try {
    new ChatBubble();
    mounted = true;
  } catch {
    /* never let the bubble break the rest of the content script */
  }
}

class ChatBubble {
  private s: Strings;
  private root: ShadowRoot;
  private open = false;
  private busy = false;
  private view: View = "chat";
  private reportTab: ReportTab = "form";
  private history: AiChatTurn[] = [];
  private shots: Screenshot[] = [];
  private bundle: MyFeedbackItem[] = [];

  // Elements
  private panel!: HTMLElement;
  private launcher!: HTMLButtonElement;
  private back!: HTMLButtonElement;
  private transcript!: HTMLElement;
  private composer!: HTMLElement;
  private input!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private reportCta!: HTMLElement;
  private nameEl!: HTMLElement;
  private roleEl!: HTMLElement;
  private full!: HTMLButtonElement;
  private report!: HTMLElement;
  private tabFormBtn!: HTMLButtonElement;
  private tabHistoryBtn!: HTMLButtonElement;
  private rbody!: HTMLElement;
  private rfoot!: HTMLElement;
  private historyWrap!: HTMLElement;
  private historyEmpty!: HTMLElement;
  private historyList!: HTMLElement;
  private typeSel!: HTMLSelectElement;
  private titleInput!: HTMLInputElement;
  private descInput!: HTMLTextAreaElement;
  private emailInput!: HTMLInputElement;
  private emailHint!: HTMLElement;
  private logsChk!: HTMLInputElement;
  private fileInput!: HTMLInputElement;
  private shotsWrap!: HTMLElement;
  private reportSend!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private badge!: HTMLElement;
  private threadWrap!: HTMLElement;
  private threadTranscript!: HTMLElement;
  private threadInput!: HTMLInputElement;
  private threadSendBtn!: HTMLButtonElement;
  private threadStatus!: HTMLElement;
  private currentThreadId: string | null = null;
  private autoOpened = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.s = STRINGS[getLocale()] || STRINGS.en;
    const host = document.createElement("div");
    host.id = HOST_ID;
    this.root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.append(style);
    this.build();
    document.documentElement.append(host);
    this.startReplyPolling();
  }

  // Poll for support replies: refresh the unread badge, and auto-open the bubble
  // to a newly-answered thread the first time we see it (only on the visible tab,
  // so a reply does not pop the bubble on every background tab at once).
  private startReplyPolling(): void {
    void this.refreshThreads(true);
    this.pollTimer = setInterval(() => { void this.refreshThreads(true); }, 90_000);
  }

  private build(): void {
    const s = this.s;
    const wrap = el("div", "wrap");

    this.launcher = el("button", "launcher");
    this.launcher.type = "button";
    this.launcher.setAttribute("aria-label", s.launcher);
    this.launcher.textContent = "💬";
    this.launcher.addEventListener("click", () => this.toggle());
    this.badge = el("span", "badge");
    this.badge.hidden = true;
    this.launcher.append(this.badge);

    this.panel = el("section", "panel");
    this.panel.hidden = true;

    // Header
    const head = el("div", "head");
    this.back = el("button", "iconbtn");
    this.back.type = "button";
    this.back.textContent = "←";
    this.back.setAttribute("aria-label", s.back);
    this.back.hidden = true;
    this.back.addEventListener("click", () => this.goBack());
    const avatar = el("div", "avatar");
    avatar.textContent = "💬";
    const idbox = el("div", "idbox");
    this.nameEl = el("div", "name", s.title);
    this.roleEl = el("div", "role", s.role);
    idbox.append(this.nameEl, this.roleEl);
    this.full = el("button", "iconbtn");
    this.full.type = "button";
    this.full.textContent = "×";
    this.full.setAttribute("aria-label", s.close);
    this.full.addEventListener("click", () => this.close());
    head.append(this.back, avatar, idbox, this.full);

    // Chat view
    this.transcript = el("div", "transcript");
    this.reportCta = el("div", "reportcta");
    const reportOpen = el("button", undefined, s.reportCta);
    reportOpen.type = "button";
    reportOpen.addEventListener("click", () => this.openReport());
    this.reportCta.append(reportOpen);
    this.composer = el("div", "composer");
    this.input = el("input", undefined);
    this.input.type = "text";
    this.input.placeholder = s.placeholder;
    this.sendBtn = el("button", "sendbtn", s.send);
    this.sendBtn.type = "button";
    this.sendBtn.addEventListener("click", () => void this.sendChat(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.sendChat(this.input.value);
    });
    this.composer.append(this.input, this.sendBtn);

    // Report view
    this.report = this.buildReport();

    // Support-conversation (thread) view
    this.threadWrap = el("div", "thread");
    this.threadWrap.hidden = true;
    this.threadTranscript = el("div", "transcript");
    const tComposer = el("div", "composer");
    this.threadInput = el("input", undefined);
    this.threadInput.type = "text";
    this.threadInput.placeholder = s.replyPlaceholder;
    this.threadSendBtn = el("button", "sendbtn", s.send);
    this.threadSendBtn.type = "button";
    this.threadSendBtn.addEventListener("click", () => void this.sendThreadReply());
    this.threadInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.sendThreadReply();
    });
    tComposer.append(this.threadInput, this.threadSendBtn);
    this.threadStatus = el("div", "tstatus");
    this.threadWrap.append(this.threadTranscript, tComposer, this.threadStatus);

    this.panel.append(head, this.transcript, this.reportCta, this.composer, this.report, this.threadWrap);
    wrap.append(this.panel, this.launcher);
    this.root.append(wrap);
  }

  private buildReport(): HTMLElement {
    const s = this.s;
    const report = el("div", "report");
    report.hidden = true;

    const tabs = el("div", "tabs");
    this.tabFormBtn = el("button", "active", s.tabNew);
    this.tabFormBtn.type = "button";
    this.tabFormBtn.addEventListener("click", () => this.setReportTab("form"));
    this.tabHistoryBtn = el("button", undefined, s.tabHistory);
    this.tabHistoryBtn.type = "button";
    this.tabHistoryBtn.addEventListener("click", () => this.setReportTab("history"));
    tabs.append(this.tabFormBtn, this.tabHistoryBtn);

    this.rbody = el("div", "rbody");

    const typeField = el("label", "field");
    typeField.append(el("span", undefined, s.type));
    this.typeSel = el("select", undefined);
    for (const [val, label] of [
      ["bug", s.typeBug],
      ["feature", s.typeFeature],
      ["question", s.typeQuestion],
    ] as const) {
      const opt = el("option", undefined, label);
      opt.value = val;
      this.typeSel.append(opt);
    }
    typeField.append(this.typeSel);

    const titleField = el("label", "field");
    titleField.append(el("span", undefined, s.fTitle));
    this.titleInput = el("input", undefined);
    this.titleInput.type = "text";
    this.titleInput.maxLength = 200;
    this.titleInput.placeholder = s.titlePlaceholder;
    titleField.append(this.titleInput);

    const descField = el("label", "field");
    descField.append(el("span", undefined, s.description));
    this.descInput = el("textarea", undefined);
    this.descInput.rows = 4;
    this.descInput.placeholder = s.descPlaceholder;
    descField.append(this.descInput);

    const emailField = el("label", "field");
    emailField.append(el("span", undefined, s.email));
    this.emailInput = el("input", undefined);
    this.emailInput.type = "email";
    this.emailInput.maxLength = 200;
    this.emailInput.placeholder = s.emailPlaceholder;
    this.emailHint = el("span", "hint", s.emailHint);
    this.emailHint.hidden = true;
    const refreshHint = () => {
      const v = this.emailInput.value.trim();
      this.emailHint.hidden = !v || isEmailShaped(v);
    };
    this.emailInput.addEventListener("input", refreshHint);
    emailField.append(this.emailInput, this.emailHint);

    const logsRow = el("label", "checkrow");
    this.logsChk = el("input", undefined);
    this.logsChk.type = "checkbox";
    this.logsChk.checked = true;
    logsRow.append(this.logsChk, el("span", undefined, s.attachLogs));

    const pickRow = el("div", "pickrow");
    const pickLabel = el("label", "pickbtn", s.attachScreenshots);
    this.fileInput = el("input", undefined);
    this.fileInput.type = "file";
    this.fileInput.accept = "image/png,image/jpeg,image/gif,image/webp";
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener("change", () => void this.onFiles());
    pickLabel.append(this.fileInput);
    const captureBtn = el("button", "pickbtn", "📸 " + s.capturePage);
    captureBtn.type = "button";
    captureBtn.addEventListener("click", () => void this.capturePage());
    pickRow.append(pickLabel, captureBtn);

    const shotHint = el("span", "hint", s.screenshotHint);
    this.shotsWrap = el("div", "shots");
    this.shotsWrap.hidden = true;

    this.rbody.append(typeField, titleField, descField, emailField, logsRow, pickRow, shotHint, this.shotsWrap);

    // History view
    this.historyWrap = el("div", "history");
    this.historyWrap.hidden = true;
    this.historyEmpty = el("div", "hempty");
    this.historyEmpty.hidden = true;
    this.historyList = el("div", undefined);
    this.historyWrap.append(this.historyEmpty, this.historyList);

    // Footer
    this.rfoot = el("div", "rfoot");
    this.reportSend = el("button", "sendbtn", s.sendFeedback);
    this.reportSend.type = "button";
    this.reportSend.addEventListener("click", () => void this.submitReport());
    this.statusEl = el("div", "status");
    this.rfoot.append(this.reportSend, this.statusEl);

    // Paste screenshots anywhere in the report view.
    report.addEventListener("paste", (e) => void this.onPaste(e as ClipboardEvent));

    report.append(tabs, this.rbody, this.historyWrap, this.rfoot);
    return report;
  }

  // ---- open / close / view ----
  private toggle(): void {
    this.open ? this.close() : this.show("chat");
  }

  private show(view: View): void {
    if (!this.open) {
      this.panel.hidden = false;
      this.open = true;
      if (view === "chat" && !this.history.length && !this.transcript.childElementCount) {
        this.addBubble("assistant", this.s.intro);
      }
    }
    this.setView(view);
    setTimeout(() => {
      try {
        (view === "report" ? this.titleInput : this.input).focus();
      } catch {
        /* ignore */
      }
    }, 0);
  }

  private close(): void {
    this.panel.hidden = true;
    this.open = false;
  }

  openReport(): void {
    this.resetForm();
    this.show("report");
  }

  private setView(view: View): void {
    this.view = view;
    const isReport = view === "report";
    const isThread = view === "thread";
    const isChat = view === "chat";
    this.report.hidden = !isReport;
    this.threadWrap.hidden = !isThread;
    this.transcript.hidden = !isChat;
    this.composer.hidden = !isChat;
    this.reportCta.hidden = !isChat;
    this.back.hidden = isChat;
    this.full.textContent = "×";
    if (isReport) {
      this.nameEl.textContent = this.s.reportHeading;
      this.roleEl.textContent = this.s.reportSub;
    } else if (isChat) {
      this.nameEl.textContent = this.s.title;
      this.roleEl.textContent = this.s.role;
    }
    // Thread header text is set by openThread (ticket title + role).
  }

  // Back arrow: thread -> reports list, report -> chat.
  private goBack(): void {
    if (this.view === "thread") { this.setView("report"); this.setReportTab("history"); return; }
    this.setView("chat");
  }

  private setReportTab(tab: ReportTab): void {
    this.reportTab = tab;
    const isHistory = tab === "history";
    this.tabFormBtn.classList.toggle("active", !isHistory);
    this.tabHistoryBtn.classList.toggle("active", isHistory);
    this.rbody.hidden = isHistory;
    this.rfoot.hidden = isHistory;
    this.historyWrap.hidden = !isHistory;
    if (isHistory) void this.loadHistory();
  }

  // ---- chat ----
  private addBubble(role: "user" | "assistant" | "error", text: string, images?: Array<{ url: string; alt: string }>): HTMLElement {
    const b = el("div", `msg ${role}`, text);
    for (const img of images || []) {
      const node = document.createElement("img");
      node.src = img.url;
      node.alt = img.alt || "";
      node.loading = "lazy";
      b.append(node);
    }
    this.transcript.append(b);
    this.transcript.scrollTop = this.transcript.scrollHeight;
    return b;
  }

  private async sendChat(raw: string): Promise<void> {
    const content = (raw || "").trim();
    if (!content || this.busy) return;
    this.busy = true;
    this.sendBtn.disabled = true;
    this.input.value = "";
    this.addBubble("user", content);
    this.history.push({ role: "user", content });
    const thinking = this.addBubble("assistant", this.s.thinking);
    thinking.classList.add("thinking");
    try {
      const res = await sendToBackground<AiChatResult>({ kind: "AI_CHAT", messages: this.history });
      thinking.remove();
      if (res && res.ok && res.reply) {
        this.history.push({ role: "assistant", content: res.reply });
        this.addBubble("assistant", res.reply, res.images);
      } else {
        this.addBubble("error", (res && res.error) || "The assistant is unavailable right now.");
        if (this.history[this.history.length - 1]?.role === "user") this.history.pop();
      }
    } catch {
      thinking.remove();
      this.addBubble("error", "Could not reach the assistant.");
      if (this.history[this.history.length - 1]?.role === "user") this.history.pop();
    } finally {
      this.busy = false;
      this.sendBtn.disabled = false;
      try { this.input.focus(); } catch { /* ignore */ }
    }
  }

  // ---- report form ----
  private resetForm(): void {
    this.typeSel.value = "bug";
    this.titleInput.value = "";
    this.descInput.value = "";
    this.emailInput.value = "";
    this.emailHint.hidden = true;
    this.logsChk.checked = true;
    this.shots = [];
    this.renderShots();
    this.setStatus("", "");
    this.setReportTab("form");
  }

  private setStatus(text: string, cls: "" | "ok" | "err"): void {
    this.statusEl.textContent = text;
    this.statusEl.className = "status" + (cls ? " " + cls : "");
  }

  private async onFiles(): Promise<void> {
    const files = this.fileInput.files ? Array.from(this.fileInput.files) : [];
    if (files.length) await this.ingest(files);
    this.fileInput.value = "";
  }

  private async onPaste(e: ClipboardEvent): Promise<void> {
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (!f) continue;
        if (f.name) { pasted.push(f); continue; }
        const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        pasted.push(new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }));
      }
    }
    if (!pasted.length) return;
    e.preventDefault();
    await this.ingest(pasted);
  }

  private async ingest(files: File[]): Promise<void> {
    let firstError = "";
    for (const file of files) {
      const check = validateScreenshot({ mime: file.type, bytes: file.size, currentCount: this.shots.length });
      if (!check.ok) {
        if (!firstError) firstError = check.error || "";
        if (this.shots.length >= SCREENSHOT_MAX_COUNT) break;
        continue;
      }
      try {
        const base64 = await readFileBase64(file);
        this.shots.push({ base64, mime: file.type, filename: file.name || "screenshot.png", bytes: file.size });
        this.renderShots();
      } catch {
        if (!firstError) firstError = "Failed to read file";
      }
    }
    if (firstError) this.setStatus(firstError, "err");
  }

  private async capturePage(): Promise<void> {
    try {
      const res = await sendToBackground<CaptureScreenshotResult>({ kind: "CAPTURE_SCREENSHOT" });
      if (!res || !res.ok || !res.dataUrl) {
        this.setStatus((res && res.error) || this.s.captureFailed, "err");
        return;
      }
      const { base64, mime } = splitDataUrl(res.dataUrl);
      if (!base64) { this.setStatus(this.s.captureFailed, "err"); return; }
      const bytes = Math.floor((base64.length * 3) / 4);
      const check = validateScreenshot({ mime, bytes, currentCount: this.shots.length });
      if (!check.ok) { this.setStatus(check.error || "", "err"); return; }
      this.shots.push({ base64, mime, filename: `page-${Date.now()}.png`, bytes });
      this.renderShots();
      this.setStatus("", "");
    } catch {
      this.setStatus(this.s.captureFailed, "err");
    }
  }

  private renderShots(): void {
    this.shotsWrap.textContent = "";
    if (!this.shots.length) { this.shotsWrap.hidden = true; return; }
    this.shots.forEach((shot, index) => {
      const row = el("div", "shot");
      const img = document.createElement("img");
      img.src = `data:${shot.mime};base64,${shot.base64}`;
      img.alt = "";
      const meta = el("div", "meta");
      meta.append(el("span", "nm", shot.filename), el("span", "sz", formatBytes(shot.bytes)));
      const del = el("button", "del", "×");
      del.type = "button";
      del.addEventListener("click", () => {
        this.shots.splice(index, 1);
        this.renderShots();
      });
      row.append(img, meta, del);
      this.shotsWrap.append(row);
    });
    this.shotsWrap.hidden = false;
  }

  private async submitReport(): Promise<void> {
    if (this.busy) return;
    const title = this.titleInput.value.trim();
    if (!title) {
      this.setStatus(this.s.titleRequired, "err");
      try { this.titleInput.focus(); } catch { /* ignore */ }
      return;
    }
    this.busy = true;
    this.reportSend.disabled = true;
    this.setStatus(this.s.sending, "");
    try {
      const res = await sendToBackground<RichFeedbackResult>({
        kind: "SUBMIT_FEEDBACK_RICH",
        feedback: {
          type: this.typeSel.value as FeedbackType,
          title,
          description: this.descInput.value.trim(),
          userEmail: this.emailInput.value.trim(),
          attachLogs: this.logsChk.checked,
          screenshots: this.shots.map((s) => ({ base64: s.base64, mime: s.mime, filename: s.filename })),
          pageUrl: location.href,
        },
      });
      if (res && res.ok) {
        this.setStatus(this.s.sent, "ok");
        this.resetForm();
      } else {
        this.setStatus((res && res.error) || this.s.sendFailed, "err");
      }
    } catch {
      this.setStatus(this.s.sendFailed, "err");
    } finally {
      this.busy = false;
      this.reportSend.disabled = false;
    }
  }

  // ---- my reports ----
  private async loadHistory(): Promise<void> {
    this.historyList.textContent = "";
    this.historyEmpty.textContent = this.s.loading;
    this.historyEmpty.hidden = false;
    try {
      // Support conversations (support has answered) render first as clickable
      // rows; the local submissions list follows, de-duped against them.
      let threads: FeedbackThread[] = [];
      try {
        const tRes = await sendToBackground<FeedbackThreadsResult>({ kind: "LIST_FEEDBACK_THREADS" });
        threads = tRes && tRes.ok && Array.isArray(tRes.threads) ? tRes.threads : [];
      } catch { threads = []; }
      const res = await sendToBackground<MyFeedbackListResult>({ kind: "LIST_MY_FEEDBACK" });
      const threadIds = new Set(threads.map((t) => t.id));
      const rows = (res && res.ok && Array.isArray(res.submissions) ? res.submissions : [])
        .filter((r) => !threadIds.has(r.id));
      this.bundle = rows;
      this.renderHistory(rows, threads);
    } catch {
      this.historyEmpty.textContent = this.s.historyError;
      this.historyEmpty.hidden = false;
    }
  }

  private renderHistory(rows: MyFeedbackItem[], threads: FeedbackThread[] = []): void {
    this.historyList.textContent = "";
    this.renderThreadRows(threads);
    if (!rows.length && !threads.length) {
      this.historyEmpty.textContent = this.s.historyEmpty;
      this.historyEmpty.hidden = false;
      return;
    }
    this.historyEmpty.hidden = true;
    const typeLabel = (t: string): string =>
      t === "feature" ? this.s.typeFeature : t === "question" ? this.s.typeQuestion : this.s.typeBug;
    for (const row of rows) {
      const item = el("div", "hitem");
      const top = el("div", "htop");
      const badge = el("span", `hbadge ${row.type}`, typeLabel(row.type));
      const title = el("span", "htitle", row.title || "(untitled)");
      title.title = row.title || "";
      const status = el("span", "hstatus", row.status || "sent");
      top.append(badge, title, status);
      const meta = el("div", "hmeta");
      let when = "";
      try { when = row.createdAt ? new Date(row.createdAt).toLocaleString() : ""; } catch { when = ""; }
      const whenEl = el("span", "hwhen", row.attachmentCount ? `${when} · 📎 ${row.attachmentCount}` : when);
      const del = el("button", "hdismiss", this.s.dismiss);
      del.type = "button";
      del.addEventListener("click", () => void this.dismiss(row.id));
      meta.append(whenEl, del);
      item.append(top, meta);
      this.historyList.append(item);
    }
  }

  private async dismiss(id: string): Promise<void> {
    if (!id) return;
    try {
      const res = await sendToBackground<DismissFeedbackResult>({ kind: "DISMISS_MY_FEEDBACK", id });
      if (res && res.ok) void this.loadHistory();
    } catch {
      /* ignore */
    }
  }

  // ---- support-reply threads ----

  private renderThreadRows(threads: FeedbackThread[]): void {
    for (const th of threads) {
      const item = el("button", "convo" + (th.unread ? " unread" : ""));
      (item as HTMLButtonElement).type = "button";
      const top = el("div", "ctop");
      if (th.unread) top.append(el("span", "cdot"));
      top.append(el("span", "ctitle", th.title || this.s.threadUntitled));
      const replies = Array.isArray(th.replies) ? th.replies : [];
      const last = replies[replies.length - 1];
      let when = "";
      try { when = last && last.sentAt ? new Date(last.sentAt).toLocaleString() : ""; } catch { when = ""; }
      const meta = el("div", "cmeta", th.unread ? this.s.threadNewReply : (when || this.s.threadConversation));
      item.append(top, meta);
      item.addEventListener("click", () => void this.openThread(th.id));
      this.historyList.append(item);
    }
  }

  async openThread(ticketId: string): Promise<void> {
    const id = (ticketId || "").trim();
    if (!id) return;
    if (!this.open) { this.panel.hidden = false; this.open = true; }
    this.currentThreadId = id;
    let thread: FeedbackThread | null = null;
    try {
      const res = await sendToBackground<FeedbackThreadsResult>({ kind: "LIST_FEEDBACK_THREADS" });
      const threads = res && res.ok && Array.isArray(res.threads) ? res.threads : [];
      thread = threads.find((t) => t.id === id) || null;
    } catch { thread = null; }
    this.renderThread(thread);
    this.setView("thread");
    try { await sendToBackground({ kind: "MARK_FEEDBACK_THREAD_READ", ticketId: id }); } catch { /* ignore */ }
    void this.refreshThreads(false);
    setTimeout(() => { try { this.threadInput.focus(); } catch { /* ignore */ } }, 0);
  }

  private renderThread(thread: FeedbackThread | null): void {
    this.nameEl.textContent = (thread && thread.title) || this.s.threadUntitled;
    this.roleEl.textContent = this.s.threadRole;
    this.threadTranscript.textContent = "";
    this.setThreadStatus("", "");
    const replies = thread && Array.isArray(thread.replies) ? thread.replies : [];
    if (!replies.length) {
      this.addThreadBubble("assistant", this.s.threadEmpty);
    } else {
      for (const r of replies) {
        this.addThreadBubble(r.direction === "outbound" ? "assistant" : "user", r.body || "", r.attachments);
      }
    }
    this.threadInput.value = "";
    this.threadInput.placeholder = this.s.replyPlaceholder;
  }

  private addThreadBubble(
    role: "user" | "assistant",
    text: string,
    attachments?: FeedbackThreadReply["attachments"],
  ): void {
    const b = el("div", `msg ${role}`, text);
    const atts = Array.isArray(attachments) ? attachments : [];
    if (atts.length) {
      const row = el("div", "atts");
      for (const a of atts) row.append(el("span", "attchip", "📎 " + (a.filename || "attachment")));
      b.append(row);
    }
    this.threadTranscript.append(b);
    this.threadTranscript.scrollTop = this.threadTranscript.scrollHeight;
  }

  private async sendThreadReply(): Promise<void> {
    const id = this.currentThreadId;
    const text = (this.threadInput.value || "").trim();
    if (!id || !text || this.busy) return;
    this.busy = true;
    this.threadSendBtn.disabled = true;
    this.addThreadBubble("user", text);
    this.threadInput.value = "";
    this.setThreadStatus(this.s.replySending, "");
    try {
      const res = await sendToBackground<PostReplyResult>({ kind: "POST_FEEDBACK_REPLY", ticketId: id, body: text });
      if (res && res.ok) this.setThreadStatus(this.s.replySent, "ok");
      else this.setThreadStatus((res && res.error) || this.s.replyFailed, "err");
    } catch {
      this.setThreadStatus(this.s.replyFailed, "err");
    } finally {
      this.busy = false;
      this.threadSendBtn.disabled = false;
    }
  }

  private setThreadStatus(text: string, cls: "" | "ok" | "err"): void {
    this.threadStatus.textContent = text;
    this.threadStatus.className = "tstatus" + (cls ? " " + cls : "");
  }

  // Update the unread badge; when `autoOpen`, expand to a newly-answered thread
  // the first time it appears (only on the visible tab).
  private async refreshThreads(autoOpen: boolean): Promise<void> {
    let res: FeedbackThreadsResult | null = null;
    try {
      res = await sendToBackground<FeedbackThreadsResult>({ kind: "LIST_FEEDBACK_THREADS" });
    } catch { return; }
    if (!res || !res.ok) return;
    this.setBadge(Number(res.unread) || 0);
    if (!autoOpen) return;
    const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
    if (!isVisible) return;
    const fresh = (res.threads || []).find((t) => t.unread && !this.autoOpened.has(t.id));
    if (fresh) {
      this.autoOpened.add(fresh.id);
      void this.openThread(fresh.id);
    }
  }

  private setBadge(count: number): void {
    const n = Number(count) || 0;
    if (n <= 0) { this.badge.hidden = true; this.badge.textContent = ""; return; }
    this.badge.textContent = n > 9 ? "9+" : String(n);
    this.badge.hidden = false;
  }
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl: string): { base64: string; mime: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return { base64: "", mime: "image/png" };
  return { mime: m[1] || "image/png", base64: m[2] || "" };
}
