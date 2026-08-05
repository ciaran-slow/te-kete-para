// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import * as dispatchRoute from "@/app/api/notifications/dispatch/route";
import { runNightlyDispatch } from "@/lib/notifications/dispatch-runner";
import { createRequestListener } from "../helpers/api";

vi.mock("@/lib/notifications/dispatch-runner", () => ({
  runNightlyDispatch: vi.fn(),
}));

const app = createRequestListener(dispatchRoute);

describe("GET /api/notifications/dispatch retry/alert wiring (ADR 0061)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.mocked(runNightlyDispatch).mockReset();
  });

  it("recovers within the retry budget", async () => {
    vi.mocked(runNightlyDispatch)
      .mockRejectedValueOnce(new Error("transient-1"))
      .mockRejectedValueOnce(new Error("transient-2"))
      .mockResolvedValueOnce([{ subscriptionId: 1, success: true }]);

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ attempted: 1, succeeded: 1, failed: 0 });
    expect(runNightlyDispatch).toHaveBeenCalledTimes(3);
  }, 10000);

  it("gives up and alerts after exhausting the retry budget", async () => {
    vi.mocked(runNightlyDispatch).mockRejectedValue(new Error("db down"));
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Nightly dispatch run failed." });
    expect(runNightlyDispatch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(body).toContain('"attempts":3');
    expect(body).toContain('"message":"db down"');
  }, 10000);

  it("no webhook configured: still 503, fetch never called", async () => {
    vi.mocked(runNightlyDispatch).mockRejectedValue(new Error("db down"));

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  }, 10000);

  it("repetition: two consecutive failing requests each retry and alert independently", async () => {
    vi.mocked(runNightlyDispatch).mockRejectedValue(new Error("db down"));
    vi.stubEnv("DISPATCH_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const first = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");
    const second = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(runNightlyDispatch).toHaveBeenCalledTimes(6);
    expect(fetch).toHaveBeenCalledTimes(2);
  }, 15000);
});
