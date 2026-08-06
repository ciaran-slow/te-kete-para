"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  getSpeechRecognitionConstructor,
  useSpeechRecognitionSupport,
} from "@/lib/speech/use-speech-recognition-support";
import { StatusRegion } from "./status-region";

/**
 * Mirrors the JSON contract of `GET /api/sorting/search`
 * (src/app/api/sorting/search/route.ts, ADR 0013, ADR 0025). Duplicated
 * here rather than imported so this client bundle never depends on a route
 * module's file (ADR 0014).
 */
export interface SortingRuleSearchResult {
  itemKey: string;
  descriptionEn: string;
  descriptionMi: string;
  disposalInstructionsEn: string;
  disposalInstructionsMi: string;
}

type Status = "idle" | "loading" | "done" | "empty" | "error";

const DEBOUNCE_MS = 300;

/**
 * The "He Aha Tēnei?" sorting search (FR-05, issue #21): a debounced,
 * voice-enabled search over `GET /api/sorting/search`, rendering matched
 * items and their disposal instructions in the current locale. A plain
 * live results list, deliberately not an ARIA combobox — there is no
 * selection step, the rows are the answer (ADR 0026). Voice input is
 * feature-detected Web Speech API; when unsupported the mic button is
 * simply absent and typed search is the fallback (ADR 0027).
 *
 * Composed into `src/app/page.tsx` (ADR 0064, superseding ADR 0028's
 * deferral): the Te Reo Māori text in `sorting_rules` remains a machine
 * draft, not yet reviewed by a fluent speaker (#69) — shipped as an
 * accepted prototype-scope trade-off rather than left permanently unwired.
 */
export function SortingSearch() {
  const { locale, t } = useTranslation();
  const inputId = useId();
  const supportsVoice = useSpeechRecognitionSupport();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SortingRuleSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const [dismissedKaitiakitanga, setDismissedKaitiakitanga] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognition | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Unmount only: cancel whatever debounce/request/recognition is still
  // outstanding.
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      controllerRef.current?.abort();
      recognitionRef.current?.abort();
    };
  }, []);

  function executeSearch(trimmed: string) {
    const controller = new AbortController();
    controllerRef.current = controller;
    fetch(`/api/sorting/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as
          | { results: SortingRuleSearchResult[] }
          | { error: string };
        if (!response.ok) {
          throw new Error("sorting-search-failed");
        }
        return body as { results: SortingRuleSearchResult[] };
      })
      .then((body) => {
        setResults(body.results);
        setStatus(body.results.length === 0 ? "empty" : "done");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setResults([]);
        setStatus("error");
      });
  }

  /**
   * A new query invalidates the previous results immediately. `immediate`
   * skips the debounce: a spoken utterance is already final, unlike a
   * keystroke stream.
   */
  function runSearch(trimmed: string, immediate = false) {
    setDismissedKaitiakitanga(false);
    setResults([]);
    setStatus("loading");
    if (immediate) {
      executeSearch(trimmed);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      executeSearch(trimmed);
    }, DEBOUNCE_MS);
  }

  function cancelPending() {
    clearTimeout(timeoutRef.current);
    controllerRef.current?.abort();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    cancelPending();
    setVoiceError(false);

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setStatus("idle");
      return;
    }
    runSearch(trimmed);
  }

  /**
   * Called from the recognition's `onresult` callback — a plain event
   * callback, not a React effect body, so setting state here does not trip
   * react-hooks/set-state-in-effect (same category as the fetch `.then`
   * callbacks above).
   */
  function handleVoiceResult(transcript: string) {
    setQuery(transcript);
    cancelPending();

    const trimmed = transcript.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setStatus("idle");
      return;
    }
    runSearch(trimmed, true);
  }

  function handleVoiceClick() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionConstructor();
    // Defensive no-op: the button is not even rendered when unsupported
    // (ADR 0027) — this guard is not the primary fallback path.
    if (Ctor === undefined) return;

    const recognition = new Ctor();
    recognition.lang = locale === "mi" ? "mi" : "en-NZ";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      handleVoiceResult(transcript);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceError(true);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setVoiceError(false);
    setIsListening(true);
    recognition.start();
  }

  const STATUS_MESSAGES: Record<Status, string> = {
    idle: "",
    loading: t("sortingSearch.loading"),
    done: t("sortingSearch.resultsAvailable"),
    empty: t("sortingSearch.noResults"),
    error: t("sortingSearch.error"),
  };
  const isVisibleStatus =
    status === "loading" || status === "empty" || status === "error";
  const showKaitiakitanga = status === "done" && !dismissedKaitiakitanga;

  function dismissKaitiakitanga() {
    setDismissedKaitiakitanga(true);
    inputRef.current?.focus();
  }

  return (
    <div className="w-full max-w-md">
      <h2 className="mb-2 font-heading text-lg font-semibold text-moana">
        {t("sortingSearch.heading")}
      </h2>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-papa-ink">
        {t("sortingSearch.label")}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder={t("sortingSearch.placeholder")}
          value={query}
          onChange={handleChange}
          className="w-full rounded-md border border-moana/60 px-4 text-base text-papa-ink placeholder:text-papa-ink/70 touch-target focus-ring"
        />
        {supportsVoice && (
          <button
            type="button"
            onClick={handleVoiceClick}
            aria-pressed={isListening}
            aria-label={t(
              isListening ? "sortingSearch.voice.stop" : "sortingSearch.voice.button",
            )}
            className="touch-target focus-ring rounded-md border border-moana/60 px-3 text-moana"
          >
            {/* Mic glyph; the accessible name comes from aria-label, so the
                SVG stays decorative. */}
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="mx-auto h-5 w-5"
            >
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
              <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.92V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.08A6 6 0 0 0 18 11Z" />
            </svg>
          </button>
        )}
      </div>
      <StatusRegion
        as="p"
        className={isVisibleStatus ? "mt-1 text-sm text-papa-ink" : "sr-only"}
      >
        {STATUS_MESSAGES[status]}
      </StatusRegion>
      {/* Both voice regions stay mounted permanently — only their text
          changes. Conditionally mounting a StatusRegion inserts the element
          into the DOM already containing its message, which aria-live never
          announces (StatusRegion's documented contract). */}
      <StatusRegion as="p" className="sr-only">
        {isListening ? t("sortingSearch.voice.listening") : ""}
      </StatusRegion>
      <StatusRegion
        as="p"
        className={voiceError ? "mt-1 text-sm text-papa-ink" : "sr-only"}
      >
        {voiceError ? t("sortingSearch.voice.error") : ""}
      </StatusRegion>
      <StatusRegion
        as="div"
        atomic
        className={
          showKaitiakitanga
            ? "mt-2 flex items-start justify-between gap-3 rounded-md border-2 border-kakariki bg-kakariki/10 px-4 py-3 text-sm font-medium text-papa-ink"
            : "sr-only"
        }
      >
        {showKaitiakitanga && (
          <>
            <p className="flex-1">{t("sortingSearch.kaitiakitanga.message")}</p>
            <button
              type="button"
              onClick={dismissKaitiakitanga}
              aria-label={t("sortingSearch.kaitiakitanga.dismiss")}
              className="touch-target focus-ring shrink-0 rounded-md text-kakariki"
            >
              <X aria-hidden="true" focusable="false" className="mx-auto h-5 w-5" />
            </button>
          </>
        )}
      </StatusRegion>
      <ul
        aria-label={t("sortingSearch.resultsLabel")}
        className="mt-2 flex flex-col gap-2"
      >
        {results.map((result) => (
          <li
            key={result.itemKey}
            className="rounded-md border border-moana/20 p-3 text-sm text-papa-ink"
          >
            <p>{locale === "mi" ? result.descriptionMi : result.descriptionEn}</p>
            <p>
              <strong>{t("sortingSearch.disposalHeading")}: </strong>
              {locale === "mi"
                ? result.disposalInstructionsMi
                : result.disposalInstructionsEn}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
