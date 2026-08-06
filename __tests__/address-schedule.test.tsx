import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddressSchedule } from "../src/app/address-schedule";
import { LanguageProvider } from "../src/lib/i18n/language-provider";
import type { SuburbSearchResult } from "../src/components/address-search";
import {
  ADDRESS_CACHE_KEY,
  ADDRESS_CACHE_VERSION,
} from "../src/lib/schedule/address-cache";
import { expectNoA11yViolations } from "./helpers/a11y";

// collectionWeekday: 1 (Monday) matches GLASS_WEEK_MONDAY below, so today
// already IS this address's confirmed collection day in every test here.
const SUBURBAN_ADDRESS: SuburbSearchResult = {
  id: 10,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
  collectionWeekday: 1,
};
const INNER_CITY_ADDRESS: SuburbSearchResult = {
  id: 20,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
  collectionWeekday: null,
};

// Monday 2026-01-12 UTC = a confirmed "glass" week (rules.ts, ADR 0042).
// Mid-UTC-day so the viewer's local (Pacific/Auckland, ADR 0017) calendar
// date is also 2026-01-12 — matches schedule-display.test.tsx's fixture.
const GLASS_WEEK_MONDAY = new Date(Date.UTC(2026, 0, 12, 1));

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

// Same fixture as push-subscription-toggle.test.tsx: 65 raw bytes,
// base64url-encoded — the exact length parseVapidPublicKey requires.
const VALID_VAPID_KEY =
  "BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-P0A";

function stubPushEnvironment() {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue({
      endpoint: "https://push.example/abc",
      toJSON: () => ({
        endpoint: "https://push.example/abc",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }),
  };
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal("Notification", { permission: "default" });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_VAPID_KEY);
  return { pushManager };
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
  vi.unstubAllEnvs();
  // @ts-expect-error jsdom has no serviceWorker by default; drop the stub.
  delete navigator.serviceWorker;
  window.localStorage.clear();
});

describe("AddressSchedule", () => {
  test("baseline: fresh mount with nothing cached shows the no-address prompt", () => {
    renderComposed();
    expect(
      screen.getByText(
        "Search for your address above to see your next collection.",
      ),
    ).toBeInTheDocument();
  });

  test("no address selected: does not render the push subscription toggle", () => {
    renderComposed();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  test("a cleared/never-selected address after a corrupt cache read also does not render the toggle", () => {
    window.localStorage.setItem(ADDRESS_CACHE_KEY, "{not valid json");
    renderComposed();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
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
      screen.getByRole("heading", { level: 2, name: "Your next collection" }),
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

  test("selecting an address renders the push subscription toggle and wires its id into the subscribe POST", async () => {
    const { pushManager } = stubPushEnvironment();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = input.toString();
      if (url.includes("/api/suburbs/search")) {
        return Promise.resolve(jsonResponse({ results: [SUBURBAN_ADDRESS] }));
      }
      if (url === "/api/notifications/subscribe") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      // ShiftAlertBanner also fetches this once an address is selected
      // (address-schedule.tsx composes it alongside ScheduleDisplay); an
      // empty result list keeps its effect resolving cleanly without
      // affecting any assertion this test makes.
      if (url === "/api/holidays") {
        return Promise.resolve(jsonResponse({ results: [] }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderComposed();
    await typeAndSettle("Karori");
    selectFirstOption();

    // IMPORTANT: this test file runs under vi.useFakeTimers() (top-level
    // beforeEach, for GLASS_WEEK_MONDAY). PushSubscriptionToggle's mount
    // effect resolves via plain Promises, not setTimeout, but Testing
    // Library's waitFor/findBy* poll via setTimeout internally — under fake
    // timers that polling never fires on its own. The a11y test below hits
    // this exact problem with axe's internal async work and works around it
    // the same way: switch back to real timers once the timer-dependent
    // part of the flow (the address-search debounce) is done, before
    // waiting on anything push-related.
    vi.useRealTimers();

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).not.toBeDisabled());

    fireEvent.click(toggle);

    await waitFor(() => expect(pushManager.subscribe).toHaveBeenCalledTimes(1));
    const subscribeCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/notifications/subscribe",
    );
    expect(subscribeCall).toBeDefined();
    const [, init] = subscribeCall as [string, RequestInit];
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.addressId).toBe(SUBURBAN_ADDRESS.id);
  });

  test("a previously cached address renders its schedule on a fresh mount, with no network call needed for the schedule itself (offline acceptance criterion)", () => {
    seedCachedAddress(SUBURBAN_ADDRESS);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    renderComposed();

    expect(
      screen.getByRole("heading", { level: 2, name: "Your next collection" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);
    // NFR-02's guarantee (ADR 0052) is that ScheduleDisplay's own render
    // never depends on a network call — it doesn't extend to ShiftAlertBanner
    // (issue #83), a separate proactive-enhancement component composed
    // alongside it that fetches GET /api/holidays regardless of whether
    // `address` arrived via a fresh selection or cache restore. Offline,
    // that fetch rejects and the banner degrades gracefully (its own test
    // suite covers that); the schedule above renders correctly either way,
    // and no redundant address lookup happens for the already-cached address.
    expect(fetchMock).toHaveBeenCalledWith("/api/holidays", expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/suburbs/search"),
      expect.anything(),
    );
  });

  test("a corrupt (non-JSON) cached payload degrades to the no-address prompt, not a crash", () => {
    window.localStorage.setItem(ADDRESS_CACHE_KEY, "{not valid json");

    expect(() => renderComposed()).not.toThrow();
    expect(
      screen.getByText(
        "Search for your address above to see your next collection.",
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
        "Search for your address above to see your next collection.",
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
    // jsdom has no serviceWorker/PushManager/Notification by default (no
    // stubPushEnvironment() call here), so the toggle settles to
    // "unsupported" — wait for that before scanning, same reasoning as
    // push-subscription-toggle.test.tsx's own a11y test.
    await screen.findByText(
      "Push notifications aren't supported in this browser.",
    );
    await expectNoA11yViolations(cached.container);
  });
});
