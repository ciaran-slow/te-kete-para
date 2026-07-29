import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Switch } from "radix-ui";
import { expectNoA11yViolations } from "../helpers/a11y";

// RTL auto-cleanup needs test.globals, which vitest.config.mts doesn't set.
afterEach(cleanup);

test("accessible markup passes the audit", async () => {
  const { container } = render(
    <main>
      <h1>Tauira</h1>
      <button type="button">Tāpiri</button>
    </main>,
  );
  await expectNoA11yViolations(container);
});

test("a button with no accessible name fails with the rule id", async () => {
  const { container } = render(<button type="button" />);
  await expect(expectNoA11yViolations(container)).rejects.toThrow(
    /button-name/,
  );
});

test("every violation is reported, not just the first", async () => {
  const { container } = render(
    <div>
      <button type="button" />
      <input type="text" />
    </div>,
  );
  const message = await expectNoA11yViolations(container).then(
    () => {
      throw new Error("expected the audit to fail");
    },
    (error: Error) => error.message,
  );
  expect(message).toMatch(/button-name/);
  expect(message).toMatch(/\blabel\b/);
  expect(message).toMatch(/found 2/);
});

test("a detached node is rejected with guidance, not silently passed", async () => {
  const detached = document.createElement("div");
  detached.innerHTML = "<button></button>";
  await expect(expectNoA11yViolations(detached)).rejects.toThrow(
    /not attached/,
  );
});

test("repeat audits of a passing container keep passing", async () => {
  const { container } = render(<button type="button">Pai</button>);
  await expectNoA11yViolations(container);
  await expectNoA11yViolations(container);
  await expectNoA11yViolations(container);
});

test("repeat audits of a failing container fail identically", async () => {
  const { container } = render(<button type="button" />);
  await expect(expectNoA11yViolations(container)).rejects.toThrow(
    /button-name/,
  );
  await expect(expectNoA11yViolations(container)).rejects.toThrow(
    /button-name/,
  );
});

test("a labelled Radix Switch renders and passes the audit", async () => {
  const { container } = render(
    <Switch.Root aria-label="Reo Māori">
      <Switch.Thumb />
    </Switch.Root>,
  );
  expect(
    screen.getByRole("switch", { name: "Reo Māori" }),
  ).toBeInTheDocument();
  await expectNoA11yViolations(container);
});

test("an unlabelled Radix Switch fails the audit", async () => {
  const { container } = render(
    <Switch.Root>
      <Switch.Thumb />
    </Switch.Root>,
  );
  // The exact rule is aria-toggle-field-name (role="switch" needs an
  // accessible name); /name/ tolerates axe re-categorising toggle names.
  await expect(expectNoA11yViolations(container)).rejects.toThrow(/name/);
});
