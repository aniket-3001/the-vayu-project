import type { FixCheckResult } from '@vayu/contracts';
import { describe, expect, it, vi } from 'vitest';
import { apiFixCheckSource } from './FixCheckSource';

const RESULT: FixCheckResult = {
  fixCheckId: 'dev-1',
  roomId: 'dev',
  startedAt: '2026-10-08T10:00:00.000Z',
  status: 'improved',
  baselinePm25: 200,
  latestPm25: 90,
  dropPct: 55,
  tries: 1,
  escalate: false,
  finishedAt: '2026-10-08T10:05:00.000Z',
  simulated: true,
};
const reply = (body: unknown, status = 200): typeof fetch =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('apiFixCheckSource', () => {
  it('starts a run by POSTing the room name as JSON, and returns the id', async () => {
    const fetchImpl = reply({ fixCheckId: 'dev-1', status: 'waiting', alreadyRunning: false }, 202);
    const out = await apiFixCheckSource('https://api.example.com/', fetchImpl).start('dev');
    expect(out).toEqual({ fixCheckId: 'dev-1' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/v1/fixchecks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: 'dev' }),
    });
  });

  it('says why when the API refuses, in the API’s own words', async () => {
    const refused = reply(
      { error: { code: 'room_not_reporting', message: 'This room has no recent reading' } },
      409,
    );
    await expect(apiFixCheckSource('https://x', refused).start('ghost')).rejects.toThrow(
      'This room has no recent reading',
    );
  });

  it('falls back to the status when the error has no message', async () => {
    await expect(apiFixCheckSource('https://x', reply({}, 500)).start('dev')).rejects.toThrow(
      /500/,
    );
  });

  it('reads an answer and checks it against the contract', async () => {
    const fetchImpl = reply(RESULT);
    expect(await apiFixCheckSource('https://x', fetchImpl).read('dev-1')).toEqual(RESULT);
    expect(fetchImpl).toHaveBeenCalledWith('https://x/v1/fixchecks/dev-1');
    await expect(
      apiFixCheckSource('https://x', reply({ nope: 1 })).read('dev-1'),
    ).rejects.toThrow();
  });
});
