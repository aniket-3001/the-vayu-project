import { describe, expect, it } from 'vitest';
import { timedFetch } from './timedFetch';

/** A fetch that never answers, and gives up only when it is told to. */
const hangs: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'));
    });
  });

describe('timedFetch', () => {
  it('gives up on a connection that never answers', async () => {
    const started = Date.now();
    await expect(timedFetch(30, hangs)('https://example.test/')).rejects.toBeDefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('passes a normal answer straight through', async () => {
    const ok: typeof fetch = () => Promise.resolve(new Response('fine', { status: 200 }));
    const res = await timedFetch(1000, ok)('https://example.test/');
    expect(await res.text()).toBe('fine');
  });

  it('still honours a signal the caller passes', async () => {
    const controller = new AbortController();
    const pending = timedFetch(5000, hangs)('https://example.test/', { signal: controller.signal });
    controller.abort(new Error('caller gave up'));
    await expect(pending).rejects.toThrow('caller gave up');
  });
});
