import { describe, expect, it } from 'vitest';
import { writeUrl } from './writeUrl';

describe('where what a person types is sent', () => {
  it('goes to the API only on the live app, never in the recorded days or the prototype', () => {
    expect(writeUrl(true, false, 'https://api')).toBe('https://api');
    expect(writeUrl(true, true, 'https://api')).toBeUndefined();
    expect(writeUrl(false, false, 'https://api')).toBeUndefined();
    expect(writeUrl(false, true, 'https://api')).toBeUndefined();
  });
});
