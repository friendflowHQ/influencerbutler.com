/**
 * Contextual tip nudges for the dashboard chat bubble: a small, dismissible
 * "Need help with this page?" card that appears once per page type. Pure data
 * and lookup so it is easy to test; the bubble owns timing and dismissal.
 * Copy follows the site rules: no em dashes.
 */

export type Nudge = {
  /** Stable id used to remember dismissals. */
  id: string;
  text: string;
  /** What gets sent to the assistant when the user taps Ask. */
  question: string;
};

const NUDGES: Array<{ match: (path: string) => boolean; nudge: Nudge }> = [
  {
    match: (p) => p === "/dashboard",
    nudge: {
      id: "home-setup",
      text: "New here? I can walk you through setup one step at a time.",
      question: "I'm new. Can you set me up step by step?",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/extension"),
    nudge: {
      id: "extension",
      text: "Need help connecting the Chrome extension to the app?",
      question: "How do I connect the Chrome extension to the desktop app?",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/api-keys"),
    nudge: {
      id: "api-keys",
      text: "Stuck getting your Amazon Creator API credentials? There is a short video.",
      question: "How do I get my Amazon Creator API credentials?",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/earnings"),
    nudge: {
      id: "earnings",
      text: "Want help reading your earnings numbers?",
      question: "How are my earnings calculated and where do they come from?",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/subscription") || p.startsWith("/dashboard/billing"),
    nudge: {
      id: "plan",
      text: "Questions about your plan or billing?",
      question: "What does my plan include?",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/events"),
    nudge: {
      id: "events",
      text: "Curious how the group calls work?",
      question: "How do the group calls work and how do I join one?",
    },
  },
];

/** The tip for a dashboard path, or null when that page has none. */
export function nudgeForPath(pathname: string | null | undefined): Nudge | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  return NUDGES.find((n) => n.match(path))?.nudge ?? null;
}
