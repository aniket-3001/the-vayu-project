import { SpeechReply } from '@vayu/contracts';
import { SPEECH_TAG, type Lang } from './lang';

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
  speak(text: string, lang?: Lang): Promise<void>;
  stop(): void;
  /** Called from a tap, before the answer arrives, so a phone lets the answer be spoken. */
  unlock?(): void;
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** The browser's own voice: always there, and not as pleasant. The fallback. */
export function browserVoice(): Voice {
  return {
    speak(text, lang = 'en') {
      if (!canSpeak()) return Promise.resolve();
      window.speechSynthesis.cancel();
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(spokenPart(text));
        utterance.lang = SPEECH_TAG[lang];
        utterance.rate = 0.98;
        // Prefer a woman's voice for the language, in India, when the browser has one; Hindi falls to any Hindi voice.
        const voices = window.speechSynthesis.getVoices();
        const tag = lang === 'hi' ? /hi[-_]IN/u : /en[-_]IN/u;
        const preferred =
          voices.find(
            (v) => tag.test(v.lang) && /female|heera|veena|neerja|kajal|swara|lekha/iu.test(v.name),
          ) ?? (lang === 'hi' ? voices.find((v) => tag.test(v.lang)) : undefined);
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
    unlock() {
      // Phones allow speech only once a tap has started some; an empty word does that without a sound.
      if (!canSpeak()) return;
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    },
  };
}

/** A tenth of a second of silence as a WAV file, to start an audio element from a tap so it may play later. */
function silence(): Blob {
  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

/** MP3 bytes from base64, as a `blob:` address: the page's content policy allows media from blob: and not data:. */
function mp3Address(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
}

/**
 * Amazon Polly's Kajal, a woman's voice, through our API (`POST /v1/speech`). If the API cannot be reached, is
 * switched off or has reached its limit for the day, or the browser will not play it, the browser's voice reads it
 * instead, so an answer is never silent.
 *
 * Phones only let a page play sound that a tap started, and a spoken answer arrives after a wait. So `unlock()`,
 * which the screen calls from the tap itself, starts one audio element on a moment of silence; later answers are
 * played on that same element.
 */
export function pollyVoice(
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  fallback: Voice = browserVoice(),
  makeAudio: () => HTMLAudioElement = () => new Audio(),
): Voice {
  let element: HTMLAudioElement | undefined;
  let address: string | undefined;
  let turn = 0;
  const audio = (): HTMLAudioElement => {
    element ??= makeAudio();
    return element;
  };
  const release = (): void => {
    if (address !== undefined) URL.revokeObjectURL(address);
    address = undefined;
  };
  const stop = (): void => {
    turn += 1;
    element?.pause();
    release();
    fallback.stop();
  };
  return {
    stop,
    unlock() {
      const el = audio();
      const quiet = URL.createObjectURL(silence());
      el.src = quiet;
      void el
        .play()
        .catch(() => undefined)
        .finally(() => {
          URL.revokeObjectURL(quiet);
        });
      fallback.unlock?.();
    },
    async speak(text, lang = 'en') {
      stop();
      const mine = turn;
      const words = spokenPart(text);
      if (words === '') return;
      let base64: string | undefined;
      try {
        const res = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/v1/speech`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: words, ...(lang === 'hi' ? { lang } : {}) }),
        });
        if (res.ok) base64 = SpeechReply.parse(await res.json()).audio;
      } catch {
        base64 = undefined;
      }
      // Something else was started, or it was stopped, while this was on its way.
      if (mine !== turn) return;
      if (base64 === undefined) {
        await fallback.speak(words, lang);
        return;
      }
      const el = audio();
      const state = { played: false };
      try {
        release();
        address = mp3Address(base64);
        el.src = address;
        await new Promise<void>((resolve, reject) => {
          el.onended = () => {
            resolve();
          };
          el.onerror = () => {
            reject(new Error('The audio could not be played'));
          };
          el.play().then(() => {
            state.played = true;
          }, reject);
        });
      } catch {
        // The browser would not play it. Read it with the browser's own voice instead of staying silent.
        if (!state.played && mine === turn) await fallback.speak(words, lang);
      }
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
  /** The language to listen for: English (India) by default, or Hindi. */
  readonly lang?: Lang;
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
  r.lang = SPEECH_TAG[options.lang ?? 'en'];
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
