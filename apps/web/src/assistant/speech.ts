/** Speaks an answer. Plays the Amazon Polly file if there is one; otherwise uses the browser's own voice. */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let playing: HTMLAudioElement | undefined;

export function stopSpeaking(): void {
  playing?.pause();
  playing = undefined;
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speak(text: string, audioUrl?: string): void {
  stopSpeaking();
  if (audioUrl !== undefined) {
    playing = new Audio(audioUrl);
    void playing.play().catch(() => undefined);
    return;
  }
  if (!canSpeak()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.rate = 0.98;
  window.speechSynthesis.speak(utterance);
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
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

/** Listens once, with the browser's speech recognition, and gives back what was said, or nothing. */
export function listen(): Promise<string | undefined> {
  const Recogniser = recognitionClass();
  if (Recogniser === undefined) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const r = new Recogniser();
    r.lang = 'en-IN';
    r.interimResults = false;
    let heard: string | undefined;
    r.onresult = (event) => {
      heard = event.results[0]?.[0]?.transcript;
    };
    r.onerror = () => {
      resolve(undefined);
    };
    r.onend = () => {
      resolve(heard);
    };
    r.start();
  });
}
