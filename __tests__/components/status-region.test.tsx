import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusRegion } from "../../src/components/status-region";
import { expectNoA11yViolations } from "../helpers/a11y";

afterEach(() => {
  cleanup();
});

describe("StatusRegion", () => {
  test("defaults to a div with aria-live polite, no aria-atomic, and no aria-labelledby", () => {
    render(<StatusRegion>Kia ora</StatusRegion>);
    const region = screen.getByText("Kia ora");
    expect(region.tagName).toBe("DIV");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).not.toHaveAttribute("aria-atomic");
    expect(region).not.toHaveAttribute("aria-labelledby");
  });

  test("renders the requested host element (section, p, div)", () => {
    const { rerender } = render(<StatusRegion as="section">Section</StatusRegion>);
    expect(screen.getByText("Section").tagName).toBe("SECTION");

    rerender(<StatusRegion as="p">Paragraph</StatusRegion>);
    expect(screen.getByText("Paragraph").tagName).toBe("P");

    rerender(<StatusRegion as="div">Div</StatusRegion>);
    expect(screen.getByText("Div").tagName).toBe("DIV");
  });

  test('atomic sets aria-atomic="true"; omitting it leaves the attribute off entirely', () => {
    const { rerender } = render(<StatusRegion atomic>On</StatusRegion>);
    expect(screen.getByText("On")).toHaveAttribute("aria-atomic", "true");

    rerender(<StatusRegion>Off</StatusRegion>);
    expect(screen.getByText("Off")).not.toHaveAttribute("aria-atomic");
  });

  test("headingId sets aria-labelledby; omitting it leaves the attribute off entirely", () => {
    const { rerender } = render(
      <StatusRegion headingId="my-heading">Labelled</StatusRegion>,
    );
    expect(screen.getByText("Labelled")).toHaveAttribute(
      "aria-labelledby",
      "my-heading",
    );

    rerender(<StatusRegion>Unlabelled</StatusRegion>);
    expect(screen.getByText("Unlabelled")).not.toHaveAttribute(
      "aria-labelledby",
    );
  });

  test("className passes through unchanged", () => {
    render(<StatusRegion className="mt-1 text-sm">Styled</StatusRegion>);
    expect(screen.getByText("Styled")).toHaveClass("mt-1", "text-sm");
  });

  test("the live region's text updates in place when the underlying state changes", () => {
    const { rerender } = render(<StatusRegion as="p">Searching…</StatusRegion>);
    const region = screen.getByText("Searching…");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<StatusRegion as="p">3 results found</StatusRegion>);

    // Same node, not a remount: the live region announces because its
    // existing content changed, not because a new element appeared.
    expect(region.textContent).toBe("3 results found");
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  test("three consecutive text changes each leave exactly one copy of the current text, never a stack of old ones", () => {
    const { rerender } = render(<StatusRegion as="p">State A</StatusRegion>);

    for (const next of ["State B", "State C", "State D"]) {
      rerender(<StatusRegion as="p">{next}</StatusRegion>);
      expect(screen.getAllByText(next)).toHaveLength(1);
      expect(screen.queryByText("State A")).not.toBeInTheDocument();
    }
  });

  test("renders with no children without throwing, leaving the host element present", () => {
    const { container } = render(<StatusRegion as="section" />);
    expect(container.querySelector("section")).not.toBeNull();
  });

  test("passes the accessibility audit labelled and unlabelled", async () => {
    const labelled = render(
      <StatusRegion as="section" atomic headingId="heading-a">
        <h2 id="heading-a">Today&apos;s collection</h2>
        <p>General rubbish</p>
      </StatusRegion>,
    );
    await expectNoA11yViolations(labelled.container);
    cleanup();

    const unlabelled = render(<StatusRegion as="p">Searching…</StatusRegion>);
    await expectNoA11yViolations(unlabelled.container);
  });
});
