import { describe, expect, it } from 'vitest';
import { pollyHindiVoice } from './polly';

interface Sent {
  input: Record<string, unknown>;
}
const client = (
  audio: Uint8Array | null = new Uint8Array([1, 2, 3]),
): { client: { send: (command: Sent) => Promise<unknown> }; sent: Sent[] } => {
  const sent: Sent[] = [];
  return {
    sent,
    client: {
      send: (command) => {
        sent.push(command);
        return Promise.resolve(
          audio === null
            ? {}
            : { AudioStream: { transformToByteArray: () => Promise.resolve(audio) } },
        );
      },
    },
  };
};

describe('pollyHindiVoice', () => {
  it('asks Polly for the Kajal neural voice in Hindi, as an MP3 Telegram can play as a voice note', async () => {
    const { client: fake, sent } = client();
    const audio = await pollyHindiVoice({ client: fake as never })('नमस्ते');
    expect(audio).toEqual(new Uint8Array([1, 2, 3]));
    expect(sent[0]?.input).toMatchObject({
      Engine: 'neural',
      VoiceId: 'Kajal',
      LanguageCode: 'hi-IN',
      OutputFormat: 'mp3',
      Text: 'नमस्ते',
      TextType: 'text',
    });
  });

  it('refuses text too long for one voice note, instead of billing for a ramble', async () => {
    const { client: fake, sent } = client();
    await expect(pollyHindiVoice({ client: fake as never })('क'.repeat(1500))).rejects.toThrow(
      /too long/,
    );
    expect(sent).toHaveLength(0);
  });

  it('refuses empty text', async () => {
    const { client: fake } = client();
    await expect(pollyHindiVoice({ client: fake as never })('  ')).rejects.toThrow(
      /nothing to say/,
    );
  });

  it('fails when Polly returns no audio', async () => {
    const { client: fake } = client(null);
    await expect(pollyHindiVoice({ client: fake as never })('नमस्ते')).rejects.toThrow(/no audio/);
  });

  it('rule I9: gives up after the time limit instead of waiting for ever', async () => {
    const slow = { send: () => new Promise(() => undefined) };
    await expect(
      pollyHindiVoice({ client: slow as never, timeoutMs: 20 })('नमस्ते'),
    ).rejects.toThrow(/timed out/);
  });
});
