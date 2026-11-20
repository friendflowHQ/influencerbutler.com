import { getLocale } from "../i18n";
import { sendToBackground, type AuthStatus } from "../shared/messages";
import { isPairedLocal } from "../shared/bridge-token";
import { isAndroid } from "../shared/platform";
import {
  checklistItems,
  shouldShowChecklist,
  type ChecklistId,
} from "../shared/milestones";
import { MILESTONES_KEY } from "../shared/milestones";
import { loadMilestones, saveMilestones } from "../shared/milestones-store";

// The popup's "Getting started" card: five small steps (connect, pair the app, then
// the first accept, send and list save). Shown only to new users, tick marks fill in
// as they go, and it goes away when everything is done or when it is dismissed.

type Copy = {
  heading: string;
  dismiss: string;
  items: Record<ChecklistId, string>;
  done: string;
  todo: string;
};

const EN: Copy = {
  heading: "Getting started",
  dismiss: "Dismiss",
  done: "Done",
  todo: "To do",
  items: {
    signedIn: "Connect your license key",
    paired: "Pair the desktop app",
    firstAccept: "Accept your first campaign",
    firstSend: "Send a product to the desktop app",
    firstList: "Save a product to a list",
  },
};
const ES: Copy = {
  heading: "Primeros pasos",
  dismiss: "Descartar",
  done: "Hecho",
  todo: "Pendiente",
  items: {
    signedIn: "Conecta tu clave de licencia",
    paired: "Vincula la app de escritorio",
    firstAccept: "Acepta tu primera campaña",
    firstSend: "Envía un producto a la app de escritorio",
    firstList: "Guarda un producto en una lista",
  },
};
const FR: Copy = {
  heading: "Pour commencer",
  dismiss: "Masquer",
  done: "Fait",
  todo: "À faire",
  items: {
    signedIn: "Connectez votre clé de licence",
    paired: "Associez l'application de bureau",
    firstAccept: "Acceptez votre première campagne",
    firstSend: "Envoyez un produit à l'application de bureau",
    firstList: "Enregistrez un produit dans une liste",
  },
};

function copy(): Copy {
  const locale = String(getLocale());
  return locale.startsWith("es") ? ES : locale.startsWith("fr") ? FR : EN;
}

// Where a step that needs setup points: the popup card that does it.
const JUMP: Partial<Record<ChecklistId, string>> = { signedIn: "account", paired: "app-bridge" };

let watching = false;

// Keep the card current while the popup is open: signing in, pairing or reaching a
// milestone in another tab changes storage, and the card re-renders.
function watchChanges(jump: (cardId: string) => void): void {
  if (watching) return;
  watching = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = Object.keys(changes).some((k) => k === "ib" || k === MILESTONES_KEY || k.startsWith("ib-bridge"));
    if (!relevant) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void renderGettingStarted(jump), 200);
  });
}

export async function renderGettingStarted(jump: (cardId: string) => void): Promise<void> {
  watchChanges(jump);
  const card = document.getElementById("getting-started-card");
  const heading = document.getElementById("getting-started-heading");
  const list = document.getElementById("getting-started-list");
  const dismiss = document.getElementById("getting-started-dismiss") as HTMLButtonElement | null;
  if (!card || !heading || !list || !dismiss) return;
  try {
    const [state, auth, paired, mobile] = await Promise.all([
      loadMilestones(),
      sendToBackground<AuthStatus>({ kind: "GET_AUTH_STATUS" }),
      isPairedLocal(),
      isAndroid(),
    ]);
    const items = checklistItems(state, { signedIn: !!auth?.signedIn, paired, mobile });
    if (!shouldShowChecklist(state, items)) {
      card.hidden = true;
      return;
    }
    const c = copy();
    heading.textContent = c.heading;
    dismiss.textContent = c.dismiss;
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = item.done ? "gs-item done" : "gs-item";
      const mark = document.createElement("span");
      mark.className = "gs-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = item.done ? "✓" : "○";
      const label = document.createElement("span");
      label.textContent = c.items[item.id];
      const status = document.createElement("span");
      status.className = "sr-only";
      status.textContent = item.done ? ` (${c.done})` : ` (${c.todo})`;
      const target = JUMP[item.id];
      if (!item.done && target) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gs-link";
        btn.append(mark, label, status);
        btn.addEventListener("click", () => jump(target));
        li.append(btn);
      } else {
        li.append(mark, label, status);
      }
      list.append(li);
    }
    dismiss.onclick = async () => {
      await saveMilestones({ ...(await loadMilestones()), dismissed: true });
      card.hidden = true;
    };
    card.hidden = false;
  } catch {
    card.hidden = true;
  }
}
