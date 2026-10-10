import { describe, expect, it } from 'vitest';
import { s3ReplayRepo } from './replayStore';

const manifest = {
  schemaVersion: 1,
  weekId: 'W1',
  title: 'Week',
  start: '2025-12-08T00:00:00.000Z',
  end: '2025-12-15T00:00:00.000Z',
  stationIds: [],
  events: [],
};
const files: Record<string, unknown> = {
  'replay/index.json': [manifest],
  'replay/W1/manifest.json': manifest,
};
const client = {
  send: (command: { input: { Key: string } }): Promise<unknown> => {
    const body = files[command.input.Key];
    if (body === undefined)
      return Promise.reject(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    return Promise.resolve({
      Body: { transformToString: () => Promise.resolve(JSON.stringify(body)) },
    });
  },
};

describe('s3ReplayRepo', () => {
  const repo = s3ReplayRepo('bucket', client);
  it('lists weeks from the index and reads a manifest', async () => {
    expect((await repo.weeks()).map((w) => w.weekId)).toEqual(['W1']);
    expect((await repo.manifest('W1'))?.title).toBe('Week');
  });
  it('treats a file that is not there as absent, not as a failure', async () => {
    expect(await repo.manifest('W9')).toBeUndefined();
    expect(await repo.series('W1', 'home')).toBeUndefined();
  });
  it('refuses a file that does not match the contract', async () => {
    files['replay/W2/manifest.json'] = { weekId: 'W2' };
    await expect(repo.manifest('W2')).rejects.toThrow();
  });
});
