import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { alertNightlyDispatchFailure } from "@/lib/notifications/alerting";

describe("alertNightlyDispatchFailure", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("config gap: unset webhook URL never calls fetch and warns", async () => {
    vi.unstubAllEnvs();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(alertNightlyDispatchFailure({ error: new Error("db down"), attempts: 3 })).resolves.toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DISPATCH_ALERT_WEBHOOK_URL"));

    warnSpy.mockRestore();
  });

  test("configured: posts the expected JSON payload", async () => {
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await alertNightlyDispatchFailure({ error: new Error("db down"), attempts: 3 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://alerts.example/hook");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      event: "nightly_dispatch_failed",
      message: "db down",
      attempts: 3,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
  });

  test("non-Error thrown value is stringified into message", async () => {
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await alertNightlyDispatchFailure({ error: "raw string failure", attempts: 1 });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.message).toBe("raw string failure");
  });

  test("webhook responds non-2xx: resolves without throwing and logs the status", async () => {
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(alertNightlyDispatchFailure({ error: new Error("db down"), attempts: 3 })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("500"));

    errorSpy.mockRestore();
  });

  test("webhook unreachable: resolves without throwing and logs the failure", async () => {
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(alertNightlyDispatchFailure({ error: new Error("db down"), attempts: 3 })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("repetition: independent payloads across consecutive calls", async () => {
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await alertNightlyDispatchFailure({ error: new Error("first"), attempts: 3 });
    await alertNightlyDispatchFailure({ error: new Error("second"), attempts: 1 });

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
    expect(secondBody.attempts).toBe(1);
    expect(secondBody.message).toBe("second");
  });
});
