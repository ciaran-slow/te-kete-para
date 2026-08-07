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
const SECRET = "test-cron-secret";

describe("GET /api/notifications/dispatch aggregate delivery-rate log line (NFR-04, ADR 0076)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(runNightlyDispatch).mockReset();
    logSpy.mockRestore();
  });

  function lastSummary() {
    // findLast, not find: across repeated runs, the most recent line is
    // what "last" must mean — find would silently return the first-ever
    // logged line for the whole test.
    const call = logSpy.mock.calls.findLast(
      ([line]: unknown[]) =>
        typeof line === "string" &&
        line.includes('"event":"nightly_dispatch_summary"'),
    );
    if (!call) throw new Error("nightly_dispatch_summary was not logged");
    return JSON.parse(call[0] as string);
  }

  it("logs 100 when every outcome succeeds", async () => {
    vi.mocked(runNightlyDispatch).mockResolvedValue([
      { subscriptionId: 1, success: true },
      { subscriptionId: 2, success: true },
    ]);

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(lastSummary()).toEqual({
      event: "nightly_dispatch_summary",
      attempted: 2,
      succeeded: 2,
      failed: 0,
      successRatePercent: 100,
      timestamp: expect.any(String),
    });
  });

  it("logs a fractional percentage for a mixed outcome (1 of 3 succeeded)", async () => {
    vi.mocked(runNightlyDispatch).mockResolvedValue([
      { subscriptionId: 1, success: true },
      { subscriptionId: 2, success: false, failureReason: "transient" },
      { subscriptionId: 3, success: false, failureReason: "gone" },
    ]);

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(lastSummary()).toMatchObject({
      attempted: 3,
      succeeded: 1,
      failed: 2,
      successRatePercent: 33.3,
    });
  });

  it("logs null, not 100, when there were zero candidates", async () => {
    vi.mocked(runNightlyDispatch).mockResolvedValue([]);

    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(lastSummary()).toEqual({
      event: "nightly_dispatch_summary",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      successRatePercent: null,
      timestamp: expect.any(String),
    });
  });

  it("repetition: three consecutive runs each log their own independent summary", async () => {
    vi.mocked(runNightlyDispatch)
      .mockResolvedValueOnce([{ subscriptionId: 1, success: true }])
      .mockResolvedValueOnce([
        { subscriptionId: 1, success: false, failureReason: "transient" },
      ])
      .mockResolvedValueOnce([
        { subscriptionId: 1, success: true },
        { subscriptionId: 2, success: true },
      ]);

    for (const expectedRate of [100, 0, 100]) {
      const response = await request(app)
        .get("/api/notifications/dispatch")
        .set("Authorization", `Bearer ${SECRET}`);
      expect(response.status).toBe(200);
      expect(lastSummary().successRatePercent).toBe(expectedRate);
    }
  });
});
