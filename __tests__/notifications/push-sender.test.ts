// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import webpush from "web-push";
import { computeCollectionRuleSet, type ZoneClassification } from "@/lib/schedule/rules";
import { buildLocalizedPushContent } from "@/lib/notifications/payload-builder";
import { sendDispatchPayload } from "@/lib/notifications/push-sender";
import type { DispatchPayload } from "@/lib/notifications/dispatcher";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const SUBURBAN_ZONE: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
};

function buildPayload(overrides: Partial<DispatchPayload> = {}): DispatchPayload {
  return {
    subscriptionId: 42,
    endpoint: "https://push.example/one",
    p256dh: "p256dh-key",
    auth: "auth-secret",
    languagePreference: "en",
    collectionDate: "2026-01-12",
    ruleSet: computeCollectionRuleSet(SUBURBAN_ZONE, utcDate(2026, 1, 12)),
    ...overrides,
  };
}

const VALID_ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "stub-public-key",
  VAPID_PRIVATE_KEY: "stub-private-key",
  VAPID_SUBJECT: "mailto:test@example.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sendDispatchPayload", () => {
  test("success: sends the localized payload and resolves { success: true }", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", VALID_ENV.VAPID_PRIVATE_KEY);
    vi.stubEnv("VAPID_SUBJECT", VALID_ENV.VAPID_SUBJECT);
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce({} as never);

    const payload = buildPayload();
    const result = await sendDispatchPayload(payload);

    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(1);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      VALID_ENV.VAPID_SUBJECT,
      VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      VALID_ENV.VAPID_PRIVATE_KEY,
    );

    const expectedBody = JSON.stringify({
      ...buildLocalizedPushContent(payload),
      collectionDate: payload.collectionDate,
    });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: payload.endpoint, keys: { p256dh: payload.p256dh, auth: payload.auth } },
      expectedBody,
    );

    expect(result).toEqual({ subscriptionId: payload.subscriptionId, success: true });
  });

  test("delivery failure: sendNotification rejecting resolves { success: false } and logs", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", VALID_ENV.VAPID_PRIVATE_KEY);
    vi.stubEnv("VAPID_SUBJECT", VALID_ENV.VAPID_SUBJECT);
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(new Error("410 Gone"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = buildPayload();
    await expect(sendDispatchPayload(payload)).resolves.toEqual({
      subscriptionId: payload.subscriptionId,
      success: false,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(String(payload.subscriptionId)),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  test("missing config (all three unset): not-configured outcome, no webpush calls, logs 'VAPID not configured'", async () => {
    vi.unstubAllEnvs();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = buildPayload();
    const result = await sendDispatchPayload(payload);

    expect(result).toEqual({ subscriptionId: payload.subscriptionId, success: false });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("VAPID not configured"));

    errorSpy.mockRestore();
  });

  test("partially missing config (VAPID_SUBJECT unset): identical not-configured behavior", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", VALID_ENV.VAPID_PRIVATE_KEY);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = buildPayload();
    const result = await sendDispatchPayload(payload);

    expect(result).toEqual({ subscriptionId: payload.subscriptionId, success: false });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("VAPID not configured"));

    errorSpy.mockRestore();
  });

  test("invalid-format config: setVapidDetails throwing resolves { success: false }, sendNotification never called", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", VALID_ENV.VAPID_PRIVATE_KEY);
    vi.stubEnv("VAPID_SUBJECT", "not-a-uri");
    vi.mocked(webpush.setVapidDetails).mockImplementationOnce(() => {
      throw new Error("Vapid subject is not a url or mailto url.");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = buildPayload();
    const result = await sendDispatchPayload(payload);

    expect(result).toEqual({ subscriptionId: payload.subscriptionId, success: false });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("repetition/isolation: a not-configured call leaves no state affecting a later, properly-configured call", async () => {
    vi.unstubAllEnvs();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const firstPayload = buildPayload({ subscriptionId: 1 });
    const firstResult = await sendDispatchPayload(firstPayload);
    expect(firstResult).toEqual({ subscriptionId: 1, success: false });

    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VALID_ENV.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    vi.stubEnv("VAPID_PRIVATE_KEY", VALID_ENV.VAPID_PRIVATE_KEY);
    vi.stubEnv("VAPID_SUBJECT", VALID_ENV.VAPID_SUBJECT);
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce({} as never);

    const secondPayload = buildPayload({ subscriptionId: 2 });
    const secondResult = await sendDispatchPayload(secondPayload);
    expect(secondResult).toEqual({ subscriptionId: 2, success: true });

    errorSpy.mockRestore();
  });
});
