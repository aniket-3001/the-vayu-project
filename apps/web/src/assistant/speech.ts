import { SpeechReply } from '@vayu/contracts';

/** The most that is read aloud in one go: the voice service takes 400 characters at a time. */
export const MAX_SPOKEN = 400;

/** The first sentences that fit, so a long answer is cut where a sentence ends and not in the middle of a word. */
export function spokenPart(text: string, limit = MAX_SPOKEN): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > 40 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')).trimEnd();
}

export interface Voice {
  /** Reads the words aloud; resolves when it has finished or could not. Starting again stops what was playing. */
  speak(text: string): Promise<void>;
  stop(): void;
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** The browser's own voice: always there, and not as pleasant. The fallback. */
export function browserVoice(): Voice {
  return {
    speak(text) {
      if (!canSpeak()) return Promise.resolve();
      window.speechSynthesis.cancel();
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(spokenPart(text));
        utterance.lang = 'en-IN';
        utterance.rate = 0.98;
        // Prefer a woman's voice for English in India when the browser has one.
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) => /en[-_]IN/u.test(v.lang) && /female|heera|veena|neerja|kajal/iu.test(v.name),
        );
        if (preferred !== undefined) utterance.voice = preferred;
        utterance.onend = () => {
          resolve();
        };
        utterance.onerror = () => {
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      });
    },
    stop() {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
  };
}

/**
 * Amazon Polly's Kajal, a woman's voice, through our API (`POST /v1/speech`). If the API cannot be reached, is
 * switched off or has reached its limit for the day, the browser's voice reads it instead, so an answer is never silent.
 */
export function pollyVoice(
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  fallback: Voice = browserVoice(),
  makeAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src),
): Voice {
  let playing: HTMLAudioElement | undefined;
  let turn = 0;
  const stop = (): void => {
    turn += 1;
    playing?.pause();
    playing = undefined;
    fallback.stop();
  };
  return {
    stop,
    async speak(text) {
      stop();
      const mine = turn;
      const words = spokenPart(text);
      if (words === '') return;
      let audio: string | undefined;
      try {
        const res = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/v1/speech`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: words }),
        });
        if (res.ok) audio = SpeechReply.parse(await res.json()).audio;
      } catch {
        audio = undefined;
      }
      // Something else was started, or it was stopped, while this was on its way.
      if (mine !== turn) return;
      if (audio === undefined) {
        await fallback.speak(words);
        return;
      }
      const element = makeAudio(`data:audio/mpeg;base64,${audio}`);
      playing = element;
      await new Promise<void>((resolve) => {
        element.onended = () => {
          resolve();
        };
        element.onerror = () => {
          resolve();
        };
        element.play().catch(() => {
          resolve();
        });
      });
      if (playing === element) playing = undefined;
    },
  };
}

interface RecognitionResult {
  readonly length: number;
  readonly [index: number]: { readonly transcript: string } | undefined;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => Recognition;

const recognitionClass = (): RecognitionConstructor | undefined => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const canListen = (): boolean =>
  typeof window !== 'undefined' && recognitionClass() !== undefined;

export interface Listening {
  /** Ends it now and gives what was heard so far. The microphone is released. */
  stop(): void;
  /** Ends it now and gives nothing. */
  cancel(): void;
}

export interface ListenOptions {
  /** Each time the words heard so far change, so they can be shown as they are understood. */
  readonly onTranscript: (text: string) => void;
  /** Once, when it is over, with all that was heard, or nothing if nothing was. */
  readonly onEnd: (heard: string | undefined) => void;
  /** Quiet after speech that ends it. */
  readonly silenceMs?: number;
  /** Quiet before anything is said that ends it. */
  readonly noSpeechMs?: number;
  /** The longest it may listen. */
  readonly maxMs?: number;
  readonly now?: () => number;
}

/**
 * Listens with the browser's speech recognition, showing the words as they come, and stops by itself: a few seconds
 * after the person goes quiet, a little longer if they never start, and at the latest after half a minute. Stopping
 * ends the recognition, which lets go of the microphone.
 */
export function listenLive(options: ListenOptions): Listening | undefined {
  const Recogniser = recognitionClass();
  if (Recogniser === undefined) return undefined;
  const now = options.now ?? Date.now;
  const silenceMs = options.silenceMs ?? 2_500;
  const noSpeechMs = options.noSpeechMs ?? 6_000;
  const maxMs = options.maxMs ?? 30_000;
  const r = new Recogniser();
  r.lang = 'en-IN';
  r.continuous = true;
  r.interimResults = true;
  const began = now();
  let lastHeard = began;
  let heard = '';
  let finished = false;
  let discard = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearInterval(watch);
    const text = heard.trim();
    options.onEnd(discard || text === '' ? undefined : text);
  };
  const watch = window.setInterval(() => {
    const t = now();
    const quiet = t - lastHeard;
    if (
      (heard.trim() !== '' && quiet >= silenceMs) ||
      (heard.trim() === '' && t - began >= noSpeechMs) ||
      t - began >= maxMs
    )
      r.stop();
  }, 250);

  r.onresult = (event) => {
    let text = '';
    for (const result of Array.from(event.results)) text += result[0]?.transcript ?? '';
    if (text !== heard) {
      heard = text;
      lastHeard = now();
      options.onTranscript(text);
    }
  };
  r.onerror = finish;
  r.onend = finish;
  r.start();
  return {
    stop: () => {
      r.stop();
    },
    cancel: () => {
      discard = true;
      r.abort();
      finish();
    },
  };
}
