import { describe, expect, it } from 'vitest';
import { keepGrid } from './keepGrid';

describe('keeping a grid', () => {
  it('asks once while the answer is fresh, and again after it has gone stale', async () => {
    let t = 0;
    let calls = 0;
    const get = keepGrid(
      () => {
        calls += 1;
        return Promise.resolve([calls]);
      },
      { keepMs: 1000, now: () => t },
    );
    expect(await get()).toEqual([1]);
    t = 500;
    expect(await get()).toEqual([1]);
    t = 1500;
    expect(await get()).toEqual([2]);
  });

  it('does not ask again for a while after a refusal, and serves the old answer meanwhile', async () => {
    let t = 0;
    let calls = 0;
    let down = false;
    const get = keepGrid(
      () => {
        calls += 1;
        return down ? Promise.reject(new Error('429')) : Promise.resolve([calls]);
      },
      { keepMs: 1000, retryMs: 600, now: () => t },
    );
    expect(await get()).toEqual([1]);
    down = true;
    t = 2000;
    // Stale and refused: the old answer is served, and the refusal is remembered.
    expect(await get()).toEqual([1]);
    expect(calls).toBe(2);
    t = 2300;
    expect(await get()).toEqual([1]);
    expect(calls).toBe(2);
    // After the wait it tries again.
    t = 2700;
    down = false;
    expect(await get()).toEqual([3]);
  });

  it('throws when it has nothing to serve, and does not hammer the provider', async () => {
    let t = 0;
    let calls = 0;
    const get = keepGrid(
      () => {
        calls += 1;
        return Promise.reject(new Error('429'));
      },
      { keepMs: 1000, retryMs: 600, now: () => t },
    );
    await expect(get()).rejects.toThrow('429');
    t = 100;
    await expect(get()).rejects.toThrow(/not asking again/u);
    expect(calls).toBe(1);
  });
});
