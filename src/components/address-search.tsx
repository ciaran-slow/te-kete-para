"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { StatusRegion } from "./status-region";
import type { RecyclingCalendarGroup } from "@/lib/schedule/rules";
import type { Weekday } from "@/lib/schedule/collection-day";

/**
 * Mirrors the JSON contract of `GET /api/suburbs/search`
 * (src/app/api/suburbs/search/route.ts, ADR 0013). Duplicated here rather
 * than imported so this client bundle never depends on a route module's
 * file (ADR 0014).
 */
export interface SuburbSearchResult {
  id: number;
  streetName: string;
  suburb: string;
  zone: string;
  isInnerCityNightCollection: boolean | null;
  recyclingCalendarGroup: RecyclingCalendarGroup | null;
  /**
   * Which real WCC weekday this address's weekly kerbside collection falls
   * on (`Date#getUTCDay()` convention), or `null` for inner-city
   * night-collection addresses (collect every night) and any suburban
   * address not yet confirmed (ADR 0063).
   */
  collectionWeekday: Weekday | null;
}

type Status = "idle" | "loading" | "done" | "empty" | "error";

const DEBOUNCE_MS = 300;

export function formatOptionLabel(result: SuburbSearchResult): string {
  return `${result.streetName}, ${result.suburb}`;
}

export interface AddressSearchProps {
  onSelect?: (address: SuburbSearchResult) => void;
}

export function AddressSearch({ onSelect }: AddressSearchProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SuburbSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const activeOptionRef = useRef<HTMLLIElement | null>(null);

  // Unmount only: cancel whatever debounce/request is still outstanding.
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  function optionId(result: SuburbSearchResult): string {
    return `${listboxId}-option-${result.id}`;
  }

  function runSearch(trimmed: string) {
    // A new query invalidates the previous results immediately: the popup
    // must not stay expanded (or keep an active descendant) over rows that
    // no longer match what the user typed.
    setResults([]);
    setActiveIndex(-1);
    setStatus("loading");
    setIsOpen(true);
    timeoutRef.current = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      fetch(`/api/suburbs/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as
            | { results: SuburbSearchResult[] }
            | { error: string };
          if (!response.ok) {
            throw new Error("suburb-search-failed");
          }
          return body as { results: SuburbSearchResult[] };
        })
        .then((body) => {
          setResults(body.results);
          setStatus(body.results.length === 0 ? "empty" : "done");
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setResults([]);
          setStatus("error");
          setActiveIndex(-1);
        });
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

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setStatus("idle");
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    runSearch(trimmed);
  }

  function selectResult(result: SuburbSearchResult) {
    cancelPending();
    setQuery(formatOptionLabel(result));
    setResults([]);
    setStatus("idle");
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect?.(result);
  }

  // Single source of truth for whether the listbox popup is showing.
  // `aria-expanded`, the listbox's `hidden` attribute, and the arrow/Enter
  // guards all derive from it, so the advertised ARIA state can never
  // contradict the DOM (SC 4.1.2): `isOpen` alone stays true through the
  // loading/empty/error states, where the popup is not visible.
  const isPopupVisible = isOpen && status === "done";

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (!isPopupVisible || results.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      if (!isPopupVisible || results.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (!isPopupVisible || activeIndex < 0) return;
      const result = results[activeIndex];
      if (!result) return;
      event.preventDefault();
      selectResult(result);
    } else if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      cancelPending();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  const STATUS_MESSAGES: Record<Status, string> = {
    idle: "",
    loading: t("address.search.loading"),
    done: t("address.search.resultsAvailable"),
    empty: t("address.search.noResults"),
    error: t("address.search.error"),
  };
  const isVisibleStatus =
    isOpen && (status === "loading" || status === "empty" || status === "error");
  const activeOption = activeIndex >= 0 ? results[activeIndex] : undefined;

  // Keeps the highlighted option visible: mainly future-proofing for once
  // the listbox gains a height constraint, but "nearest" already walks up
  // to the document today (the `<ul>` itself has no scroll container), so
  // arrowing past the fold can scroll the page even now.
  useEffect(() => {
    if (!activeOption) return;
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-papa-ink">
        {t("address.search.label")}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={isPopupVisible}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
        placeholder={t("address.search.placeholder")}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full rounded-md border border-moana/60 px-4 text-base text-papa-ink placeholder:text-papa-ink/70 touch-target focus-ring"
      />
      <StatusRegion
        as="p"
        className={isVisibleStatus ? "mt-1 text-sm text-papa-ink" : "sr-only"}
      >
        {STATUS_MESSAGES[status]}
      </StatusRegion>
      <ul
        id={listboxId}
        role="listbox"
        aria-label={t("address.search.resultsLabel")}
        hidden={!isPopupVisible}
        className="absolute z-10 mt-1 w-full max-w-md rounded-md border border-moana/60 bg-papa shadow-lg"
      >
        {results.map((result, index) => (
          <li
            key={result.id}
            id={optionId(result)}
            ref={index === activeIndex ? activeOptionRef : undefined}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectResult(result)}
            className={`flex touch-target cursor-pointer items-center px-4 text-sm ${
              index === activeIndex ? "bg-moana text-papa" : "text-papa-ink"
            }`}
          >
            {formatOptionLabel(result)}
          </li>
        ))}
      </ul>
    </div>
  );
}
