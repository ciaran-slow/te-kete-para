import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import RootLayout, { metadata } from "../src/app/layout";

/* next/font/google is a build-time transform: called under Vitest it throws
   "Inter is not a function", so layout.tsx cannot be imported unmocked. The
   spies must come from vi.hoisted() — vi.mock is hoisted above plain const
   declarations, so a bare `const spy = vi.fn()` would be in TDZ when the
   factory runs and fail with "Cannot access 'spy' before initialization". */
const { interOptions, jakartaOptions } = vi.hoisted(() => ({
  interOptions: vi.fn(),
  jakartaOptions: vi.fn(),
}));

/* Each stub echoes back the `variable` it was handed, exactly as the real
   transform does. Do not "simplify" this to a hardcoded "--font-inter": that
   severs the link between what layout.tsx requests and what lands on <html>,
   so renaming the variable to one globals.css does not reference would pass
   every test here while macrons fell back to a system font in production. */
type FontOptions = { variable: string };

vi.mock("next/font/google", () => ({
  Inter: (options: FontOptions) => {
    interOptions(options);
    return { variable: options.variable };
  },
  Plus_Jakarta_Sans: (options: FontOptions) => {
    jakartaOptions(options);
    return { variable: options.variable };
  },
}));

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

test("the document language is English so screen readers pick a voice", () => {
  render(<RootLayout><span>tamariki</span></RootLayout>);
  expect(document.documentElement.lang).toBe("en");
});

test("both font variables reach <html> so macrons render from the primary faces", () => {
  render(<RootLayout><span>tamariki</span></RootLayout>);
  expect(document.documentElement.className).toContain("--font-inter");
  expect(document.documentElement.className).toContain(
    "--font-plus-jakarta-sans",
  );
});

test("both fonts request the latin-ext subset (FR-01, ADR 0005)", () => {
  for (const spy of [interOptions, jakartaOptions]) {
    expect(spy.mock.calls[0][0]).toMatchObject({
      subsets: ["latin", "latin-ext"],
      display: "swap",
    });
  }
});

test("the layout renders its children", () => {
  const { container } = render(<RootLayout><span>tamariki</span></RootLayout>);
  expect(container.textContent).toContain("tamariki");
});

test("metadata carries the product name and a bilingual description", () => {
  expect(metadata.title).toBe("Te Kete Para");
  expect(metadata.description).toContain("Te Whanganui-a-Tara");
});

test("a stored Te Reo preference reaches <html lang> so screen readers switch voice", () => {
  window.localStorage.setItem("tkp.locale", "mi");
  render(<RootLayout><span>tamariki</span></RootLayout>);
  expect(document.documentElement.lang).toBe("mi");
});
