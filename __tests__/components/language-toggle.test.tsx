import { afterEach, beforeEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { LanguageToggle } from "../../src/components/language-toggle";
import { LOCALE_STORAGE_KEY } from "../../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "../helpers/a11y";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

function renderToggle() {
  return render(
    <LanguageProvider>
      <LanguageToggle />
    </LanguageProvider>,
  );
}

test("defaults to English checked, with an English group label", () => {
  renderToggle();
  expect(
    screen.getByRole("radiogroup", { name: "Choose language" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(
    screen.getByRole("radio", { name: "Te Reo Māori" }),
  ).toHaveAttribute("aria-checked", "false");
});

test("both radio items carry the shared touch-target and focus-ring classes and no per-component focus: utilities (ADR 0020)", () => {
  renderToggle();
  for (const name of ["English", "Te Reo Māori"]) {
    const item = screen.getByRole("radio", { name });
    expect(item.className).toContain("touch-target");
    expect(item.className).toContain("focus-ring");
    // Focus styling comes only from the shared .focus-ring class; a
    // `focus:`-prefixed utility would gate styling on plain :focus (the
    // mouse-click-ring bug #15 fixed). Behavioural assertions against the
    // real stylesheet: __tests__/a11y/focus-and-touch-targets.test.tsx.
    expect(item.className).not.toMatch(/focus:/);
  }
});

test("selecting Te Reo Māori switches, persists, and relabels the group", () => {
  renderToggle();
  act(() => screen.getByRole("radio", { name: "Te Reo Māori" }).click());
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("mi");
  expect(
    screen.getByRole("radio", { name: "Te Reo Māori" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(
    screen.getByRole("radiogroup", { name: "Kōwhiria te reo" }),
  ).toBeInTheDocument();
});

test("clicking the already-selected language repeatedly leaves it selected", () => {
  renderToggle();
  const en = screen.getByRole("radio", { name: "English" });
  act(() => en.click());
  act(() => en.click());
  act(() => en.click());
  expect(en).toHaveAttribute("aria-checked", "true");
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
});

test("toggling there and back leaves exactly one item checked at every step", () => {
  renderToggle();
  const en = screen.getByRole("radio", { name: "English" });
  const mi = screen.getByRole("radio", { name: "Te Reo Māori" });
  act(() => mi.click());
  expect(mi).toHaveAttribute("aria-checked", "true");
  expect(en).toHaveAttribute("aria-checked", "false");
  act(() => en.click());
  expect(en).toHaveAttribute("aria-checked", "true");
  expect(mi).toHaveAttribute("aria-checked", "false");
  act(() => mi.click());
  expect(mi).toHaveAttribute("aria-checked", "true");
  expect(en).toHaveAttribute("aria-checked", "false");
});

test("passes the accessibility audit in both English and Te Reo states", async () => {
  const { container } = renderToggle();
  await expectNoA11yViolations(container);
  act(() => screen.getByRole("radio", { name: "Te Reo Māori" }).click());
  await expectNoA11yViolations(container);
});

test("ArrowRight moves focus to and selects the next item", async () => {
  renderToggle();
  const en = screen.getByRole("radio", { name: "English" });
  const mi = screen.getByRole("radio", { name: "Te Reo Māori" });
  act(() => en.focus());
  /* Radix's roving-focus group schedules the actual DOM focus move via
     setTimeout, so the selection this causes (RadioGroup's onFocus-after-
     arrow-key handler) lands a tick later too. */
  await act(async () => {
    fireEvent.keyDown(en, { key: "ArrowRight" });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(document.activeElement).toBe(mi);
  expect(mi).toHaveAttribute("aria-checked", "true");
  expect(en).toHaveAttribute("aria-checked", "false");
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("mi");
});

test("each item's own name is marked with its own language", () => {
  renderToggle();
  expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute(
    "lang",
    "en",
  );
  expect(
    screen.getByRole("radio", { name: "Te Reo Māori" }),
  ).toHaveAttribute("lang", "mi");
});

test("announces the destination language's own changed-message on toggle, through a polite, visually-hidden live region", () => {
  renderToggle();
  act(() => screen.getByRole("radio", { name: "Te Reo Māori" }).click());
  const announcement = screen.getByText("Kua huri te reo ki te reo Māori.");
  expect(announcement).toHaveAttribute("aria-live", "polite");
  expect(announcement.className).toContain("sr-only");
});

test("announces English's own changed-message when toggling back", () => {
  renderToggle();
  act(() => screen.getByRole("radio", { name: "Te Reo Māori" }).click());
  act(() => screen.getByRole("radio", { name: "English" }).click());
  const announcement = screen.getByText("Language changed to English.");
  expect(announcement).toHaveAttribute("aria-live", "polite");
  expect(announcement.className).toContain("sr-only");
  expect(
    screen.queryByText("Kua huri te reo ki te reo Māori."),
  ).not.toBeInTheDocument();
});

test("announces nothing on mount, but the live region is already mounted so a later change is announced", () => {
  const { container } = renderToggle();
  const liveRegion = container.querySelector("[aria-live]");
  expect(liveRegion).not.toBeNull();
  expect(liveRegion).toHaveAttribute("aria-live", "polite");
  expect(liveRegion?.className).toContain("sr-only");
  expect(liveRegion?.textContent).toBe("");
});

test("clicking the already-selected language repeatedly does not (re-)announce", () => {
  const { container } = renderToggle();
  const en = screen.getByRole("radio", { name: "English" });
  act(() => en.click());
  act(() => en.click());
  act(() => en.click());
  expect(container.querySelector("[aria-live]")?.textContent).toBe("");
});

test("toggling there and back three times leaves exactly the latest announcement visible", () => {
  renderToggle();
  const en = screen.getByRole("radio", { name: "English" });
  const mi = screen.getByRole("radio", { name: "Te Reo Māori" });
  act(() => mi.click());
  act(() => en.click());
  act(() => mi.click());
  expect(
    screen.getByText("Kua huri te reo ki te reo Māori."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Language changed to English."),
  ).not.toBeInTheDocument();
});
