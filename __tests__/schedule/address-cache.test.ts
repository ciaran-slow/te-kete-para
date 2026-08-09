import { afterEach, expect, test, vi } from "vitest";
import type { SuburbSearchResult } from "../../src/components/address-search";
import {
  ADDRESS_CACHE_KEY,
  ADDRESS_CACHE_VERSION,
  getServerCachedAddressRaw,
  parseCachedAddress,
  readCachedAddressRaw,
  subscribeToCachedAddress,
  writeCachedAddress,
} from "../../src/lib/schedule/address-cache";

const ADDRESS_A: SuburbSearchResult = {
  id: 10,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
  collectionWeekday: 3,
};
const ADDRESS_B: SuburbSearchResult = {
  id: 20,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
  collectionWeekday: null,
};
// A bulk-imported street (issue #178, ADR 0075) whose CBD/night-collection
// status hasn't been confirmed yet — isInnerCityNightCollection is
// genuinely null, not a boolean. Proves the widened field still round-trips
// under the *current* ADDRESS_CACHE_VERSION (deliberately not bumped for
// this change, ADR 0075) rather than being quarantined.
const ADDRESS_UNCONFIRMED_CLASSIFICATION: SuburbSearchResult = {
  id: 30,
  streetName: "Wadestown Road",
  suburb: "Wadestown",
  zone: "zone-unconfirmed",
  isInnerCityNightCollection: null,
  recyclingCalendarGroup: null,
  collectionWeekday: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

test("the server snapshot is null, so prerendering stays static with no address selected", () => {
  expect(getServerCachedAddressRaw()).toBeNull();
});

test("readCachedAddressRaw returns null when nothing is stored", () => {
  expect(readCachedAddressRaw()).toBeNull();
});

test("a write then read/parse round-trips the exact address", () => {
  writeCachedAddress(ADDRESS_A);
  expect(parseCachedAddress(readCachedAddressRaw())).toEqual(ADDRESS_A);
});

test("two writes: the second overwrites the first, not appends alongside it", () => {
  writeCachedAddress(ADDRESS_A);
  writeCachedAddress(ADDRESS_B);

  expect(parseCachedAddress(readCachedAddressRaw())).toEqual(ADDRESS_B);
  expect(window.localStorage.getItem(ADDRESS_CACHE_KEY)).not.toBeNull();
  const stored = JSON.parse(
    window.localStorage.getItem(ADDRESS_CACHE_KEY) as string,
  );
  expect(Array.isArray(stored)).toBe(false);
  expect(stored.address).toEqual(ADDRESS_B);
});

test("three writes alternating back (A, B, A) leave exactly A cached, no drift", () => {
  writeCachedAddress(ADDRESS_A);
  writeCachedAddress(ADDRESS_B);
  writeCachedAddress(ADDRESS_A);

  expect(parseCachedAddress(readCachedAddressRaw())).toEqual(ADDRESS_A);
});

test("a payload with isInnerCityNightCollection: null (bulk-imported, unconfirmed) parses successfully under the current ADDRESS_CACHE_VERSION, not quarantined (issue #178, ADR 0075)", () => {
  writeCachedAddress(ADDRESS_UNCONFIRMED_CLASSIFICATION);
  expect(parseCachedAddress(readCachedAddressRaw())).toEqual(
    ADDRESS_UNCONFIRMED_CLASSIFICATION,
  );

  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: ADDRESS_UNCONFIRMED_CLASSIFICATION,
  });
  expect(parseCachedAddress(payload)).toEqual(ADDRESS_UNCONFIRMED_CLASSIFICATION);
});

test("parseCachedAddress(null) is null", () => {
  expect(parseCachedAddress(null)).toBeNull();
});

test("malformed JSON does not throw and parses to null", () => {
  expect(() => parseCachedAddress("{not valid json")).not.toThrow();
  expect(parseCachedAddress("{not valid json")).toBeNull();
});

test("a stale version is quarantined rather than misread", () => {
  const stalePayload = JSON.stringify({ version: 999, address: ADDRESS_A });
  expect(parseCachedAddress(stalePayload)).toBeNull();
});

test("a payload cached under the pre-recyclingCalendarGroup shape (ADDRESS_CACHE_VERSION 1) is quarantined, not misread (issue #102)", () => {
  const oldShapePayload = JSON.stringify({
    version: 1,
    address: {
      id: 10,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
    },
  });
  expect(parseCachedAddress(oldShapePayload)).toBeNull();
});

test("a current-version payload missing recyclingCalendarGroup is rejected, not just old-version payloads", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: {
      id: 10,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
    },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("recyclingCalendarGroup of 0 (or another non-1/2/null value) is rejected", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: { ...ADDRESS_A, recyclingCalendarGroup: 0 },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("a payload cached under the pre-collectionWeekday shape (ADDRESS_CACHE_VERSION 2) is quarantined, not misread (issue #134)", () => {
  const oldShapePayload = JSON.stringify({
    version: 2,
    address: {
      id: 10,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
      recyclingCalendarGroup: 1,
    },
  });
  expect(parseCachedAddress(oldShapePayload)).toBeNull();
});

test("repeated parse calls of the same version-2 (pre-collectionWeekday) payload consistently return null, not just on the first call", () => {
  const oldShapePayload = JSON.stringify({
    version: 2,
    address: {
      id: 10,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
      recyclingCalendarGroup: 1,
    },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(parseCachedAddress(oldShapePayload)).toBeNull();
  }
});

test("a current-version payload missing collectionWeekday is rejected, not just old-version payloads", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: {
      id: 10,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
      recyclingCalendarGroup: 1,
    },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("collectionWeekday of 7 (or another out-of-0-6/null value) is rejected", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: { ...ADDRESS_A, collectionWeekday: 7 },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("a payload missing required address fields is rejected", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: { id: 1, streetName: "X", suburb: "Y" },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("a payload with a wrong-typed field is rejected, not just checked for key presence", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: { ...ADDRESS_A, isInnerCityNightCollection: "true" },
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("a null address value is rejected", () => {
  const payload = JSON.stringify({
    version: ADDRESS_CACHE_VERSION,
    address: null,
  });
  expect(parseCachedAddress(payload)).toBeNull();
});

test("a top-level array (not an object) is rejected", () => {
  expect(parseCachedAddress(JSON.stringify(["not", "an", "object"]))).toBeNull();
});

test("a top-level primitive (not an object) is rejected", () => {
  expect(parseCachedAddress(JSON.stringify(42))).toBeNull();
});

test("a localStorage write that throws does not propagate", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => writeCachedAddress(ADDRESS_A)).not.toThrow();
});

test("a write that throws still notifies subscribers exactly once, though the stored value is unchanged", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  const onChange = vi.fn();
  window.addEventListener("tkp:selected-address-change", onChange);
  writeCachedAddress(ADDRESS_A);
  window.removeEventListener("tkp:selected-address-change", onChange);

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(window.localStorage.getItem(ADDRESS_CACHE_KEY)).toBeNull();
});

test("a localStorage read that throws falls back to null", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("SecurityError: storage is blocked");
  });
  expect(readCachedAddressRaw()).toBeNull();
});

test("subscribeToCachedAddress notifies on both the custom event and the native storage event, and unsubscribe stops it", () => {
  const onChange = vi.fn();
  const unsubscribe = subscribeToCachedAddress(onChange);

  window.dispatchEvent(new Event("tkp:selected-address-change"));
  expect(onChange).toHaveBeenCalledTimes(1);

  window.dispatchEvent(new Event("storage"));
  expect(onChange).toHaveBeenCalledTimes(2);

  unsubscribe();
  window.dispatchEvent(new Event("tkp:selected-address-change"));
  window.dispatchEvent(new Event("storage"));
  expect(onChange).toHaveBeenCalledTimes(2);
});
