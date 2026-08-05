import { describe, expect, test, vi } from "vitest";
import { withRetry } from "@/lib/notifications/retry";

describe("withRetry", () => {
  test("happy path: resolves on the first call without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("recovers within budget: succeeds after two failures", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockRejectedValueOnce(new Error("fail-2"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("exhausts and rethrows the last error, not the first", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockRejectedValueOnce(new Error("fail-2"))
      .mockRejectedValueOnce(new Error("fail-3"));

    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("fail-3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("exponential backoff: delays double, not constant or linear", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 10 })).rejects.toThrow("always fails");

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay);
    expect(delays).toEqual([10, 20]);

    setTimeoutSpy.mockRestore();
  });

  test("repetition: two consecutive calls each retry independently, no leaked state", async () => {
    const fnA = vi.fn().mockRejectedValue(new Error("a fails"));
    const fnB = vi.fn().mockRejectedValue(new Error("b fails"));

    await expect(withRetry(fnA, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("a fails");
    expect(fnA).toHaveBeenCalledTimes(2);

    await expect(withRetry(fnB, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("b fails");
    expect(fnB).toHaveBeenCalledTimes(2);
  });
});
