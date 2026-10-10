import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

/** Turns text into audio. Polly in production, a stub in tests. */
export type Voice = (text: string) => Promise<Uint8Array>;

export interface PollyHindiOptions {
  readonly client?: Pick<PollyClient, 'send'>;
  readonly region?: string;
  /** Rule I9: how long to wait for Polly before giving up. */
  readonly timeoutMs?: number;
}

/** A voice note is a few sentences. This keeps one far under Polly's 3,000-character limit. */
const MAX_CHARACTERS = 1000;

/**
 * Polly's Kajal voice (neural, Hindi), as MP3: Telegram plays MP3 as a voice note. Kajal is
 * available in Mumbai (ap-south-1), checked on 4 October 2026.
 */
export function pollyHindiVoice(options: PollyHindiOptions = {}): Voice {
  const client = options.client ?? new PollyClient({ region: options.region ?? 'ap-south-1' });
  const timeoutMs = options.timeoutMs ?? 5000;
  return async (text) => {
    if (text.trim() === '') throw new Error('There is nothing to say');
    if (text.length > MAX_CHARACTERS) {
      throw new Error(
        `The text is too long for one voice note (${String(text.length)} characters)`,
      );
    }
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Polly timed out'));
      }, timeoutMs);
    });
    try {
      const synthesis = (async (): Promise<Uint8Array> => {
        const out = await client.send(
          new SynthesizeSpeechCommand({
            Engine: 'neural',
            VoiceId: 'Kajal',
            LanguageCode: 'hi-IN',
            OutputFormat: 'mp3',
            Text: text,
            TextType: 'text',
          }),
        );
        const bytes = await out.AudioStream?.transformToByteArray();
        if (bytes === undefined) throw new Error('Polly returned no audio');
        return bytes;
      })();
      return await Promise.race([synthesis, limit]);
    } finally {
      clearTimeout(timer);
    }
  };
}
