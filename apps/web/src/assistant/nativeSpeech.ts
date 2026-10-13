import { isNative } from '../native/splash';

/** What the phone app's speech plugin gives, narrowed to what is used, so a test can pass a fake. */
export interface SpeechPlugin {
  requestPermissions(): Promise<{ speechRecognition: string }>;
  available(): Promise<{ available: boolean }>;
  start(options: {
    language: string;
    maxResults: number;
    partialResults: boolean;
    popup: boolean;
  }): Promise<unknown>;
  stop(): Promise<void>;
  addListener(
    event: 'partialResults' | 'listeningState',
    handler: (data: { matches?: string[]; status?: string }) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

/**
 * The plugin is imported only behind the build flag, which the website's build replaces with a constant, so the website
 * ships none of it. Android's web view has no speech recogniser of its own, so the phone app uses the phone's.
 */
const loadPlugin = async (): Promise<SpeechPlugin> => {
  if (import.meta.env.VITE_NATIVE !== 'true') throw new Error('Not the phone app.');
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  return SpeechRecognition;
};

/** The same shape as the browser's recogniser, which is what the assistant's listening is written against. */
export class NativeRecognition {
  lang = 'en-IN';
  continuous = true;
  interimResults = true;
  onresult:
    | ((event: {
        results: ArrayLike<{ length: number; [i: number]: { transcript: string } }>;
      }) => void)
    | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  private plugin: SpeechPlugin | undefined;
  private handles: { remove(): Promise<void> }[] = [];
  private over = false;

  constructor(private readonly load: () => Promise<SpeechPlugin> = loadPlugin) {}

  start(): void {
    void this.run();
  }

  stop(): void {
    void this.plugin?.stop().catch(() => undefined);
    // The phone says it has stopped; if it never does, this ends it all the same.
    window.setTimeout(() => {
      this.finish(false);
    }, 1500);
  }

  abort(): void {
    this.stop();
  }

  private finish(failed: boolean): void {
    if (this.over) return;
    this.over = true;
    const handles = this.handles;
    this.handles = [];
    for (const handle of handles) void handle.remove().catch(() => undefined);
    if (failed) this.onerror?.();
    else this.onend?.();
  }

  private async run(): Promise<void> {
    try {
      const plugin = await this.load();
      this.plugin = plugin;
      const permission = await plugin.requestPermissions();
      if (permission.speechRecognition !== 'granted') {
        this.finish(true);
        return;
      }
      if (!(await plugin.available()).available) {
        this.finish(true);
        return;
      }
      this.handles.push(
        await plugin.addListener('partialResults', (data) => {
          const transcript = data.matches?.[0] ?? '';
          this.onresult?.({ results: [{ length: 1, 0: { transcript } }] });
        }),
        await plugin.addListener('listeningState', (data) => {
          if (data.status === 'stopped') this.finish(false);
        }),
      );
      await plugin.start({
        language: this.lang,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });
    } catch {
      this.finish(true);
    }
  }
}

export const nativeListening = (): boolean => isNative();
