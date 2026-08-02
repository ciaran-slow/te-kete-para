/**
 * Ambient global declarations for the Web Speech API's SpeechRecognition
 * surface (ADR 0027). TypeScript's bundled lib.dom.d.ts ships no types for
 * it — it is still an experimental API — so this file declares only the
 * minimal shape this app uses, instead of pulling in a third-party
 * `@types` package. No imports/exports: TypeScript treats the file as a
 * global augmentation, the same way `next-env.d.ts` works.
 */

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionResultItem {
  0: SpeechRecognitionResultLike;
  length: number;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResultItem;
  length: number;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
