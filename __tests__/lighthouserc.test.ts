import { describe, expect, it } from "vitest";

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

  it("returns the same budget values on repeated imports", async () => {
    const { default: first } = await import("../lighthouserc.js");
    const { default: second } = await import("../lighthouserc.js");

    expect(JSON.stringify(second.ci.assert.assertions)).toBe(
      JSON.stringify(first.ci.assert.assertions),
    );
  });
});
