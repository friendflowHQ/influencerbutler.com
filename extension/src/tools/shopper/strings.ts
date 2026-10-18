import type { FormatId, Generation, Confidence } from "../../shared/shopper-generation";

// Copy for the "Who buys this" product-panel section, per locale. Kept local
// (like the deal-signals promo strings) so the feature ships as one unit.
// No em-dashes in any value (the build guard enforces it).
export type ShopperStrings = {
  title: string;
  info: string;
  gen: Record<Generation, string>;
  confidence: Record<Confidence, string>;
  format: Record<FormatId, string>;
  makeThis: (format: string, length: string, platforms: string) => string;
  why: Record<Generation, string>;
  tuned: string;
  platform: Record<string, string>;
};

const PLATFORMS_EN = { youtube: "YouTube", facebook: "Facebook", amazon: "Amazon", tiktok: "TikTok", instagram: "Instagram", pinterest: "Pinterest" };

export const SHOPPER_STRINGS: Record<"en" | "es" | "fr", ShopperStrings> = {
  en: {
    title: "Who buys this",
    info: "Our estimate of which generation mostly buys this, from its category, price and reviews. Amazon doesn't share buyer ages, so treat it as a guide.",
    gen: { boomer: "Boomers", genx: "Gen X", millennial: "Millennials", genz: "Gen Z" },
    confidence: { low: "Rough guess", medium: "Likely", high: "Strong signal" },
    format: {
      "long-demo-video": "Long demo video",
      "short-vertical-video": "Short vertical video",
      "aesthetic-photo": "Aesthetic photo",
      "idea-list": "Idea list",
      "facebook-post": "Facebook post",
    },
    makeThis: (format, length, platforms) => `Make this: ${format}${length ? ` (${length})` : ""} for ${platforms}`,
    why: {
      boomer: "These shoppers watch the whole demo and read reviews before buying. Show it working start to finish and answer the durability questions.",
      genx: "Practical, research-driven shoppers. Show the problem it solves and be honest about the trade-offs.",
      millennial: "Show it in a real routine and lead with the value and time saved.",
      genz: "Hook them in the first second. Visual payoff first, keep it fast and authentic.",
    },
    tuned: "Tuned to your audience, from the profile you set in the Influencer Butler app.",
    platform: PLATFORMS_EN,
  },
  es: {
    title: "Quién lo compra",
    info: "Nuestra estimación de qué generación compra más este producto, según su categoría, precio y reseñas. Amazon no comparte la edad de los compradores, así que tómalo como una guía.",
    gen: { boomer: "Boomers", genx: "Generación X", millennial: "Millennials", genz: "Generación Z" },
    confidence: { low: "Estimación aproximada", medium: "Probable", high: "Señal fuerte" },
    format: {
      "long-demo-video": "Vídeo demo largo",
      "short-vertical-video": "Vídeo vertical corto",
      "aesthetic-photo": "Foto estética",
      "idea-list": "Lista de ideas",
      "facebook-post": "Publicación de Facebook",
    },
    makeThis: (format, length, platforms) => `Haz esto: ${format}${length ? ` (${length})` : ""} para ${platforms}`,
    why: {
      boomer: "Estos compradores ven la demo completa y leen reseñas antes de comprar. Muéstralo funcionando de principio a fin y responde a las dudas sobre durabilidad.",
      genx: "Compradores prácticos que se informan. Muestra el problema que resuelve y sé honesto con sus pros y contras.",
      millennial: "Muéstralo en una rutina real y destaca el valor y el tiempo que ahorra.",
      genz: "Engánchalos en el primer segundo. Primero el resultado visual, rápido y auténtico.",
    },
    tuned: "Ajustado a tu audiencia, según el perfil que configuraste en la app Influencer Butler.",
    platform: PLATFORMS_EN,
  },
  fr: {
    title: "Qui achète ce produit",
    info: "Notre estimation de la génération qui achète le plus ce produit, d'après sa catégorie, son prix et ses avis. Amazon ne partage pas l'âge des acheteurs : c'est donc une indication.",
    gen: { boomer: "Boomers", genx: "Génération X", millennial: "Millennials", genz: "Génération Z" },
    confidence: { low: "Estimation approximative", medium: "Probable", high: "Signal fort" },
    format: {
      "long-demo-video": "Longue vidéo démo",
      "short-vertical-video": "Courte vidéo verticale",
      "aesthetic-photo": "Photo esthétique",
      "idea-list": "Liste d'idées",
      "facebook-post": "Publication Facebook",
    },
    makeThis: (format, length, platforms) => `À faire : ${format}${length ? ` (${length})` : ""} pour ${platforms}`,
    why: {
      boomer: "Ces acheteurs regardent la démo en entier et lisent les avis avant d'acheter. Montrez le produit en action du début à la fin et répondez aux questions de durabilité.",
      genx: "Des acheteurs pragmatiques qui se renseignent. Montrez le problème résolu et soyez honnête sur les compromis.",
      millennial: "Montrez-le dans une vraie routine et mettez en avant la valeur et le temps gagné.",
      genz: "Captez-les dès la première seconde. Le résultat visuel d'abord, rapide et authentique.",
    },
    tuned: "Adapté à votre audience, d'après le profil défini dans l'application Influencer Butler.",
    platform: PLATFORMS_EN,
  },
};
