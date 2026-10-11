import { fixedClock } from '@vayu/core';
import { describe, expect, it, vi } from 'vitest';
import { memoryQuota } from './quota';
import { handleSpeech, SPEECH_LIMITS, type SpeechStore } from './speechRoute';

const setup = (
  enabled = true,
): {
  voice: ReturnType<typeof vi.fn>;
  voiceHindi: ReturnType<typeof vi.fn>;
  quota: ReturnType<typeof memoryQuota>;
  kept: Map<string, string>;
  post: (body: unknown, ip?: string, method?: string) => ReturnType<typeof handleSpeech>;
} => {
  const voice = vi.fn((text: string) => Promise.resolve(new TextEncoder().encode(`mp3:${text}`)));
  const quota = memoryQuota();
  const kept = new Map<string, string>();
  const store: SpeechStore = {
    get: (key) => Promise.resolve(kept.get(key)),
    put: (key, audio) => {
      kept.set(key, audio);
      return Promise.resolve();
    },
  };
  const voiceHindi = vi.fn((text: string) =>
    Promise.resolve(new TextEncoder().encode(`hindi-mp3:${text}`)),
  );
  const deps = {
    voice,
    voiceHindi,
    enabled: () => Promise.resolve(enabled),
    quota,
    store,
    clock: fixedClock('2026-10-10T12:00:00.000Z'),
    salt: 'pepper',
  };
  const post = (body: unknown, ip = '1.2.3.4', method = 'POST'): ReturnType<typeof handleSpeech> =>
    handleSpeech(
      {
        method,
        path: '/v1/speech',
        query: {},
        headers: {},
        body: typeof body === 'string' ? body : JSON.stringify(body),
        sourceIp: ip,
      },
      deps,
    );
  return { voice, voiceHindi, quota, kept, post };
};

describe('POST /v1/speech', () => {
  it('reads the words aloud in the one voice, as MP3 in base64', async () => {
    const { post, voice } = setup();
    const reply = await post({ text: 'Do you need a mask? Yes.' });
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ voice: 'Kajal', characters: 24, cached: false });
    const audio = (reply.body as { audio: string }).audio;
    expect(Buffer.from(audio, 'base64').toString()).toBe('mp3:Do you need a mask? Yes.');
    expect(voice).toHaveBeenCalledTimes(1);
  });

  it('keeps what it said: the same words a second time cost no voice and no allowance', async () => {
    const { post, voice, quota } = setup();
    await post({ text: 'Open the windows after four.' });
    const used = quota.used(`speech#all#2026-10-10`);
    const again = await post({ text: 'Open the windows after four.' }, '9.9.9.9');
    expect(again.body).toMatchObject({ cached: true });
    expect(voice).toHaveBeenCalledTimes(1);
    expect(quota.used('speech#all#2026-10-10')).toBe(used);
  });

  it('refuses anything outside the contract before it reaches the voice', async () => {
    const { post, voice } = setup();
    expect(await post({ text: '' })).toMatchObject({ statusCode: 400 });
    expect(await post({ text: 'x'.repeat(SPEECH_LIMITS.maxCharacters + 1) })).toMatchObject({
      statusCode: 400,
    });
    expect(await post({ text: 'hello', extra: 1 })).toMatchObject({ statusCode: 400 });
    expect(await post('not json')).toMatchObject({ statusCode: 400 });
    expect(await post({ text: 'x'.repeat(5000) })).toMatchObject({ statusCode: 413 });
    expect(voice).not.toHaveBeenCalled();
  });

  it('is off when the kill switch is off: no voice, and a status the app understands', async () => {
    const { post, voice } = setup(false);
    expect(await post({ text: 'hello' })).toMatchObject({
      statusCode: 503,
      body: { error: { code: 'speech_off' } },
    });
    expect(voice).not.toHaveBeenCalled();
  });

  it('counts characters: one caller may have 12,000 a day, and everyone 60,000', async () => {
    const { post } = setup();
    const text = (n: number): string => `${String(n).padStart(3, '0')}${'a'.repeat(297)}`;
    // Forty distinct 300-character answers fill one caller's day.
    const fits = SPEECH_LIMITS.perCallerPerDay / 300;
    for (let i = 0; i < fits; i++) expect((await post({ text: text(i) })).statusCode).toBe(200);
    expect(await post({ text: text(99) })).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'too_many_requests' } },
    });
    // Another caller still gets in.
    expect((await post({ text: text(1000) }, '5.6.7.8')).statusCode).toBe(200);

    const crowd = setup();
    let spoken = 0;
    for (let i = 0; spoken < SPEECH_LIMITS.perDay; i++) {
      const reply = await crowd.post({ text: text(i) }, `10.${String(i)}.0.1`);
      if (reply.statusCode !== 200) break;
      spoken += 300;
    }
    expect(spoken).toBe(SPEECH_LIMITS.perDay - (SPEECH_LIMITS.perDay % 300));
    expect(await crowd.post({ text: text(9999) }, '9.9.9.9')).toMatchObject({
      statusCode: 429,
      body: { error: { code: 'busy' } },
    });
  });

  it('says the voice failed, rather than crash, so the app can use the browser’s voice', async () => {
    const { post, voice } = setup();
    voice.mockRejectedValueOnce(new Error('Polly timed out'));
    expect(await post({ text: 'hello there' })).toMatchObject({
      statusCode: 502,
      body: { error: { code: 'voice_failed' } },
    });
  });

  it('only takes a POST', async () => {
    const { post } = setup();
    expect(await post({ text: 'hello' }, '1.2.3.4', 'GET')).toMatchObject({ statusCode: 405 });
  });

  it('speaks Hindi in the Hindi voice, and keeps it apart from the same text in English', async () => {
    const { post, voice, voiceHindi } = setup();
    const hi = await post({ text: 'खिड़कियाँ बंद रखें।', lang: 'hi' });
    expect(hi.statusCode).toBe(200);
    const audio = (hi.body as { audio: string }).audio;
    expect(Buffer.from(audio, 'base64').toString()).toBe('hindi-mp3:खिड़कियाँ बंद रखें।');
    expect(voiceHindi).toHaveBeenCalledTimes(1);
    expect(voice).not.toHaveBeenCalled();
    // The same words asked for in English are not served from the Hindi audio.
    await post({ text: 'खिड़कियाँ बंद रखें।', lang: 'en' });
    expect(voice).toHaveBeenCalledTimes(1);
  });

  it('refuses a language it is not given a voice for, so the browser can read it', async () => {
    const quota = memoryQuota();
    const reply = await handleSpeech(
      {
        method: 'POST',
        path: '/v1/speech',
        query: {},
        headers: {},
        body: JSON.stringify({ text: 'नमस्ते', lang: 'hi' }),
        sourceIp: '1.1.1.1',
      },
      {
        voice: () => Promise.resolve(new Uint8Array()),
        enabled: () => Promise.resolve(true),
        quota,
        store: { get: () => Promise.resolve(undefined), put: () => Promise.resolve() },
        clock: fixedClock('2026-10-10T12:00:00.000Z'),
        salt: 'pepper',
      },
    );
    expect(reply.statusCode).toBe(503);
  });
});
