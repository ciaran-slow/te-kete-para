import axe from "axe-core";

/* Rules disabled deliberately (ADR 0007):
   - color-contrast / color-contrast-enhanced: jsdom does no layout or
     painting, so axe cannot compute contrast. Covered by the Lighthouse
     budget (#31) and manual QA (#18) instead.
   - region: Testing Library renders fragments into a bare <div> in
     document.body, so "all content must be inside landmarks" false-positives
     on every component test. Full-document landmark auditing is #17/#31.

   A third gap is not a rule exclusion but a property of axe: results also
   carry an `incomplete` bucket for checks axe could not decide, and this
   helper only fails on `violations`. Without layout, jsdom sends every
   visibility-dependent rule there — a focusable element inside
   aria-hidden="true" reports incomplete: ["aria-hidden-focus"] and
   violations: [], so this helper passes it. Those rules resolve to a real
   pass/fail only in a browser: #17 (Playwright axe suite) and #31
   (Lighthouse). Do not "fix" this by failing on incomplete — aria-hidden-focus
   goes indeterminate whenever content is hidden, which would turn legitimate
   tests red. */
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
  /* An audit of an empty container passes without checking anything, which is a
     false green when a component has regressed to rendering null. Guard on child
     nodes, deliberately NOT on "axe evaluated no rules" (passes + violations +
     incomplete === 0): measured in this jsdom setup, an accessible text-only
     component such as <p>Kia ora</p> evaluates zero rules, so the rule-count
     predicate would reject legitimate component tests. */
  if (!container.hasChildNodes()) {
    throw new Error(
      "expectNoA11yViolations: container is empty, so the audit would pass " +
        "without checking anything. Assert that the component rendered before " +
        "auditing it — a component that has regressed to returning null " +
        "reaches this line.",
    );
  }
  const results = await axe.run(container, AXE_CONFIG);
  if (results.violations.length > 0) {
    throw new Error(formatViolations(results.violations));
  }
}
