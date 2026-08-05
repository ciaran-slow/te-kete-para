import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AddressSearch,
  formatOptionLabel,
  type SuburbSearchResult,
  type AddressSearchProps,
} from "../../src/components/address-search";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { expectNoA11yViolations } from "../helpers/a11y";

const KARORI: SuburbSearchResult = {
  id: 1,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};
const CUBA_MALL: SuburbSearchResult = {
  id: 2,
  streetName: "Cuba Mall",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};
const CUBA_STREET: SuburbSearchResult = {
  id: 3,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

function renderSearch(props: AddressSearchProps = {}) {
  return render(
    <LanguageProvider>
      <AddressSearch {...props} />
    </LanguageProvider>,
  );
}

function input() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

async function typeAndSettle(value: string) {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AddressSearch", () => {
  test("renders a labelled combobox, closed, with no listbox visible", () => {
    renderSearch();
    expect(screen.getByRole("combobox", { name: "Search for your street address" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("listbox", { hidden: true })).toBeInTheDocument();
  });

  test("does not call fetch for an empty or whitespace-only value", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderSearch();
    await typeAndSettle("   ");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("debounces rapid keystrokes into exactly one fetch call for the final value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL, CUBA_STREET] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.change(input(), { target: { value: "C" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.change(input(), { target: { value: "Cu" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.change(input(), { target: { value: "Cub" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/suburbs/search?q=Cub",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  test("renders returned results as selectable options and opens the listbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL, CUBA_STREET] })),
    );
    renderSearch();
    await typeAndSettle("cuba");

    expect(input()).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(listbox).not.toHaveAttribute("hidden");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Cuba Mall, Te Aro");
    expect(options[1]).toHaveTextContent("Cuba Street, Te Aro");
  });

  test("selecting an option via click sets the input value, closes the listbox, calls onSelect, and does not re-trigger a search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL] }));
    vi.stubGlobal("fetch", fetchMock);
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    await typeAndSettle("cuba");

    fireEvent.mouseDown(screen.getByRole("option"));
    fireEvent.click(screen.getByRole("option"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(CUBA_MALL);
    expect(input()).toHaveValue("Cuba Mall, Te Aro");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");

    // Selecting rewrites `query` to "Cuba Mall, Te Aro"; that state change must
    // not itself schedule another debounced search.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("ArrowDown/ArrowUp move the active descendant without moving DOM focus off the input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL, CUBA_STREET] })),
    );
    renderSearch();
    await typeAndSettle("cuba");
    const field = input();
    act(() => field.focus());

    fireEvent.keyDown(field, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", options[0]!.id);
    expect(document.activeElement).toBe(field);

    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(field);

    // Clamps at the last option rather than wrapping.
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Clamps at the first option.
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  test("Enter selects the active option", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL] })));
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    await typeAndSettle("cuba");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(CUBA_MALL);
    expect(input()).toHaveValue("Cuba Mall, Te Aro");
  });

  test("Enter with no active option does nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL] })));
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    await typeAndSettle("cuba");

    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(input()).toHaveValue("cuba");
    expect(input()).toHaveAttribute("aria-expanded", "true");
  });

  test("Escape closes the listbox, keeps the typed text, and cancels the pending request so no stale update reopens it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [CUBA_MALL] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.change(input(), { target: { value: "cuba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.keyDown(input(), { key: "Escape" });

    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("cuba");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");
  });

  test("aria-expanded stays false and arrow keys are inert while a request is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderSearch();

    fireEvent.change(input(), { target: { value: "cuba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).not.toHaveAttribute("aria-activedescendant");
  });

  test("an empty result set collapses the combobox: aria-expanded is false, the listbox is hidden, and ArrowDown/Enter do nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    await typeAndSettle("zzz-no-match");

    expect(screen.getByText("No matching addresses. Check the spelling and try again.")).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("a failed search collapses the combobox: aria-expanded is false while the error message shows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();
    await typeAndSettle("cuba");

    expect(
      screen.getByText("We couldn't search addresses right now. Please try again."),
    ).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");
  });

  test("typing a new query clears the previous results and active descendant before the fetch resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ results: [CUBA_MALL, CUBA_STREET] }))
        .mockReturnValue(new Promise(() => {})),
    );
    renderSearch();
    await typeAndSettle("cuba");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).toHaveAttribute("aria-activedescendant");
    expect(input()).toHaveAttribute("aria-expanded", "true");

    fireEvent.change(input(), { target: { value: "cubab" } });

    expect(input()).not.toHaveAttribute("aria-activedescendant");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("listbox", { hidden: true })).toHaveAttribute("hidden");
  });

  test("shows a translated, visible, aria-live loading message while a request is in flight", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve))),
    );
    renderSearch();

    fireEvent.change(input(), { target: { value: "cuba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const status = screen.getByText("Searching…");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.className).not.toContain("sr-only");

    await act(async () => {
      resolveFetch(jsonResponse({ results: [] }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("No matching addresses. Check the spelling and try again.")).toBeInTheDocument();
  });

  test("shows a translated error message on a failure response, without leaking the API's raw error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Unable to search addresses." }, false)),
    );
    renderSearch();
    await typeAndSettle("cuba");

    expect(
      screen.getByText("We couldn't search addresses right now. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unable to search addresses.")).not.toBeInTheDocument();
  });

  test("shows the same translated error message when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();
    await typeAndSettle("cuba");

    expect(
      screen.getByText("We couldn't search addresses right now. Please try again."),
    ).toBeInTheDocument();
  });

  test("repeating the same failing query three times shows exactly one error message each time, never a stack", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();

    for (let attempt = 0; attempt < 3; attempt++) {
      await typeAndSettle("");
      await typeAndSettle("cuba");
      expect(
        screen.getAllByText("We couldn't search addresses right now. Please try again."),
      ).toHaveLength(1);
    }
  });

  test("unmounting while a debounce timer is pending clears it and does not throw", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = renderSearch();
    fireEvent.change(input(), { target: { value: "cuba" } });
    expect(() => unmount()).not.toThrow();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("unmounting while a request is in flight aborts it", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { unmount } = renderSearch();
    await typeAndSettle("cuba");
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });

  test("aborting an in-flight request by typing again does not surface it as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init?: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );
    renderSearch();

    fireEvent.change(input(), { target: { value: "cuba" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300); // fires the debounced fetch
    });
    fireEvent.change(input(), { target: { value: "cubaa" } }); // aborts it mid-flight
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.queryByText("We couldn't search addresses right now. Please try again."),
    ).not.toBeInTheDocument();
  });

  test("passes the accessibility audit in idle, loading, results, empty, and error states", async () => {
    // axe-core schedules its own internal async work with the real setTimeout;
    // fake timers (active in every other test via the top-level beforeEach)
    // starve that work and the audit hangs, so this test opts back into real
    // timers and waits out the real 300ms debounce instead of fast-forwarding it.
    vi.useRealTimers();

    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () => new Promise((resolve) => (resolveFetch = resolve)),
      ),
    );
    const { container } = renderSearch();
    await expectNoA11yViolations(container); // idle

    fireEvent.change(input(), { target: { value: "cuba" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // loading

    await act(async () => {
      resolveFetch(jsonResponse({ results: [CUBA_MALL, CUBA_STREET] }));
      await Promise.resolve();
    });
    await expectNoA11yViolations(container); // done

    fireEvent.change(input(), { target: { value: "" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    fireEvent.change(input(), { target: { value: "zzz-no-match" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // empty

    fireEvent.change(input(), { target: { value: "" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    fireEvent.change(input(), { target: { value: "cuba" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // error
  }, 10000);

  test("the input carries the shared touch-target and focus-ring classes and no per-component focus: utilities (ADR 0020)", () => {
    renderSearch();
    const field = input();
    expect(field.className).toContain("touch-target");
    expect(field.className).toContain("focus-ring");
    // Regression guard: focus styling comes only from the shared
    // .focus-ring class. Any `focus:`-prefixed utility (focus:outline-*,
    // focus:ring-*, …) would reintroduce styling gated on plain :focus —
    // the mouse-click-ring bug this issue fixed. (`focus-visible:` does not
    // match this pattern.) The behavioural keyboard-vs-mouse assertions
    // against the real stylesheet live in
    // __tests__/a11y/focus-and-touch-targets.test.tsx.
    expect(field.className).not.toMatch(/focus:/);
  });

  test("formatOptionLabel joins street name and suburb", () => {
    expect(formatOptionLabel(KARORI)).toBe("Karori Road, Karori");
  });
});
