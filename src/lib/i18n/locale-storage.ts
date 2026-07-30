import { DEFAULT_LOCALE, isLocale, type Locale } from "./dictionaries";

export const LOCALE_STORAGE_KEY = "tkp.locale";
const LOCALE_CHANGE_EVENT = "tkp:locale-change";

export function readStoredLocale(): Locale {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* Private mode / quota: the in-memory locale still changes. */
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

export function subscribeToLocale(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
  };
}

export function getServerLocale(): Locale {
  return DEFAULT_LOCALE;
}
