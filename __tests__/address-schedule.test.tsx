import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddressSchedule } from "../src/app/address-schedule";
import { LanguageProvider } from "../src/lib/i18n/language-provider";
import type { SuburbSearchResult } from "../src/components/address-search";
import {
  ADDRESS_CACHE_KEY,
  ADDRESS_CACHE_VERSION,
} from "../src/lib/schedule/address-cache";
import { expectNoA11yViolations } from "./helpers/a11y";

const SUBURBAN_ADDRESS: SuburbSearchResult = {
  id: 10,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
};
const INNER_CITY_ADDRESS: SuburbSearchResult = {
  id: 20,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
};

// Monday 2026-01-12 UTC = a confirmed "glass" week (rules.ts, ADR 0042).
// Mid-UTC-day so the viewer's local (Pacific/Auckland, ADR 0017) calendar
// date is also 2026-01-12 — matches schedule-display.test.tsx's fixture.
const GLASS_WEEK_MONDAY = new Date(Date.UTC(2026, 0, 12, 1));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

function seedCachedAddress(address: SuburbSearchResult) {
  window.localStorage.setItem(
    ADDRESS_CACHE_KEY,
    JSON.stringify({ version: ADDRESS_CACHE_VERSION, address }),
  );
}

function renderComposed() {
  return render(
    <LanguageProvider>
      <AddressSchedule />
    </LanguageProvider>,
  );
}

function input() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

async function typeAndSettle(value: string) {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

function selectFirstOption() {
  const option = screen.getAllByRole("option")[0];
  fireEvent.mouseDown(option);
  fireEvent.click(option);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(GLASS_WEEK_MONDAY);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AddressSchedule", () => {
  test("baseline: fresh mount with nothing cached shows the no-address prompt", () => {
    renderComposed();
    expect(
      screen.getByText(
        "Search for your address above to see today's collection.",
      ),
    ).toBeInTheDocument();
  });

  test("selecting an address renders its schedule and persists it to localStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [SUBURBAN_ADDRESS] })),
    );
    renderComposed();

    await typeAndSettle("Karori");
    selectFirstOption();

    expect(
      screen.getByRole("heading", { level: 2, name: "Today's collection" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);

    const stored = JSON.parse(
      window.localStorage.getItem(ADDRESS_CACHE_KEY) as string,
    );
    expect(stored).toEqual({
      version: ADDRESS_CACHE_VERSION,
      address: SUBURBAN_ADDRESS,
    });
  });

  test("a previously cached address renders its schedule on a fresh mount, with no network call at all (offline acceptance criterion)", () => {
    seedCachedAddress(SUBURBAN_ADDRESS);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    renderComposed();

    expect(
      screen.getByRole("heading", { level: 2, name: "Today's collection" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a corrupt (non-JSON) cached payload degrades to the no-address prompt, not a crash", () => {
    window.localStorage.setItem(ADDRESS_CACHE_KEY, "{not valid json");

    expect(() => renderComposed()).not.toThrow();
    expect(
      screen.getByText(
        "Search for your address above to see today's collection.",
      ),
    ).toBeInTheDocument();
  });

  test("a stale-version cached payload also degrades to the no-address prompt", () => {
    window.localStorage.setItem(
      ADDRESS_CACHE_KEY,
      JSON.stringify({ version: 999, address: SUBURBAN_ADDRESS }),
    );

    renderComposed();

    expect(
      screen.getByText(
        "Search for your address above to see today's collection.",
      ),
    ).toBeInTheDocument();
  });

  test("selecting a new address overwrites the previously cached one, not appends alongside it", async () => {
    seedCachedAddress(SUBURBAN_ADDRESS);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ results: [INNER_CITY_ADDRESS] })),
    );
    renderComposed();

    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);

    await typeAndSettle("Cuba");
    selectFirstOption();

    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["Yellow rubbish bag"]);

    const stored = JSON.parse(
      window.localStorage.getItem(ADDRESS_CACHE_KEY) as string,
    );
    expect(stored.address).toEqual(INNER_CITY_ADDRESS);
  });

  test("passes the accessibility audit with nothing cached and with a cached/offline address", async () => {
    // axe-core schedules its own internal async work with the real
    // setTimeout; fake timers (active in every other test via the top-level
    // beforeEach) starve that work and the audit hangs (address-search.test.tsx
    // hit the same thing) — opt back into real timers for this one.
    vi.useRealTimers();

    const empty = renderComposed();
    await expectNoA11yViolations(empty.container);
    cleanup();

    seedCachedAddress(SUBURBAN_ADDRESS);
    const cached = renderComposed();
    await expectNoA11yViolations(cached.container);
  });
});
