import axe from "axe-core";

/* Rules disabled deliberately (ADR 0007):
   - color-contrast / color-contrast-enhanced: jsdom does no layout or
     painting, so axe cannot compute contrast. Covered by the Lighthouse
     budget (#31) and manual QA (#18) instead.
   - region: Testing Library renders fragments into a bare <div> in
     document.body, so "all content must be inside landmarks" false-positives
     on every component test. Full-document landmark auditing is #17/#31. */
const AXE_CONFIG: axe.RunOptions = {
  rules: {
    "color-contrast": { enabled: false },
    "color-contrast-enhanced": { enabled: false },
    region: { enabled: false },
  },
};

function formatViolations(violations: axe.Result[]): string {
  const details = violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    ${node.target.join(" ")}\n      ${node.html}`)
        .join("\n");
      return [
        `  ${violation.id} (${violation.impact ?? "unknown"} impact): ${violation.help}`,
        nodes,
        `    ${violation.helpUrl}`,
      ].join("\n");
    })
    .join("\n\n");
  return `Expected no accessibility violations, found ${violations.length}:\n\n${details}`;
}

/* Always await this: axe runs asynchronously and throws if two audits
   overlap in one document. */
export async function expectNoA11yViolations(
  container: Element,
): Promise<void> {
  if (!container.isConnected) {
    throw new Error(
      "expectNoA11yViolations: container is not attached to the document. " +
        "Render with Testing Library's render(), which mounts into document.body.",
    );
  }
  const results = await axe.run(container, AXE_CONFIG);
  if (results.violations.length > 0) {
    throw new Error(formatViolations(results.violations));
  }
}
