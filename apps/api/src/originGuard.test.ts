import { describe, expect, it } from 'vitest';
import { ORIGIN_HEADER, originAllowed } from './originGuard';

describe('originAllowed', () => {
  it('lets everything through when no secret is configured', () => {
    expect(originAllowed('/v1/today', {}, undefined)).toBe(true);
    expect(originAllowed('/v1/today', {}, '')).toBe(true);
  });

  it('accepts the right secret and refuses a missing or wrong one', () => {
    expect(originAllowed('/v1/today', { [ORIGIN_HEADER]: 's3cret' }, 's3cret')).toBe(true);
    expect(originAllowed('/v1/today', {}, 's3cret')).toBe(false);
    expect(originAllowed('/v1/today', { [ORIGIN_HEADER]: 'nope!!' }, 's3cret')).toBe(false);
    expect(originAllowed('/v1/today', { [ORIGIN_HEADER]: 's3cre' }, 's3cret')).toBe(false);
  });

  it('refuses a forged viewer address without the secret', () => {
    expect(
      originAllowed('/v1/assistant', { 'cloudfront-viewer-address': '1.2.3.4:1' }, 's3cret'),
    ).toBe(false);
  });

  it('leaves the Telegram webhook to its own secret', () => {
    expect(originAllowed('/v1/watch/telegram/webhook', {}, 's3cret')).toBe(true);
  });
});
