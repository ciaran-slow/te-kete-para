import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  SortingSearch,
  type SortingRuleSearchResult,
} from "../../src/components/sorting-search";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { writeStoredLocale } from "../../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "../helpers/a11y";

const PIZZA_BOX: SortingRuleSearchResult = {
  itemKey: "pizza-box",
  descriptionEn: "Pizza box",
  descriptionMi: "Pouaka parehe",
  disposalInstructionsEn: "Flatten it and put it in the wheelie bin if clean.",
  disposalInstructionsMi:
    "Whakapapatia, ka whakauru ki te ipupara mēnā he mā.",
};
const GLASS_JAR: SortingRuleSearchResult = {
  itemKey: "glass-jar",
  descriptionEn: "Glass jar",
  descriptionMi: "Ipu karāhe",
  disposalInstructionsEn: "Rinse it and put it in the glass crate.",
  disposalInstructionsMi: "Horoia, ka whakauru ki te kete karāhe.",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

function renderSearch() {
  return render(
    <LanguageProvider>
      <SortingSearch />
    </LanguageProvider>,
  );
}

function input() {
  return screen.getByRole("textbox", {
    name: "Search for a household item",
  }) as HTMLInputElement;
}

async function typeAndSettle(value: string) {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

/* Test double for the Web Speech API: records start/stop/abort calls and
   lets a test invoke onresult/onerror/onend manually. */
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  interimResults = true;
  maxAlternatives = 0;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
}

function stubSpeechRecognition() {
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
}

function speechResultEvent(transcript: string): SpeechRecognitionEvent {
  return {
    results: { 0: { 0: { transcript }, length: 1 }, length: 1 },
  } as unknown as SpeechRecognitionEvent;
}

function speechErrorEvent(error = "no-speech"): SpeechRecognitionErrorEvent {
  return { error } as unknown as SpeechRecognitionErrorEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("SortingSearch", () => {
  test("renders a labelled text input and an empty, labelled results list", () => {
    renderSearch();
    expect(input()).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Matching items" })).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  test("does not call fetch for an empty or whitespace-only value", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderSearch();
    await typeAndSettle("   ");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("debounces rapid keystrokes into exactly one fetch call for the final value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.change(input(), { target: { value: "p" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.change(input(), { target: { value: "pi" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.change(input(), { target: { value: "piz" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sorting/search?q=piz",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  test("renders returned results as list items in the default English locale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX, GLASS_JAR] })),
    );
    renderSearch();
    await typeAndSettle("box");

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Pizza box");
    expect(items[0]).toHaveTextContent(
      "How to dispose of this: Flatten it and put it in the wheelie bin if clean.",
    );
    expect(items[1]).toHaveTextContent("Glass jar");
    expect(screen.queryByText("Pouaka parehe")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Whakapapatia, ka whakauru ki te ipupara/),
    ).not.toBeInTheDocument();
  });

  test("switching the locale re-renders already-fetched results in Te Reo without a second fetch (ADR 0025)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();
    await typeAndSettle("pizza");
    expect(screen.getByText("Pizza box")).toBeInTheDocument();

    act(() => writeStoredLocale("mi"));

    expect(screen.getByText("Pouaka parehe")).toBeInTheDocument();
    expect(
      screen.getByText(/Whakapapatia, ka whakauru ki te ipupara mēnā he mā\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pizza box")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Flatten it and put it in the wheelie bin/),
    ).not.toBeInTheDocument();
    // A regression to a server-side ?lang= refetch must fail here.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("an empty result set shows the translated no-results message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    renderSearch();
    await typeAndSettle("zzz-no-match");

    expect(
      screen.getByText("No matching items. Check the spelling and try again."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  test("shows a translated error message on a failure response, without leaking the API's raw error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Unable to search sorting rules." }, false)),
    );
    renderSearch();
    await typeAndSettle("pizza");

    expect(
      screen.getByText("We couldn't search household items right now. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unable to search sorting rules.")).not.toBeInTheDocument();
  });

  test("shows the same translated error message when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();
    await typeAndSettle("pizza");

    expect(
      screen.getByText("We couldn't search household items right now. Please try again."),
    ).toBeInTheDocument();
  });

  test("a successful match shows the visible, announced kaitiakitanga banner with a dismiss button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] })),
    );
    renderSearch();
    await typeAndSettle("pizza");

    const banner = screen.getByText(
      "Ka pai! Sorting that correctly helps you act as a kaitiaki — a guardian of Wellington's environment.",
    );
    expect(banner).toBeInTheDocument();
    expect(banner.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(banner.closest("[aria-live]")?.className).not.toContain("sr-only");
    expect(
      screen.getByRole("button", { name: "Dismiss this message" }),
    ).toBeInTheDocument();
  });

  test("an empty result set shows no kaitiakitanga banner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    renderSearch();
    await typeAndSettle("zzz-no-match");

    expect(screen.queryByText(/Ka pai!/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss this message" }),
    ).not.toBeInTheDocument();
  });

  test("an error response shows no kaitiakitanga banner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();
    await typeAndSettle("pizza");

    expect(screen.queryByText(/Ka pai!/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss this message" }),
    ).not.toBeInTheDocument();
  });

  test("dismissing the kaitiakitanga banner removes it and returns focus to the search input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] })),
    );
    renderSearch();
    await typeAndSettle("pizza");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this message" }));

    expect(screen.queryByText(/Ka pai!/)).not.toBeInTheDocument();
    expect(input()).toHaveFocus();
  });

  test("a new distinct successful query re-shows the kaitiakitanga banner after a prior dismissal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();
    await typeAndSettle("pizza");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this message" }));
    expect(screen.queryByText(/Ka pai!/)).not.toBeInTheDocument();

    fetchMock.mockResolvedValue(jsonResponse({ results: [GLASS_JAR] }));
    await typeAndSettle("box");

    expect(screen.getByText(/Ka pai!/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss this message" }),
    ).toBeInTheDocument();
  });

  test("repeating the same successful query three times shows exactly one banner and one dismiss button each time, never stacking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] })),
    );
    renderSearch();

    for (let attempt = 0; attempt < 3; attempt++) {
      await typeAndSettle("");
      await typeAndSettle("pizza");
      expect(screen.getAllByText(/Ka pai!/)).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: "Dismiss this message" }),
      ).toHaveLength(1);
    }
  });

  test("a voice-dictated successful match also shows the kaitiakitanga banner", async () => {
    stubSpeechRecognition();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onresult?.(speechResultEvent("pizza box"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/Ka pai!/)).toBeInTheDocument();
  });

  test("switching the locale re-renders the kaitiakitanga banner text in Te Reo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();
    await typeAndSettle("pizza");
    expect(screen.getByText(/Ka pai!/)).toBeInTheDocument();

    act(() => writeStoredLocale("mi"));

    expect(
      screen.getByText(
        "Ka pai! Mā te whakariterite tika e āwhina ana koe ki te mahi kaitiaki mō te taiao o Te Whanganui-a-Tara.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sorting that correctly helps/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("unmounting while a debounce timer is pending clears it and does not throw", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = renderSearch();
    fireEvent.change(input(), { target: { value: "pizza" } });
    expect(() => unmount()).not.toThrow();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("unmounting while a request is in flight aborts it", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { unmount } = renderSearch();
    await typeAndSettle("pizza");
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

    fireEvent.change(input(), { target: { value: "pizza" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300); // fires the debounced fetch
    });
    fireEvent.change(input(), { target: { value: "pizzaa" } }); // aborts it mid-flight
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.queryByText("We couldn't search household items right now. Please try again."),
    ).not.toBeInTheDocument();
  });

  test("repeating the same failing query three times shows exactly one error message each time, never a stack", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    renderSearch();

    for (let attempt = 0; attempt < 3; attempt++) {
      await typeAndSettle("");
      await typeAndSettle("pizza");
      expect(
        screen.getAllByText("We couldn't search household items right now. Please try again."),
      ).toHaveLength(1);
    }
  });

  test("consecutive successful queries matching the same row replace the results, never accumulating duplicates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] })),
    );
    renderSearch();

    // Two *different* non-empty queries, so nothing between them passes
    // through handleChange's empty-value branch (which clears results as a
    // side effect and would mask the property under test). An accumulating
    // setResults((prev) => [...prev, ...body.results]) regression must
    // surface here as a second <li> after the second query.
    await typeAndSettle("pizza");
    let items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Pizza box");

    await typeAndSettle("box");
    items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Pizza box");
  });

  test("shows a visible aria-live 'Searching…' message while a request is in flight, then announces results are available in a live region", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve))),
    );
    renderSearch();

    fireEvent.change(input(), { target: { value: "pizza" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // The only "request in flight" feedback: visible, and inside a polite
    // live region so screen readers hear it.
    const loading = screen.getByText("Searching…");
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(loading.className).not.toContain("sr-only");

    await act(async () => {
      resolveFetch(jsonResponse({ results: [PIZZA_BOX] }));
      await vi.advanceTimersByTimeAsync(0);
    });

    // The results <ul> is not a live region, so this message is the only
    // signal to a screen-reader user that results arrived (visually hidden,
    // but announced).
    const done = screen.getByText("Results are available below.");
    expect(done).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(screen.getByText("Pizza box")).toBeInTheDocument();
  });

  test("when SpeechRecognition is unsupported, no voice button renders at all — the documented graceful fallback (ADR 0027)", () => {
    expect(window.SpeechRecognition).toBeUndefined();
    expect(window.webkitSpeechRecognition).toBeUndefined();
    renderSearch();

    expect(
      screen.queryByRole("button", { name: "Search by voice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stop voice search" }),
    ).not.toBeInTheDocument();
  });

  test("server rendering emits no mic button even when SpeechRecognition exists, so a static prerender can never hydrate into a support mismatch (ADR 0027 decision 2)", () => {
    // Pins getServerSnapshot() === false in use-speech-recognition-support:
    // the constructor IS present here, so a mutation to `return true` puts a
    // <button> into the server HTML and fails this assertion.
    stubSpeechRecognition();
    const html = renderToString(
      <LanguageProvider>
        <SortingSearch />
      </LanguageProvider>,
    );
    expect(html).not.toContain("<button");
  });

  test("clicking the mic button starts recognition and flips to the pressed stop state", () => {
    stubSpeechRecognition();
    renderSearch();

    const mic = screen.getByRole("button", { name: "Search by voice" });
    expect(mic).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mic);

    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    const recognition = FakeSpeechRecognition.instances[0]!;
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.interimResults).toBe(false);
    expect(recognition.maxAlternatives).toBe(1);
    expect(recognition.lang).toBe("en-NZ");
    expect(mic).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Stop voice search" })).toBe(mic);
  });

  test("switching to Te Reo before clicking the mic constructs recognition with lang \"mi\" (ADR 0027 decision 4)", () => {
    stubSpeechRecognition();
    renderSearch();
    act(() => writeStoredLocale("mi"));

    const mic = screen.getByRole("button", { name: "Rapua mā te reo" });
    fireEvent.click(mic);

    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    const recognition = FakeSpeechRecognition.instances[0]!;
    expect(recognition.lang).toBe("mi");
  });

  test("a voice result sets the input value and triggers exactly one immediate fetch, with no debounce wait", async () => {
    stubSpeechRecognition();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onresult?.(speechResultEvent("pizza box"));
    });

    // Immediate: no timer advancement between onresult and this assertion.
    expect(input()).toHaveValue("pizza box");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sorting/search?q=pizza%20box",
      expect.objectContaining({ signal: expect.anything() }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Pizza box")).toBeInTheDocument();
  });

  test("a recognition error shows the translated voice-error message, restores the idle mic label, and leaves prior typed results untouched", async () => {
    stubSpeechRecognition();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();
    await typeAndSettle("pizza");
    expect(screen.getByText("Pizza box")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onerror?.(speechErrorEvent());
    });

    expect(
      screen.getByText("We couldn't hear you clearly. Please try again or type your search."),
    ).toBeInTheDocument();
    const mic = screen.getByRole("button", { name: "Search by voice" });
    expect(mic).toHaveAttribute("aria-pressed", "false");
    // A failed voice attempt must not clear results already on screen.
    expect(screen.getByText("Pizza box")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("typing a query that succeeds clears a stale voice-error message (#76)", async () => {
    stubSpeechRecognition();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [PIZZA_BOX] }));
    vi.stubGlobal("fetch", fetchMock);
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onerror?.(speechErrorEvent());
    });
    expect(
      screen.getByText("We couldn't hear you clearly. Please try again or type your search."),
    ).toBeInTheDocument();

    await typeAndSettle("pizza");

    expect(
      screen.queryByText("We couldn't hear you clearly. Please try again or type your search."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Pizza box")).toBeInTheDocument();
  });

  test("clicking the mic again after a voice error clears the stale message (#76)", () => {
    stubSpeechRecognition();
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onerror?.(speechErrorEvent());
    });
    expect(
      screen.getByText("We couldn't hear you clearly. Please try again or type your search."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));

    expect(
      screen.queryByText("We couldn't hear you clearly. Please try again or type your search."),
    ).not.toBeInTheDocument();
  });

  test("the listening and voice-error live regions exist in the DOM before their messages do, so aria-live can announce them", () => {
    stubSpeechRecognition();
    renderSearch();

    // Capture every aria-live host at idle, before any voice interaction.
    // Announcement only happens when text changes inside an already-mounted
    // live region — an element inserted with its message pre-filled is
    // silent — so each message's host must be one of these idle elements.
    const idleHosts = Array.from(document.querySelectorAll("[aria-live]"));

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const listeningHost = screen
      .getByText("Listening…")
      .closest("[aria-live]");
    expect(idleHosts).toContain(listeningHost);

    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onerror?.(speechErrorEvent());
    });
    expect(screen.queryByText("Listening…")).not.toBeInTheDocument();
    const errorHost = screen
      .getByText(
        "We couldn't hear you clearly. Please try again or type your search.",
      )
      .closest("[aria-live]");
    expect(idleHosts).toContain(errorHost);
    // The same still-mounted host, not a remount that happens to reuse a node.
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(
      idleHosts.length,
    );
  });

  test("clicking the mic button while listening stops the same instance rather than constructing a second one", () => {
    stubSpeechRecognition();
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop voice search" }));

    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    const recognition = FakeSpeechRecognition.instances[0]!;
    expect(recognition.stop).toHaveBeenCalledTimes(1);

    // The double's stop() does not fire onend itself; the component relies on
    // the real API's onend for that, so simulate it and confirm the label
    // returns to idle.
    act(() => {
      recognition.onend?.();
    });
    expect(
      screen.getByRole("button", { name: "Search by voice" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("unmounting while listening aborts the recognition instance", () => {
    stubSpeechRecognition();
    const { unmount } = renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    const recognition = FakeSpeechRecognition.instances[0]!;
    unmount();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
  });

  test("passes the accessibility audit in idle, loading, results, empty, error, listening, and voice-error states", async () => {
    // axe-core schedules its own internal async work with the real setTimeout;
    // fake timers (active in every other test via the top-level beforeEach)
    // starve that work and the audit hangs, so this test opts back into real
    // timers and waits out the real 300ms debounce instead of fast-forwarding it.
    vi.useRealTimers();
    stubSpeechRecognition();

    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () => new Promise((resolve) => (resolveFetch = resolve)),
      ),
    );
    const { container } = renderSearch();
    await expectNoA11yViolations(container); // idle

    fireEvent.change(input(), { target: { value: "pizza" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // loading

    await act(async () => {
      resolveFetch(jsonResponse({ results: [PIZZA_BOX, GLASS_JAR] }));
      await Promise.resolve();
    });
    await expectNoA11yViolations(container); // results

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this message" }));
    await expectNoA11yViolations(container); // kaitiakitanga dismissed

    fireEvent.change(input(), { target: { value: "" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    fireEvent.change(input(), { target: { value: "zzz-no-match" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // empty

    fireEvent.change(input(), { target: { value: "" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    fireEvent.change(input(), { target: { value: "pizza" } });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await expectNoA11yViolations(container); // error

    fireEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    await expectNoA11yViolations(container); // listening

    const recognition = FakeSpeechRecognition.instances[0]!;
    act(() => {
      recognition.onerror?.(speechErrorEvent());
    });
    await expectNoA11yViolations(container); // voice error
  }, 15000);

  test("the input and mic button carry the shared touch-target and focus-ring classes and no per-component focus: utilities (ADR 0020)", () => {
    stubSpeechRecognition();
    renderSearch();
    const field = input();
    const mic = screen.getByRole("button", { name: "Search by voice" });
    for (const element of [field, mic]) {
      expect(element.className).toContain("touch-target");
      expect(element.className).toContain("focus-ring");
      // Regression guard: focus styling comes only from the shared
      // .focus-ring class (`focus-visible:` would not match this pattern).
      expect(element.className).not.toMatch(/focus:/);
    }
  });
});
