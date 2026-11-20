import { getLocale } from "../i18n";

// Copy for the popup's "Pause on this site" row. Kept out of the shared catalog
// (same pattern as tools/tour). No em dashes (repo rule).
type PauseDict = { label: (host: string) => string; hint: string; pausedStatus: string };

const EN: PauseDict = {
  label: (host) => `Pause on ${host}`,
  hint: "Influencer Butler is off on this site. Untick to turn it back on.",
  pausedStatus: "Paused on this site.",
};
const ES: PauseDict = {
  label: (host) => `Pausar en ${host}`,
  hint: "Influencer Butler está desactivado en este sitio. Desmarca para volver a activarlo.",
  pausedStatus: "En pausa en este sitio.",
};
const FR: PauseDict = {
  label: (host) => `Mettre en pause sur ${host}`,
  hint: "Influencer Butler est désactivé sur ce site. Décochez pour le réactiver.",
  pausedStatus: "En pause sur ce site.",
};

export function pauseStrings(): PauseDict {
  const locale = String(getLocale());
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}
