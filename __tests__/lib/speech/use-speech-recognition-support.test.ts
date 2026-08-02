import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import {
  getSpeechRecognitionConstructor,
  useSpeechRecognitionSupport,
} from "../../../src/lib/speech/use-speech-recognition-support";

/* Minimal constructor doubles: the detection code only checks presence on
   window, never instantiates, so an empty class is enough here. */
class FakeSpeechRecognition {}
class FakeWebkitSpeechRecognition {}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("getSpeechRecognitionConstructor", () => {
  test("returns undefined when neither window.SpeechRecognition nor window.webkitSpeechRecognition is set", () => {
    expect(window.SpeechRecognition).toBeUndefined();
    expect(window.webkitSpeechRecognition).toBeUndefined();
    expect(getSpeechRecognitionConstructor()).toBeUndefined();
  });

  test("returns the constructor when window.SpeechRecognition is set", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    expect(getSpeechRecognitionConstructor()).toBe(FakeSpeechRecognition);
  });

  test("returns the webkit-prefixed constructor when only it is set, preferring SpeechRecognition when both are present", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeWebkitSpeechRecognition);
    expect(getSpeechRecognitionConstructor()).toBe(FakeWebkitSpeechRecognition);

    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    expect(getSpeechRecognitionConstructor()).toBe(FakeSpeechRecognition);
  });
});

describe("useSpeechRecognitionSupport", () => {
  test("returns true when the constructor is present at render time and false when absent", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    const supported = renderHook(() => useSpeechRecognitionSupport());
    expect(supported.result.current).toBe(true);
    supported.unmount();

    /* Repetition: prove the hook re-evaluates per mount rather than caching
       a stale first answer. */
    vi.unstubAllGlobals();
    const unsupported = renderHook(() => useSpeechRecognitionSupport());
    expect(unsupported.result.current).toBe(false);
  });
});
