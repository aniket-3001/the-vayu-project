// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenLive, pollyVoice, spokenPart, type Voice } from './speech';

describe('spokenPart', () => {
  it('leaves a short answer alone, and cuts a long one at the end of a sentence', () => {
    expect(spokenPart('Yes. Wear an N95.')).toBe('Yes. Wear an N95.');
    const long = 'Keep the windows shut today. '.repeat(20);
    const part = spokenPart(long, 100);
    expect(part.length).toBeLessThanOrEqual(100);
    expect(part.endsWith('.')).toBe(true);
  });

  it('collapses the spaces and never returns more than the limit', () => {
    expect(spokenPart('a   b \n c')).toBe('a b c');
    expect(spokenPart('x'.repeat(900)).length).toBeLessThanOrEqual(400);
  });
});

const answer = (audio = 'QUJD', ok = true): Response =>
  ({
    ok,
    json: () => Promise.resolve({ audio, voice: 'Kajal', characters: 5, cached: false }),
  }) as Response;

/** One audio element that records what it was given, and plays to the end at once, or refuses. */
function player(refuse = false): {
  make: () => HTMLAudioElement;
  sources: string[];
  plays: number;
  pauses: number;
} {
  const state = { sources: [] as string[], plays: 0, pauses: 0 };
  const element = {
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    set src(value: string) {
      state.sources.push(value);
    },
    pause: () => {
      state.pauses += 1;
    },
    play: () => {
      state.plays += 1;
      if (refuse) return Promise.reject(new Error('NotAllowedError'));
      queueMicrotask(() => element.onended?.());
      return Promise.resolve();
    },
  };
  return {
    get sources() {
      return state.sources;
    },
    get plays() {
      return state.plays;
    },
    get pauses() {
      return state.pauses;
    },
    make: () => element as unknown as HTMLAudioElement,
  };
}

const quiet = (): Voice & { said: string[] } => {
  const said: string[] = [];
  return {
    said,
    speak: (text) => {
      said.push(text);
      return Promise.resolve();
    },
    stop: () => undefined,
  };
};

describe('the Polly voice', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:answer'),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the words to /v1/speech and plays the MP3 from a blob address, which the page’s policy allows', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer()));
    const audio = player();
    const fallback = quiet();
    await pollyVoice('https://x.test/', fetchImpl, fallback, audio.make).speak('Do wear a mask.');
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/v1/speech');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Do wear a mask.' });
    expect(audio.sources).toEqual(['blob:answer']);
    expect(audio.plays).toBe(1);
    expect(fallback.said).toEqual([]);
  });

  it('starts one audio element from a tap with a moment of silence, so a phone lets the answer play later', async () => {
    const audio = player();
    const voice = pollyVoice(
      'https://x.test',
      () => Promise.resolve(answer()),
      quiet(),
      audio.make,
    );
    voice.unlock?.();
    expect(audio.plays).toBe(1);
    await voice.speak('Open the windows after four.');
    // The answer was played on the same element that was unlocked.
    expect(audio.plays).toBe(2);
  });

  it('reads it with the browser’s voice when the service is off, over its limit, down or sends rubbish', async () => {
    for (const fetchImpl of [
      vi.fn(() => Promise.resolve(answer('', false))),
      vi.fn(() => Promise.reject(new Error('offline'))),
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ nope: 1 }) } as Response),
      ),
    ]) {
      const fallback = quiet();
      await pollyVoice('https://x.test', fetchImpl, fallback, player().make).speak('Hello there.');
      expect(fallback.said).toEqual(['Hello there.']);
    }
  });

  it('reads it with the browser’s voice when the browser refuses to play the audio, and is never silent', async () => {
    const fallback = quiet();
    await pollyVoice(
      'https://x.test',
      () => Promise.resolve(answer()),
      fallback,
      player(true).make,
    ).speak('Wear a mask outside.');
    expect(fallback.said).toEqual(['Wear a mask outside.']);
  });

  it('does not play an answer that was overtaken: starting again or stopping wins', async () => {
    let release: (value: Response) => void = () => undefined;
    const slow = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const audio = player();
    const fallback = quiet();
    const voice = pollyVoice('https://x.test', () => slow, fallback, audio.make);
    const first = voice.speak('Old answer.');
    voice.stop();
    release(answer());
    await first;
    expect(audio.sources).toEqual([]);
    expect(fallback.said).toEqual([]);
  });

  it('says nothing for empty words and asks for no more than 400 characters', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer()));
    const voice = pollyVoice('https://x.test', fetchImpl, quiet(), player().make);
    await voice.speak('   ');
    expect(fetchImpl).not.toHaveBeenCalled();
    await voice.speak('Word. '.repeat(200));
    const body = JSON.parse(
      ((fetchImpl.mock.calls[0] ?? []) as unknown as [string, RequestInit])[1].body as string,
    ) as { text: string };
    expect(body.text.length).toBeLessThanOrEqual(400);
  });
});

describe('listening', () => {
  interface Fake {
    onresult: ((event: { results: unknown[] }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    stops: number;
    aborts: number;
  }
  const made: Fake[] = [];
  let clock = 0;
  const latest = (): Fake | undefined => made.at(-1);
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    made.length = 0;
    class Recognition implements Fake {
      onresult: Fake['onresult'] = null;
      onend: Fake['onend'] = null;
      onerror: Fake['onerror'] = null;
      stops = 0;
      aborts = 0;
      lang = '';
      continuous = false;
      interimResults = false;
      constructor() {
        made.push(this);
      }
      start(): void {
        // Listening begins at once; there is nothing to do.
      }
      stop(): void {
        this.stops += 1;
        this.onend?.();
      }
      abort(): void {
        this.aborts += 1;
        this.onend?.();
      }
    }
    vi.stubGlobal('webkitSpeechRecognition', Recognition);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const tick = (ms: number): void => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  };
  const said = (text: string): { results: unknown[] } => ({ results: [[{ transcript: text }]] });

  it('shows the words as they come, in the language of India, with interim results', () => {
    const seen: string[] = [];
    listenLive({ onTranscript: (t) => seen.push(t), onEnd: () => undefined, now: () => clock });
    expect(latest()).toMatchObject({ lang: 'en-IN', continuous: true, interimResults: true });
    latest()?.onresult?.(said('is it'));
    latest()?.onresult?.(said('is it safe'));
    expect(seen).toEqual(['is it', 'is it safe']);
  });

  it('stops by itself a few seconds after the person goes quiet, and gives what was said', () => {
    const ended = vi.fn();
    listenLive({ onTranscript: () => undefined, onEnd: ended, now: () => clock });
    tick(1_000);
    latest()?.onresult?.(said('open the windows'));
    tick(2_000);
    expect(latest()?.stops).toBe(0);
    tick(1_000);
    expect(latest()?.stops).toBe(1);
    expect(ended).toHaveBeenCalledWith('open the windows');
  });

  it('keeps going while words keep coming, since each one starts the quiet again', () => {
    const ended = vi.fn();
    listenLive({ onTranscript: () => undefined, onEnd: ended, now: () => clock });
    for (const words of ['is', 'is it', 'is it a', 'is it a good', 'is it a good time']) {
      latest()?.onresult?.(said(words));
      tick(2_000);
    }
    expect(latest()?.stops).toBe(0);
    tick(1_000);
    expect(ended).toHaveBeenCalledWith('is it a good time');
  });

  it('gives up, and lets go of the microphone, when nothing is said at all', () => {
    const ended = vi.fn();
    listenLive({ onTranscript: () => undefined, onEnd: ended, now: () => clock });
    tick(5_500);
    expect(latest()?.stops).toBe(0);
    tick(1_000);
    expect(latest()?.stops).toBe(1);
    expect(ended).toHaveBeenCalledWith(undefined);
  });

  it('never listens longer than half a minute', () => {
    const ended = vi.fn();
    listenLive({ onTranscript: () => undefined, onEnd: ended, now: () => clock });
    for (let i = 0; i < 60 && latest()?.stops === 0; i++) {
      latest()?.onresult?.(said(`word ${String(i)}`));
      tick(1_000);
    }
    expect(latest()?.stops).toBe(1);
    expect(clock).toBeLessThanOrEqual(31_000);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('cancelling ends it at once and gives nothing', () => {
    const ended = vi.fn();
    const listening = listenLive({ onTranscript: () => undefined, onEnd: ended, now: () => clock });
    latest()?.onresult?.(said('something'));
    listening?.cancel();
    expect(latest()?.aborts).toBe(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith(undefined);
  });

  it('is not offered when the browser cannot recognise speech', () => {
    vi.unstubAllGlobals();
    expect(listenLive({ onTranscript: () => undefined, onEnd: () => undefined })).toBeUndefined();
  });
});
