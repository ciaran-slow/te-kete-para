"use client";

import { useSyncExternalStore } from "react";

/**
 * Feature-detects the Web Speech API's SpeechRecognition constructor
 * (ADR 0027). Reads `window` directly, so it must go through
 * useSyncExternalStore — not useState+useEffect — to stay hydration-safe:
 * the server has no `window` at all (getServerSnapshot returns false,
 * matching every render up to and including the first client render), and
 * the client's real snapshot is picked up in the same post-hydration tick
 * React already reserves for useSyncExternalStore mismatches. A
 * useEffect+setState version would violate this repo's
 * react-hooks/set-state-in-effect lint rule (ADR 0009 rejected exactly
 * this shape for locale) and would still race hydration.
 *
 * The subscription genuinely never fires — support cannot change during a
 * page's lifetime — so `subscribe` returns a no-op unsubscribe and is
 * still supplied because useSyncExternalStore requires one.
 */
function subscribe(): () => void {
  return () => {};
}

export function getSpeechRecognitionConstructor():
  | SpeechRecognitionConstructor
  | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function getSnapshot(): boolean {
  return getSpeechRecognitionConstructor() !== undefined;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSpeechRecognitionSupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
