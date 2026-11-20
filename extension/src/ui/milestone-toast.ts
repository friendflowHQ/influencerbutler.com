import { getLocale } from "../i18n";
import { applyMilestone, type MilestoneId } from "../shared/milestones";
import { ensureMilestonesSeeded, saveMilestones } from "../shared/milestones-store";
import { showToast } from "./toast";

// "First success" celebration: the first accepted campaign, first send to the
// desktop app and first list save each show one short toast with the next step.
// The first-ever occurrence only, at most one toast per page load, and never an
// error: noting a milestone must not break the action it celebrates.

type Copy = { title: string; message: string };
type Dict = { close: string; byId: Record<MilestoneId, Copy> };

const EN: Dict = {
  close: "Close",
  byId: {
    firstAccept: { title: "First campaign accepted", message: "Nice. Next step: open Deals Butler in the desktop app to share it." },
    firstSend: { title: "Sent to the app", message: "Your first send worked. Open the desktop app to review it and post." },
    firstList: { title: "Saved to a list", message: "That is your first list save. Open your lists in the extension popup to share or send them." },
  },
};
const ES: Dict = {
  close: "Cerrar",
  byId: {
    firstAccept: { title: "Primera campaña aceptada", message: "Bien hecho. Siguiente paso: abre Deals Butler en la app de escritorio para compartirla." },
    firstSend: { title: "Enviado a la app", message: "Tu primer envío funcionó. Abre la app de escritorio para revisarlo y publicarlo." },
    firstList: { title: "Guardado en una lista", message: "Es tu primera lista guardada. Abre tus listas en el popup de la extensión para compartirlas o enviarlas." },
  },
};
const FR: Dict = {
  close: "Fermer",
  byId: {
    firstAccept: { title: "Première campagne acceptée", message: "Bravo. Étape suivante : ouvrez Deals Butler dans l'application de bureau pour la partager." },
    firstSend: { title: "Envoyé à l'appli", message: "Votre premier envoi a fonctionné. Ouvrez l'application de bureau pour le vérifier et le publier." },
    firstList: { title: "Enregistré dans une liste", message: "C'est votre première liste enregistrée. Ouvrez vos listes dans la fenêtre de l'extension pour les partager ou les envoyer." },
  },
};

export function milestoneCopy(locale: string): Dict {
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}

let toastedThisPage = false;

export async function noteMilestone(id: MilestoneId): Promise<void> {
  try {
    const now = Date.now();
    // Lazy seed for installs that never ran the background seeding: everything done
    // before today is marked silently, except the milestone being reached right now.
    const state = await ensureMilestonesSeeded(now, id);
    const result = applyMilestone(state, id, now);
    if (!result.celebrate) return;
    await saveMilestones(result.state);
    if (toastedThisPage) return;
    toastedThisPage = true;
    const dict = milestoneCopy(String(getLocale()));
    const copy = dict.byId[id];
    showToast({ title: copy.title, message: copy.message, closeLabel: dict.close });
  } catch {
    // never let a celebration break the action
  }
}
