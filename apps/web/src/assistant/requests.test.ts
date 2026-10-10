// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_DRAFT,
  REQUESTS_STORAGE_KEY,
  isContact,
  problemsWith,
  submitRequest,
} from './requests';

beforeEach(() => {
  window.localStorage.clear();
});

const good = {
  ...EMPTY_DRAFT,
  name: 'Meera',
  organisation: 'Sunrise Public School',
  area: 'Dwarka, Delhi',
  contact: 'meera@example.org',
};

describe('asking for a demo or monitors', () => {
  it('takes an email or an Indian mobile number, and nothing else, as a way to reach someone', () => {
    expect(isContact('meera@example.org')).toBe(true);
    expect(isContact('98765 43210')).toBe(true);
    expect(isContact('+91 98765-43210')).toBe(true);
    expect(isContact('12345')).toBe(false);
    expect(isContact('meera@')).toBe(false);
  });

  it('asks for a school or society name only when it is one', () => {
    expect(problemsWith(good)).toEqual([]);
    expect(problemsWith({ ...good, organisation: '' })).toEqual([
      'Please tell us the school’s name.',
    ]);
    expect(problemsWith({ ...good, who: 'society', organisation: '' })).toEqual([
      'Please tell us the society’s name.',
    ]);
    expect(problemsWith({ ...good, who: 'person', organisation: '' })).toEqual([]);
  });

  it('says what is missing, in plain words', () => {
    const found = problemsWith({ ...EMPTY_DRAFT, wants: [] });
    expect(found).toHaveLength(5);
    expect(found.join(' ')).toMatch(/name.*area.*reach you.*demo, monitors, or both/su);
  });

  it('sends to our API when it is set, and sends nothing else to anyone', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const result = await submitRequest(good, {
      baseUrl: 'https://api.example/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBe('sent');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/v1/requests');
    expect(JSON.parse(init.body as string)).toMatchObject({ who: 'school', name: 'Meera' });
    expect(window.localStorage.getItem(REQUESTS_STORAGE_KEY)).toBeNull();
  });

  it('keeps it on this device when there is no API, or the API fails, and says so', async () => {
    expect(await submitRequest(good)).toBe('saved');
    const failing = vi.fn(() => Promise.reject(new Error('offline')));
    expect(
      await submitRequest(good, {
        baseUrl: 'https://api.example',
        fetchImpl: failing as unknown as typeof fetch,
      }),
    ).toBe('saved');
    const kept = JSON.parse(window.localStorage.getItem(REQUESTS_STORAGE_KEY) ?? '[]') as unknown[];
    expect(kept).toHaveLength(2);
  });
});
