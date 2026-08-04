import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  PushSubscriptionToggle,
  parseVapidPublicKey,
} from "../../src/components/push-subscription-toggle";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { writeStoredLocale } from "../../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "../helpers/a11y";

// 65 raw bytes (0x04 uncompressed-point prefix + 64 incrementing bytes),
// base64url-encoded with no padding. Not a real EC point, but exactly the
// length parseVapidPublicKey requires — verified below before being used
// as a fixture, per the plan's own warning about a fixture that's secretly
// the wrong length making every "valid key" test pass for the wrong reason.
const VALID_KEY =
  "BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-P0A";
// 10 raw bytes, also validly base64url-encoded — the wrong-length case a
// try/catch-only implementation (no length check) would wrongly accept.
const WRONG_LENGTH_KEY = "AQIDBAUGBwgJCg";

test("VALID_KEY fixture actually decodes to exactly 65 bytes", () => {
  const decoded = parseVapidPublicKey(VALID_KEY);
  expect(decoded).not.toBeNull();
  expect(decoded?.length).toBe(65);
});

test("WRONG_LENGTH_KEY fixture decodes as valid base64 but is not 65 bytes", () => {
  expect(parseVapidPublicKey(WRONG_LENGTH_KEY)).toBeNull();
});

function fakeSubscription(endpoint = "https://push.example/abc") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

type FakeSubscription = ReturnType<typeof fakeSubscription>;

/**
 * A real PushManager's getSubscription() reflects whatever subscribe()/
 * unsubscribe() most recently did — they aren't independent mocks. This
 * models that link: `current` is the browser-level subscription state,
 * updated whenever subscribe() resolves a new one or a tracked
 * subscription's own unsubscribe() is called. Without this, a component
 * path that calls getSubscription() after subscribing (the opt-in
 * rollback) or after a prior subscribe (the opt-out flow) would see stale
 * state that a real browser never would.
 */
function stubPushEnvironment(
  opts: {
    permission?: "default" | "granted" | "denied";
    existingSubscription?: FakeSubscription | null;
    subscribeImpl?: (...args: unknown[]) => Promise<unknown>;
  } = {},
) {
  const { permission = "default", existingSubscription = null, subscribeImpl } = opts;
  let current: FakeSubscription | null = existingSubscription;

  function track(sub: FakeSubscription | null | undefined) {
    if (sub) {
      const originalUnsubscribe = sub.unsubscribe;
      sub.unsubscribe = vi.fn(async (...args: unknown[]) => {
        const result = await originalUnsubscribe(...args);
        if (current === sub) current = null;
        return result;
      });
    }
    current = sub ?? null;
  }
  track(existingSubscription);

  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn(async (...args: unknown[]) => {
      const result = subscribeImpl
        ? await subscribeImpl(...args)
        : fakeSubscription();
      track(result as FakeSubscription);
      return result;
    }),
  };
  const registration = { pushManager };
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal("Notification", { permission });
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_KEY);
  return { pushManager, registration };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

function renderToggle() {
  return render(
    <LanguageProvider>
      <PushSubscriptionToggle />
    </LanguageProvider>,
  );
}

function toggleSwitch() {
  return screen.getByRole("switch");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // @ts-expect-error jsdom has no serviceWorker by default; drop the stub.
  delete navigator.serviceWorker;
  window.localStorage.clear();
});

describe("PushSubscriptionToggle", () => {
  test("renders 'checking', disabled and unchecked, before the mount effect resolves", () => {
    stubPushEnvironment({ permission: "default" });

    renderToggle();

    const toggle = toggleSwitch();
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText("Checking your notification settings…"),
    ).toBeInTheDocument();
  });

  test("resolves to 'unsubscribed' when supported, configured, and no existing subscription", async () => {
    stubPushEnvironment({ permission: "default" });

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    const toggle = toggleSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).not.toBeDisabled();
  });

  test("resolves to 'subscribed' when an existing subscription is found", async () => {
    stubPushEnvironment({ existingSubscription: fakeSubscription() });

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(toggleSwitch()).toHaveAttribute("aria-checked", "true");
  });

  test("resolves to 'unsubscribed' when checking the initial subscription state throws", async () => {
    const { pushManager } = stubPushEnvironment({ permission: "default" });
    pushManager.getSubscription.mockRejectedValue(new Error("boom"));

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(toggleSwitch()).toHaveAttribute("aria-checked", "false");
  });

  test("resolves to 'denied' when Notification permission is denied", async () => {
    stubPushEnvironment({ permission: "denied" });

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText(
          "Notifications are blocked for this site. Allow notifications in your browser settings to receive reminders.",
        ),
      ).toBeInTheDocument(),
    );
    const toggle = toggleSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toBeDisabled();
  });

  test("resolves to 'unsupported' when serviceWorker/PushManager/Notification are absent (jsdom defaults)", async () => {
    // Deliberately no stubPushEnvironment() call — jsdom has none of these.
    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("Push notifications aren't supported in this browser."),
      ).toBeInTheDocument(),
    );
    expect(toggleSwitch()).toBeDisabled();
  });

  describe("resolves to 'misconfigured'", () => {
    test.each([
      ["an empty key", ""],
      ["not valid base64url", "not-valid-base64!!"],
      ["a validly-encoded but wrong-length (10-byte) key", WRONG_LENGTH_KEY],
    ])("%s", async (_label, badKey) => {
      stubPushEnvironment();
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", badKey);

      renderToggle();

      await waitFor(() =>
        expect(
          screen.getByText("Push notifications aren't available yet."),
        ).toBeInTheDocument(),
      );
      expect(toggleSwitch()).toBeDisabled();
    });
  });

  test("happy path opt-in: subscribes, POSTs the subscription, and becomes 'subscribed'", async () => {
    const { pushManager } = stubPushEnvironment({ permission: "default" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: parseVapidPublicKey(VALID_KEY),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications/subscribe");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.endpoint).toBe("https://push.example/abc");
    expect(body.keys).toEqual({ p256dh: "p256dh-value", auth: "auth-value" });
    expect(body.languagePreference).toBe("en");
    expect(body.addressId).toBeUndefined();
    expect(toggleSwitch()).toHaveAttribute("aria-checked", "true");
  });

  test("clicking on while the VAPID key has since become invalid re-checks it and becomes 'misconfigured', without calling subscribe()", async () => {
    const { pushManager } = stubPushEnvironment({ permission: "default" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "not-valid-base64!!");
    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("Push notifications aren't available yet."),
      ).toBeInTheDocument(),
    );
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toggleSwitch()).toBeDisabled();
  });

  test("opt-in failure — subscribe() rejects because permission is now denied — becomes 'denied', no fetch call", async () => {
    let permission: "default" | "granted" | "denied" = "default";
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn(() => {
        // Simulate the browser having flipped permission by the time
        // subscribe() rejects.
        permission = "denied";
        return Promise.reject(new DOMException("denied", "NotAllowedError"));
      }),
    };
    const registration = { pushManager };
    vi.stubGlobal("PushManager", function () {});
    vi.stubGlobal("Notification", {
      get permission() {
        return permission;
      },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(registration) },
      configurable: true,
    });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText(
          "Notifications are blocked for this site. Allow notifications in your browser settings to receive reminders.",
        ),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("opt-in failure — subscribe() succeeds but the POST fails — rolls back the subscription, reverts to unsubscribed", async () => {
    const subscription = fakeSubscription();
    stubPushEnvironment({
      permission: "default",
      subscribeImpl: () => Promise.resolve(subscription),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't turn on reminders. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    const toggle = toggleSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).not.toBeDisabled();
  });

  test("happy path opt-out: unsubscribes, DELETEs the subscription, and becomes 'unsubscribed'", async () => {
    const subscription = fakeSubscription();
    stubPushEnvironment({ existingSubscription: subscription });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications/subscribe");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({
      endpoint: "https://push.example/abc",
    });
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("opt-out when the browser-level subscription is already gone: becomes 'unsubscribed' without a DELETE call", async () => {
    // Renders already "subscribed" (component state), but the mocked
    // PushManager reports no subscription when asked — a real drift
    // scenario (e.g. unsubscribed from another tab/browser UI). The
    // component must not call DELETE for an endpoint it no longer has.
    const { pushManager } = stubPushEnvironment({
      existingSubscription: fakeSubscription(),
    });
    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    pushManager.getSubscription.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toggleSwitch()).toHaveAttribute("aria-checked", "false");
  });

  test("opt-out failure — DELETE fails — leaves the browser subscription intact, reverts to subscribed", async () => {
    const subscription = fakeSubscription();
    stubPushEnvironment({ existingSubscription: subscription });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't turn off reminders. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    const toggle = toggleSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("retry after a failed opt-in succeeds cleanly, without accumulating calls from the failed attempt", async () => {
    const subscription = fakeSubscription();
    const { pushManager } = stubPushEnvironment({
      permission: "default",
      subscribeImpl: () => Promise.resolve(subscription),
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());
    await waitFor(() =>
      expect(
        screen.getByText("We couldn't turn on reminders. Please try again."),
      ).toBeInTheDocument(),
    );

    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    fireEvent.click(toggleSwitch());

    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    expect(pushManager.subscribe).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("full subscribe/unsubscribe/subscribe cycle ends 'subscribed' with exactly the expected call counts", async () => {
    const subscription = fakeSubscription();
    const { pushManager } = stubPushEnvironment({
      permission: "default",
      subscribeImpl: () => Promise.resolve(subscription),
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderToggle();
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());
    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());
    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(toggleSwitch());
    await waitFor(() =>
      expect(
        screen.getByText("You're receiving night-before reminders."),
      ).toBeInTheDocument(),
    );

    expect(pushManager.subscribe).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual([
      "POST",
      "DELETE",
      "POST",
    ]);
    expect(toggleSwitch()).toHaveAttribute("aria-checked", "true");
  });

  test("passes the accessibility audit", async () => {
    stubPushEnvironment({ permission: "default" });
    const view = renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("You're not receiving night-before reminders."),
      ).toBeInTheDocument(),
    );
    await expectNoA11yViolations(view.container);
  });

  test("renders the Māori status text when the stored locale is 'mi'", async () => {
    stubPushEnvironment({ existingSubscription: fakeSubscription() });
    writeStoredLocale("mi");

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText(
          "Kei te whiwhi koe i ngā whakamahara pō-i-mua i te kohinga.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
