// @vitest-environment node
/* public/sw.js is a plain global-scope service-worker script with no module
   exports, so it cannot be imported. It's executed inside a fabricated
   self/caches/fetch sandbox via node:vm — the same technique used to unit
   test any global-scope browser script without a real browser — and the
   listeners it registers via self.addEventListener are captured for direct
   invocation. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, test, vi } from "vitest";

const swSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf-8");

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

function keyFor(request: { url: string } | string): string {
  // sw.js calls caches.match("/") with a bare pathname (no origin to resolve
  // against) and caches.match(request) with a full Request-like object.
  if (typeof request === "string") return request;
  return new URL(request.url).pathname;
}

function createFakeCaches(existingCacheNames: string[] = []) {
  const stores = new Map<string, Map<string, unknown>>();
  for (const name of existingCacheNames) stores.set(name, new Map());

  return {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async addAll(urls: string[]) {
          for (const url of urls) store.set(url, { __cached: url });
        },
        async match(request: { url: string } | string) {
          return store.get(keyFor(request));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: { url: string } | string) {
      const key = keyFor(request);
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key);
      }
      return undefined;
    },
  };
}

type FakeCaches = ReturnType<typeof createFakeCaches>;

function createContext(options: {
  fetchImpl?: (...args: unknown[]) => Promise<unknown>;
  cacheNames?: string[];
} = {}) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const caches = createFakeCaches(options.cacheNames);
  const deleteSpy = vi.fn(caches.delete.bind(caches));
  (caches as FakeCaches & { delete: typeof deleteSpy }).delete = deleteSpy;

  const selfObj = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      listeners[type] = handler;
    },
    location: { origin: "https://example.test" },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const fetchImpl = options.fetchImpl ?? vi.fn();
  const sandbox = { self: selfObj, caches, fetch: fetchImpl, URL, Promise, console };
  vm.createContext(sandbox);
  vm.runInContext(swSource, sandbox);

  return { listeners, caches, self: selfObj, fetchImpl, deleteSpy };
}

function makeLifecycleEvent() {
  let promise: Promise<unknown> | undefined;
  const event = {
    waitUntil(p: Promise<unknown>) {
      promise = p;
    },
  };
  return { event, getPromise: () => promise };
}

function makeFetchEvent(request: {
  method: string;
  mode?: string;
  url: string;
}) {
  let promise: Promise<unknown> | undefined;
  const event = {
    request,
    respondWith(p: Promise<unknown>) {
      promise = p;
    },
  };
  return { event, getResponsePromise: () => promise };
}

describe("install", () => {
  test("precaches exactly the five stable shell assets into tkp-shell-v1", async () => {
    const { listeners, caches } = createContext();
    const { event, getPromise } = makeLifecycleEvent();

    listeners.install(event);
    await getPromise();

    const store = caches.stores.get("tkp-shell-v1");
    expect(store).toBeDefined();
    expect([...store!.keys()]).toEqual(PRECACHE_URLS);
  });

  test("run twice yields the identical precache list both times", async () => {
    const { listeners, caches } = createContext();

    const runInstall = async () => {
      const { event, getPromise } = makeLifecycleEvent();
      listeners.install(event);
      await getPromise();
      return [...caches.stores.get("tkp-shell-v1")!.keys()];
    };

    const first = await runInstall();
    const second = await runInstall();
    expect(second).toEqual(first);
    expect(second).toEqual(PRECACHE_URLS);
  });
});

describe("activate", () => {
  test("deletes only the stale tkp-shell-* cache, never the current version or an unrelated cache", async () => {
    const { listeners, deleteSpy } = createContext({
      cacheNames: ["tkp-shell-v1", "tkp-shell-v0", "some-other-cache"],
    });
    const { event, getPromise } = makeLifecycleEvent();

    listeners.activate(event);
    await getPromise();

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith("tkp-shell-v0");
  });
});

describe("fetch", () => {
  test("navigation requests are network-first, resolving to the network response while online", async () => {
    const networkResponse = { __from: "network" };
    const fetchImpl = vi.fn().mockResolvedValue(networkResponse);
    const { listeners } = createContext({ fetchImpl });
    const request = { method: "GET", mode: "navigate", url: "https://example.test/" };
    const { event, getResponsePromise } = makeFetchEvent(request);

    listeners.fetch(event);

    expect(await getResponsePromise()).toBe(networkResponse);
    expect(fetchImpl).toHaveBeenCalledWith(request);
  });

  test("navigation falls back to the cached shell when the network fetch rejects (offline)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const { listeners, caches } = createContext({ fetchImpl });

    const install = makeLifecycleEvent();
    listeners.install(install.event);
    await install.getPromise();
    void caches;

    const request = { method: "GET", mode: "navigate", url: "https://example.test/" };
    const { event, getResponsePromise } = makeFetchEvent(request);
    listeners.fetch(event);

    expect(await getResponsePromise()).toEqual({ __cached: "/" });
  });

  test("a precached shell asset resolves from the cache and never calls the network", async () => {
    const fetchImpl = vi.fn();
    const { listeners } = createContext({ fetchImpl });

    const install = makeLifecycleEvent();
    listeners.install(install.event);
    await install.getPromise();

    const request = {
      method: "GET",
      mode: "same-origin",
      url: "https://example.test/icons/icon.svg",
    };
    const { event, getResponsePromise } = makeFetchEvent(request);
    listeners.fetch(event);

    expect(await getResponsePromise()).toEqual({ __cached: "/icons/icon.svg" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a shell asset not yet cached falls back to the network", async () => {
    const networkResponse = { __from: "network" };
    const fetchImpl = vi.fn().mockResolvedValue(networkResponse);
    const { listeners } = createContext({ fetchImpl });

    const request = {
      method: "GET",
      mode: "same-origin",
      url: "https://example.test/icons/icon.svg",
    };
    const { event, getResponsePromise } = makeFetchEvent(request);
    listeners.fetch(event);

    expect(await getResponsePromise()).toBe(networkResponse);
  });

  test("non-GET requests are left untouched", () => {
    const { listeners } = createContext();
    const request = {
      method: "POST",
      mode: "same-origin",
      url: "https://example.test/icons/icon.svg",
    };
    const { event, getResponsePromise } = makeFetchEvent(request);

    listeners.fetch(event);

    expect(getResponsePromise()).toBeUndefined();
  });

  test("cross-origin requests are left untouched", () => {
    const { listeners } = createContext();
    const request = {
      method: "GET",
      mode: "cors",
      url: "https://other.test/icons/icon.svg",
    };
    const { event, getResponsePromise } = makeFetchEvent(request);

    listeners.fetch(event);

    expect(getResponsePromise()).toBeUndefined();
  });

  test("a same-origin GET outside the precache list (an API route) is never intercepted", () => {
    const { listeners } = createContext();
    const request = {
      method: "GET",
      mode: "same-origin",
      url: "https://example.test/api/holidays",
    };
    const { event, getResponsePromise } = makeFetchEvent(request);

    listeners.fetch(event);

    expect(getResponsePromise()).toBeUndefined();
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
