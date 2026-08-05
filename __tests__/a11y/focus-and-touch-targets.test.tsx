import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Page from "../../src/app/page";
import { LanguageToggle } from "../../src/components/language-toggle";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import type { SuburbSearchResult } from "../../src/components/address-search";

/**
 * vision.md §3 / issue #15: every interactive element reachable by keyboard
 * shows the 3px moana focus ring with 2px offset and meets the 48x48px
 * (3rem) touch-target floor, via the shared `.focus-ring` / `.touch-target`
 * classes in src/app/globals.css (ADR 0020).
 *
 * These tests run against the REAL stylesheet: globals.css is injected into
 * jsdom, which parses its top-level rules and computes them, including
 * `:focus-visible` — jsdom's matching is discriminating (keyboard-driven
 * focus matches, mouse-driven focus does not), so the exact bug this issue
 * fixed (ring gated on plain `:focus`, showing on mouse click) is asserted
 * behaviourally here, not by class-name substrings.
 *
 * What jsdom cannot do — resolve var() to a colour, resolve rem to px, or
 * paint — is pinned in a real browser by e2e/design-tokens.spec.ts
 * ("focus ring and touch targets"). Here the ring colour is pinned as far
 * as jsdom computes it: the declaration resolves to `var(--color-moana)`
 * and the authored token value is asserted from the same file.
 */

const GLOBALS_CSS = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

const CUBA_MALL: SuburbSearchResult = {
  id: 2,
  streetName: "Cuba Mall",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};

let styleTag: HTMLStyleElement;

beforeEach(() => {
  window.localStorage.clear();
  /* Inject the real globals.css. Only the build-time `@import` is stripped
     (jsdom would try to fetch it); jsdom skips the `@theme` at-rules on its
     own. The .focus-ring/.touch-target rules are top-level in that file on
     purpose (jsdom drops @layer blocks), so they arrive here exactly as
     authored — mutating their values fails these tests. */
  styleTag = document.createElement("style");
  styleTag.textContent = GLOBALS_CSS.replace(/@import[^;]*;/g, "");
  document.head.appendChild(styleTag);
});

afterEach(() => {
  cleanup();
  styleTag.remove();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* The real pair of interactive surfaces a user tabs across on the home
   route: the header's LanguageToggle plus the page body. RootLayout's
   <html>/<body> wrapper is deliberately skipped, same as page.test.tsx —
   neither next/font mocking nor real <html> nesting is needed here. */
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

function sortingSearchInput() {
  return screen.getByLabelText("Search for a household item");
}

/* jsdom implements focus() but not the Tab key's focus traversal, so the
   traversal is reproduced from the DOM: every element a Tab press can land
   on (tabIndex >= 0, not disabled or hidden), in document order — nothing
   in this app uses a positive tabindex. Focusing a stop then hands control
   to the component's own focus handling, exactly as Tab entry does in a
   browser: Radix's roving-focus group (tabIndex 0; its radio items are -1)
   receives the entry focus and delegates it to the checked item. */
function documentTabStops(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ).filter(
    (el) =>
      el.tabIndex >= 0 && !el.hasAttribute("disabled") && !el.closest("[hidden]"),
  );
}

test("nothing is focused before any interaction", () => {
  renderHomeSurface();
  expect(document.activeElement).toBe(document.body);
});

test("tab-entry reaches the language toggle, then the address search input, then the sorting search input, and every stop shows the 3px/2px-offset keyboard ring and the 3rem touch-target floor", () => {
  renderHomeSurface();

  const stops = documentTabStops();
  const visited: HTMLElement[] = [];

  for (const stop of stops) {
    /* The keydown marks the focus that follows as keyboard-driven, which is
       what makes jsdom's :focus-visible match — same modality signal a real
       Tab press gives a browser. */
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab" });
    act(() => stop.focus());
    const focused = document.activeElement as HTMLElement;
    visited.push(focused);

    expect(focused.matches(":focus-visible")).toBe(true);
    const style = getComputedStyle(focused);
    // AC1: 3px solid ring, 2px offset, moana. jsdom leaves var()
    // unresolved; the token's authored value is pinned below and the
    // resolved rgb(0, 59, 70) in e2e/design-tokens.spec.ts.
    expect(style.outlineWidth).toBe("3px");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("var(--color-moana)");
    expect(style.outlineOffset).toBe("2px");
    // AC2: 48x48px floor — 3rem at the 16px root size.
    expect(style.minHeight).toBe("3rem");
    expect(style.minWidth).toBe("3rem");
  }

  // AC3: the traversal lands on the checked radio (via the radiogroup's
  // roving-focus delegation), then the combobox input, then the sorting
  // search input (#75, ADR 0064) — nothing skipped, nothing unreachable,
  // no focus trap in between. The sorting search's mic button is absent
  // here: jsdom has no SpeechRecognition global, so voice input is
  // feature-detected off and contributes no extra tab stop.
  expect(visited).toEqual([englishRadio(), combobox(), sortingSearchInput()]);
});

test("the ring's moana token is authored as #003b46", () => {
  // Completes the var(--color-moana) indirection asserted above as far as
  // jsdom can follow it; the browser tier asserts the resolved colour.
  expect(GLOBALS_CSS).toMatch(/--color-moana:\s*#003b46;/);
});

test("mouse-driven focus shows no ring on a language radio (the plain-:focus regression this issue fixed)", () => {
  renderHomeSurface();
  const radio = englishRadio();

  fireEvent.mouseDown(radio);
  act(() => radio.focus());

  expect(document.activeElement).toBe(radio);
  expect(radio.matches(":focus-visible")).toBe(false);
  expect(getComputedStyle(radio).outlineStyle).toBe("none");
});

test("moving focus back and forth twice keeps both shared classes on the focused element every time", () => {
  renderHomeSurface();
  const radio = englishRadio();
  const input = combobox();

  for (const element of [radio, input, radio, input]) {
    act(() => element.focus());
    expect(document.activeElement).toBe(element);
    expect(element.className).toContain("focus-ring");
    expect(element.className).toContain("touch-target");
  }
});

test("listbox option rows meet the touch-target floor but never take focus-ring", async () => {
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
  const style = getComputedStyle(option);
  expect(style.minHeight).toBe("3rem");
  expect(style.minWidth).toBe("3rem");
});
