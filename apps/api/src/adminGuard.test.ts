import { describe, expect, it } from 'vitest';
import { isAdmin, parseAllowList } from './adminGuard';
import type { ApiRequest } from './respond';

const req = (extra: Partial<ApiRequest>): ApiRequest => ({
  method: 'GET',
  path: '/v1/admin/whoami',
  query: {},
  headers: {},
  ...extra,
});
const EMAIL = 'aniketgupta3001@gmail.com';
const LIST = [EMAIL];

describe('isAdmin', () => {
  it('accepts a verified email on the list, ignoring letter case', () => {
    expect(isAdmin(req({ email: 'Aniketgupta3001@Gmail.com', emailVerified: true }), LIST)).toBe(true);
  });
  it('refuses an unverified or unknown-verification email', () => {
    expect(isAdmin(req({ email: EMAIL, emailVerified: false }), LIST)).toBe(false);
    expect(isAdmin(req({ email: EMAIL }), LIST)).toBe(false);
  });
  it('refuses an email that is not on the list, or none at all', () => {
    expect(isAdmin(req({ email: 'x@y.com', emailVerified: true }), LIST)).toBe(false);
    expect(isAdmin(req({}), LIST)).toBe(false);
  });
  it('refuses everyone when the list is empty', () => {
    expect(isAdmin(req({ email: EMAIL, emailVerified: true }), [])).toBe(false);
    for (const raw of [undefined, '', ' , ']) expect(parseAllowList(raw)).toEqual([]);
  });
  it('trims and lower-cases the list', () => {
    expect(parseAllowList(' A@x.com, b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('never reads an email from headers or the body', () => {
    const r = req({ headers: { 'x-email': LIST[0] }, body: JSON.stringify({ email: LIST[0] }) });
    expect(isAdmin(r, LIST)).toBe(false);
  });
});
