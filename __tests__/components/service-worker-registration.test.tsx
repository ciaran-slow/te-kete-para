import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ServiceWorkerRegistration } from "../../src/components/service-worker-registration";

function stubServiceWorker(register: (...args: unknown[]) => Promise<unknown>) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error jsdom has no serviceWorker by default; drop the stub.
  delete navigator.serviceWorker;
});

test("registers /sw.js at the root scope exactly once when the browser supports it", () => {
  const register = vi.fn().mockResolvedValue(undefined);
  stubServiceWorker(register);

  render(<ServiceWorkerRegistration />);

  expect(register).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
});

test("does not throw when the browser has no serviceWorker (jsdom default)", () => {
  expect("serviceWorker" in navigator).toBe(false);
  expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
});

test("a rejected registration does not throw and does not produce an unhandled rejection", async () => {
  const register = vi.fn().mockRejectedValue(new Error("blocked by extension"));
  stubServiceWorker(register);

  expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  // Flush the microtask queue so the registration promise's .catch() runs.
  await Promise.resolve();
  await Promise.resolve();
});

test("mounting a second time after unmount registers independently, without accumulating calls", () => {
  const register = vi.fn().mockResolvedValue(undefined);
  stubServiceWorker(register);

  const first = render(<ServiceWorkerRegistration />);
  expect(register).toHaveBeenCalledTimes(1);
  first.unmount();

  render(<ServiceWorkerRegistration />);
  expect(register).toHaveBeenCalledTimes(2);
});
