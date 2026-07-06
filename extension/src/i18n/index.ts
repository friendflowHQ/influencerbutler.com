import { CATALOG, type Dict, type Locale } from "./catalog";

// Runtime locale for the current context (popup or content script are separate
// bundles, each with its own module state). Defaults to English so pure code
// and tests that never call setLocale still get stable English strings.
//
// "auto" resolves from the browser UI language via chrome.i18n.getUILanguage;
// a user override ("en" | "es" | "fr") in the popup wins over that.

export type LocaleSetting = "auto" | Locale;

let current: Locale = "en";

export function normalizeLocale(lang: string): Locale {
  const base = (lang || "").toLowerCase().split("-")[0];
  return base === "es" ? "es" : base === "fr" ? "fr" : "en";
}

export function resolveLocale(setting: LocaleSetting): Locale {
  if (setting === "en" || setting === "es" || setting === "fr") return setting;
  try {
    const ui = chrome?.i18n?.getUILanguage?.();
    if (ui) return normalizeLocale(ui);
  } catch {
    // chrome.i18n unavailable in this context; fall through to English
  }
  return "en";
}

export function setLocale(setting: LocaleSetting): void {
  current = resolveLocale(setting);
}

export function getLocale(): Locale {
  return current;
}

// The one accessor every UI file uses: t().someKey or t().someKey(args).
export function t(): Dict {
  return CATALOG[current];
}
