"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  dictionaries,
  type Locale,
  type TranslationKey,
} from "./dictionaries";
import {
  getServerLocale,
  readStoredLocale,
  subscribeToLocale,
  writeStoredLocale,
} from "./locale-storage";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    readStoredLocale,
    getServerLocale,
  );

  /* Mirror the locale onto <html lang> so screen readers pick the right voice.
     This is a DOM write, not a setState, so react-hooks/set-state-in-effect
     does not apply. */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: writeStoredLocale,
      t: (key) => dictionaries[locale][key],
    }),
    [locale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (value === null) {
    throw new Error("useTranslation must be used inside a <LanguageProvider>.");
  }
  return value;
}
