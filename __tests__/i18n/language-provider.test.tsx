import { afterEach, beforeEach, expect, test } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider, useTranslation } from "../../src/lib/i18n/language-provider";
import { LOCALE_STORAGE_KEY } from "../../src/lib/i18n/locale-storage";

function Probe() {
  const { locale, setLocale, t } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="tagline">{t("app.tagline")}</span>
      <button onClick={() => setLocale("mi")}>mi</button>
      <button onClick={() => setLocale("en")}>en</button>
    </div>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

test("defaults to English when nothing is stored", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByTestId("locale").textContent).toBe("en");
});

test("restores a stored locale on mount", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByTestId("locale").textContent).toBe("mi");
  expect(screen.getByTestId("tagline").textContent).toBe(
    "Tiakina te taiao, kia mauria te para.",
  );
});

test("falls back to English when the stored value is not a known locale", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByTestId("locale").textContent).toBe("en");
});

test("setLocale persists and is visible to a fresh mount", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  act(() => screen.getByRole("button", { name: "mi" }).click());
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("mi");
  cleanup();
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByTestId("locale").textContent).toBe("mi");
});

test("selecting the same locale repeatedly stores exactly one value", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  const toMi = screen.getByRole("button", { name: "mi" });
  act(() => toMi.click());
  act(() => toMi.click());
  act(() => toMi.click());
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("mi");
  expect(window.localStorage.length).toBe(1);
  expect(screen.getByTestId("locale").textContent).toBe("mi");
});

test("toggling there and back leaves English stored, not a stale value", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  act(() => screen.getByRole("button", { name: "mi" }).click());
  act(() => screen.getByRole("button", { name: "en" }).click());
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  expect(screen.getByTestId("locale").textContent).toBe("en");
});

test("html lang mirrors the locale and follows every change", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(document.documentElement.lang).toBe("en");
  act(() => screen.getByRole("button", { name: "mi" }).click());
  expect(document.documentElement.lang).toBe("mi");
  act(() => screen.getByRole("button", { name: "en" }).click());
  expect(document.documentElement.lang).toBe("en");
});

test("useTranslation outside a provider throws instead of returning null", () => {
  expect(() => render(<Probe />)).toThrow(/inside a <LanguageProvider>/);
});
