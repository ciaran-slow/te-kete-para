import { afterEach, expect, test, vi } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  getServerLocale,
  readStoredLocale,
  writeStoredLocale,
} from "../../src/lib/i18n/locale-storage";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

test("the server snapshot is the default locale, so prerendering stays static", () => {
  expect(getServerLocale()).toBe("en");
});

test("a localStorage read that throws falls back to English", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("SecurityError: storage is blocked");
  });
  expect(readStoredLocale()).toBe("en");
});

test("a localStorage write that throws does not propagate", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => writeStoredLocale("mi")).not.toThrow();
});

test("a write that throws still notifies subscribers so the UI updates", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  const onChange = vi.fn();
  window.addEventListener("tkp:locale-change", onChange);
  writeStoredLocale("mi");
  window.removeEventListener("tkp:locale-change", onChange);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
});
