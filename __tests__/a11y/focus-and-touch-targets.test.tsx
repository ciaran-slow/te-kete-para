import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Page from "../../src/app/page";
import { LanguageToggle } from "../../src/components/language-toggle";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import type { SuburbSearchResult } from "../../src/components/address-search";

/**
 * vision.md §3 / issue #15: every real interactive element carries the
 * shared `.focus-ring` / `.touch-target` classes from src/app/globals.css
 * (ADR 0020). jsdom does no layout or painting and its `:focus-visible`
 * matching does not fire even after a real `.focus()` call (same class of
 * limitation as color-contrast in __tests__/helpers/a11y.ts), so these
 * tests assert the class contract — the class is present on the focused
 * element — not the computed outline, which only a real browser (#17/#31)
 * or manual QA (#18) can verify.
 */

const CUBA_MALL: SuburbSearchResult = {
  id: 2,
  streetName: "Cuba Mall",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* The real pair of interactive surfaces a user tabs across on the home
   route: the header's LanguageToggle plus the page body. RootLayout's
   <html>/<body> wrapper is deliberately skipped, same as page.test.tsx —
   neither next/font mocking nor real <html> nesting is needed to test
   focus classes. */
function renderHomeSurface() {
  return render(
    <LanguageProvider>
      <LanguageToggle />
      <Page />
    </LanguageProvider>,
  );
}

function englishRadio() {
  return screen.getByRole("radio", { name: "English" });
}

function combobox() {
  return screen.getByRole("combobox");
}

function expectFocusedWithSharedClasses(element: HTMLElement) {
  expect(document.activeElement).toBe(element);
  expect(element.className).toContain("focus-ring");
  expect(element.className).toContain("touch-target");
}

test("nothing is focused before any interaction", () => {
  renderHomeSurface();
  expect(document.activeElement).toBe(document.body);
});

test("the checked language radio is focusable and carries focus-ring and touch-target", () => {
  renderHomeSurface();
  const radio = englishRadio();
  act(() => radio.focus());
  expectFocusedWithSharedClasses(radio);
});

test("the address search input is focusable and carries focus-ring and touch-target", () => {
  renderHomeSurface();
  const input = combobox();
  act(() => input.focus());
  expectFocusedWithSharedClasses(input);
});

test("moving focus back and forth twice keeps both classes on the focused element every time", () => {
  renderHomeSurface();
  const radio = englishRadio();
  const input = combobox();

  act(() => radio.focus());
  expectFocusedWithSharedClasses(radio);

  act(() => input.focus());
  expectFocusedWithSharedClasses(input);

  act(() => radio.focus());
  expectFocusedWithSharedClasses(radio);

  act(() => input.focus());
  expectFocusedWithSharedClasses(input);
});

test("listbox option rows get touch-target but never focus-ring", async () => {
  /* Options are never real DOM focus targets — the combobox keeps focus on
     the input and points at the active row via aria-activedescendant
     (ADR 0014) — so a focus-ring class on them would be dead, misleading
     code. */
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [CUBA_MALL] }),
    }),
  );
  renderHomeSurface();

  fireEvent.change(combobox(), { target: { value: "cuba" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  const option = screen.getByRole("option");
  expect(option.className).toContain("touch-target");
  expect(option.className).not.toContain("focus-ring");
});
