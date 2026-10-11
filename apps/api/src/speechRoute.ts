import { createHash } from 'node:crypto';
import { SpeechRequest } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import type { Voice } from '@vayu/watch';
import type { Switch } from './killSwitch';
import { dayKey, type Quota } from './quota';
import { failure, ok, type ApiRequest, type ApiResponse } from './respond';

/** Kept words, by what was said: so the same answer spoken twice costs nothing the second time. */
export interface SpeechStore {
  get(key: string): Promise<string | undefined>;
  put(key: string, audioBase64: string, ttlSeconds: number): Promise<void>;
}

export interface SpeechDeps {
  /** Speaks Indian English. */
  readonly voice: Voice;
  /** Speaks Hindi (the same voice, Kajal). Absent: Hindi is not spoken and the app's browser voice reads it. */
  readonly voiceHindi?: Voice | undefined;
  /** The same kill switch as the assistant: off, and nothing is spoken. */
  readonly enabled: Switch;
  readonly quota: Quota;
  readonly store: SpeechStore;
  readonly clock: Clock;
  readonly salt: string;
}

/**
 * What the voice may spend. Polly's neural voice is $0.000016 a character, so these limits are the most it can cost:
 * 60,000 characters a day is $0.96, which is about $29 a month if it were used to the limit every day.
 */
export const SPEECH_LIMITS = {
  maxCharacters: 400,
  /** Characters one caller may have spoken in a day (about fifty answers), and the whole service. */
  perCallerPerDay: 12_000,
  perDay: 60_000,
  /** How long to keep a spoken answer for the same words again. */
  keepSeconds: 86_400,
} as const;

const DAY_SECONDS = 2 * 86_400;
const MAX_BODY = 2_000;
export const VOICE_NAME = 'Kajal';

/**
 * `POST /v1/speech`: reads an answer aloud in a woman's voice (Amazon Polly, Kajal). Words that were spoken lately
 * are served from the store and cost nothing. New words are counted, in characters, against a limit for the caller
 * and for the day, and the kill switch turns it off at once. With it off or a limit reached the route says so with a
 * status the app understands, and the app falls back to the browser's own voice.
 */
export async function handleSpeech(request: ApiRequest, deps: SpeechDeps): Promise<ApiResponse> {
  if (request.method !== 'POST')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const body = request.body ?? '';
  if (body.length > MAX_BODY) return failure(413, 'too_large', 'That is too long to read aloud.');
  let raw: unknown;
  try {
    raw = JSON.parse(body === '' ? '{}' : body);
  } catch {
    return failure(400, 'invalid_body', 'The request body is not valid JSON');
  }
  const parsed = SpeechRequest.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(
      400,
      'invalid_request',
      first?.message ?? 'The request is not valid',
      first === undefined || first.path.length === 0 ? undefined : first.path.join('.'),
    );
  }
  const { text } = parsed.data;
  const lang = parsed.data.lang ?? 'en';
  const speak = lang === 'hi' ? deps.voiceHindi : deps.voice;
  if (speak === undefined)
    return failure(503, 'speech_off', 'This language is not spoken here. The browser can read it.');

  if (!(await deps.enabled()))
    return failure(503, 'speech_off', 'The voice is switched off right now.');

  const key = `SPEECH#${createHash('sha256').update(`${VOICE_NAME}|${lang}|${text}`).digest('hex')}`;
  const kept = await deps.store.get(key);
  if (kept !== undefined)
    return ok({ audio: kept, voice: VOICE_NAME, characters: text.length, cached: true });

  const now = deps.clock.now();
  const day = dayKey(now);
  const caller = createHash('sha256')
    .update(`${deps.salt}|${day}|${request.sourceIp ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 16);
  if (
    !(await deps.quota.take(
      `speech#caller#${day}#${caller}`,
      SPEECH_LIMITS.perCallerPerDay,
      DAY_SECONDS,
      text.length,
    ))
  )
    return failure(429, 'too_many_requests', 'You have used today’s spoken answers.');
  if (!(await deps.quota.take(`speech#all#${day}`, SPEECH_LIMITS.perDay, DAY_SECONDS, text.length)))
    return failure(429, 'busy', 'The voice has reached its limit for today.');

  let audio: Uint8Array;
  try {
    audio = await speak(text);
  } catch {
    return failure(
      502,
      'voice_failed',
      'The voice did not answer. The browser can read it instead.',
    );
  }
  const audioBase64 = Buffer.from(audio).toString('base64');
  await deps.store.put(key, audioBase64, SPEECH_LIMITS.keepSeconds).catch(() => undefined);
  return ok({ audio: audioBase64, voice: VOICE_NAME, characters: text.length, cached: false });
}
