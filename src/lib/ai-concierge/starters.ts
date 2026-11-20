/**
 * Starter questions for the Butler AI chat, chosen from where the user is in
 * their journey (new, on trial, Pro, or an older free account) and their language
 * and computer. Pure function so it is easy to test; the starters route supplies
 * the facts. Copy is plain text with no em dashes.
 */

export type StarterTier = "free" | "trial" | "pro";
export type StarterInput = {
  tier: StarterTier;
  /** Days since the account was created; null when unknown. */
  ageDays: number | null;
  /** "en-US" | "es-ES" | "fr-FR" (anything else is treated as English). */
  locale?: string;
  /** "darwin" for Mac; anything else reads as a generic computer. */
  platform?: string;
};

type Copy = {
  getStarted: string;
  creatorApi: string;
  freePlan: string;
  setupCall: string;
  firstDeal: string;
  whichButlers: string;
  trialEnds: string;
  whatProAdds: string;
  paused: string;
  earnings: string;
  moveMac: string;
  moveComputer: string;
  error: string;
};

const COPY: Record<string, Copy> = {
  "en-US": {
    getStarted: "How do I get started?",
    creatorApi: "How do I connect my Amazon Creator API?",
    freePlan: "What can I do on the free plan?",
    setupCall: "Can someone walk me through setup on a call?",
    firstDeal: "How do I get my first deal posted?",
    whichButlers: "Which butlers should I turn on first?",
    trialEnds: "What happens when my trial ends?",
    whatProAdds: "What does Pro add?",
    paused: "Why did one of my butlers pause?",
    earnings: "How are my earnings looking?",
    moveMac: "How do I move to a new Mac?",
    moveComputer: "How do I move to a new computer?",
    error: "I'm seeing an error. Can you help?",
  },
  "es-ES": {
    getStarted: "¿Cómo empiezo?",
    creatorApi: "¿Cómo conecto mi API de Creadores de Amazon?",
    freePlan: "¿Qué puedo hacer con el plan gratis?",
    setupCall: "¿Alguien puede guiarme en la configuración en una llamada?",
    firstDeal: "¿Cómo publico mi primera oferta?",
    whichButlers: "¿Qué butlers debo activar primero?",
    trialEnds: "¿Qué pasa cuando termine mi prueba?",
    whatProAdds: "¿Qué añade Pro?",
    paused: "¿Por qué se pausó uno de mis butlers?",
    earnings: "¿Cómo van mis ganancias?",
    moveMac: "¿Cómo me paso a una Mac nueva?",
    moveComputer: "¿Cómo me paso a una computadora nueva?",
    error: "Veo un error. ¿Puedes ayudarme?",
  },
  "fr-FR": {
    getStarted: "Comment démarrer ?",
    creatorApi: "Comment connecter mon API Créateurs Amazon ?",
    freePlan: "Que puis-je faire avec l'offre gratuite ?",
    setupCall: "Quelqu'un peut-il me guider lors d'un appel ?",
    firstDeal: "Comment publier ma première offre ?",
    whichButlers: "Quels butlers activer en premier ?",
    trialEnds: "Que se passe-t-il à la fin de mon essai ?",
    whatProAdds: "Qu'apporte Pro ?",
    paused: "Pourquoi un de mes butlers s'est-il mis en pause ?",
    earnings: "Comment se passent mes gains ?",
    moveMac: "Comment passer à un nouveau Mac ?",
    moveComputer: "Comment passer à un nouvel ordinateur ?",
    error: "Je vois une erreur. Pouvez-vous m'aider ?",
  },
};

const NEW_ACCOUNT_DAYS = 7;

export function pickStarters(input: StarterInput): string[] {
  const c = COPY[input.locale || ""] ?? COPY["en-US"]!;
  const isNew = input.ageDays !== null && input.ageDays < NEW_ACCOUNT_DAYS;
  const move = input.platform === "darwin" ? c.moveMac : c.moveComputer;

  if (input.tier === "trial") return [c.firstDeal, c.whichButlers, c.trialEnds, c.error];
  if (input.tier === "pro") return [c.paused, c.earnings, move, c.error];
  // Free: brand-new accounts need the setup path; older free accounts need the upgrade story.
  if (isNew || input.ageDays === null) return [c.getStarted, c.creatorApi, c.freePlan, c.setupCall];
  return [c.getStarted, c.whatProAdds, move, c.error];
}
