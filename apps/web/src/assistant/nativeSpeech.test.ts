import { describe, expect, it, vi } from 'vitest';
import { NativeRecognition, type SpeechPlugin } from './nativeSpeech';

function fakePlugin(over: Partial<SpeechPlugin> = {}): {
  plugin: SpeechPlugin;
  fire: (event: string, data: { matches?: string[]; status?: string }) => void;
  start: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, (d: { matches?: string[]; status?: string }) => void>();
  const start = vi.fn(() => Promise.resolve({}));
  const plugin: SpeechPlugin = {
    requestPermissions: () => Promise.resolve({ speechRecognition: 'granted' }),
    available: () => Promise.resolve({ available: true }),
    start,
    stop: () => Promise.resolve(),
    addListener: (event, handler) => {
      handlers.set(event, handler);
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
    ...over,
  };
  return { plugin, fire: (event, data) => handlers.get(event)?.(data), start };
}
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('NativeRecognition', () => {
  it('asks for the microphone, starts with the language, and passes on what is heard', async () => {
    const { plugin, fire, start } = fakePlugin();
    const r = new NativeRecognition(() => Promise.resolve(plugin));
    r.lang = 'hi-IN';
    const heard: string[] = [];
    r.onresult = (e) => {
      heard.push(e.results[0]?.[0]?.transcript ?? '');
    };
    r.start();
    await settle();
    expect(start).toHaveBeenCalledWith({
      language: 'hi-IN',
      maxResults: 1,
      partialResults: true,
      popup: false,
    });
    fire('partialResults', { matches: ['do I need'] });
    fire('partialResults', { matches: ['do I need a mask'] });
    expect(heard).toEqual(['do I need', 'do I need a mask']);
  });

  it('ends once, when the phone says it has stopped', async () => {
    const { plugin, fire } = fakePlugin();
    const r = new NativeRecognition(() => Promise.resolve(plugin));
    const ended = vi.fn();
    r.onend = ended;
    r.start();
    await settle();
    fire('listeningState', { status: 'stopped' });
    fire('listeningState', { status: 'stopped' });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('reports an error when the microphone is refused, and never starts', async () => {
    const { plugin, start } = fakePlugin({
      requestPermissions: () => Promise.resolve({ speechRecognition: 'denied' }),
    });
    const r = new NativeRecognition(() => Promise.resolve(plugin));
    const failed = vi.fn();
    r.onerror = failed;
    r.start();
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('reports an error when the phone has no recogniser, or the plugin is missing', async () => {
    const none = fakePlugin({ available: () => Promise.resolve({ available: false }) });
    const a = new NativeRecognition(() => Promise.resolve(none.plugin));
    const failedA = vi.fn();
    a.onerror = failedA;
    a.start();
    await settle();
    expect(failedA).toHaveBeenCalledTimes(1);

    const b = new NativeRecognition(() => Promise.reject(new Error('missing')));
    const failedB = vi.fn();
    b.onerror = failedB;
    b.start();
    await settle();
    expect(failedB).toHaveBeenCalledTimes(1);
  });
});
