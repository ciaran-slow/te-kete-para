import { describe, expect, it, vi } from "vitest";

describe("lighthouserc.js", () => {
  it("asserts NFR-01's three budget values exactly", async () => {
    const { default: config } = await import("../lighthouserc.js");

    expect(config.ci.assert.assertions["categories:accessibility"]).toEqual([
      "error",
      { minScore: 1 },
    ]);
    expect(config.ci.assert.assertions["categories:best-practices"]).toEqual([
      "error",
      { minScore: 1 },
    ]);
    expect(config.ci.assert.assertions["first-contentful-paint"]).toEqual([
      "error",
      { maxNumericValue: 1500 },
    ]);
  });

  it("collects against the app's only composed route via a production server", async () => {
    const { default: config } = await import("../lighthouserc.js");

    expect(config.ci.collect.url).toEqual(["http://localhost:3000/"]);
    expect(config.ci.collect.startServerCommand).toBe("npm run start");
  });

  it("never downgrades a budget assertion to a non-failing warn level", async () => {
    const { default: config } = await import("../lighthouserc.js");

    for (const assertion of Object.values(config.ci.assert.assertions)) {
      expect((assertion as [string, unknown])[0]).toBe("error");
    }
  });

  it("returns the same budget values across a genuine re-evaluation of the module", async () => {
    // A plain `await import(...)` a second time returns the same cached
    // module object (Node/Vitest's module cache is keyed by resolved
    // specifier) - it would pass even if the module were rewritten to
    // compute its config from mutable state (an env var read with a
    // fallback that only applies on the first evaluation), because the
    // module body never actually runs a second time to diverge from.
    // vi.resetModules() forces the module registry to forget the cached
    // instance, so the second import below re-executes lighthouserc.js
    // from scratch - a real second evaluation, not a second reference to
    // the first one.
    const { default: first } = await import("../lighthouserc.js");
    vi.resetModules();
    const { default: second } = await import("../lighthouserc.js");

    expect(second).not.toBe(first);
    expect(JSON.stringify(second.ci.assert.assertions)).toBe(
      JSON.stringify(first.ci.assert.assertions),
    );
  });
});
