import { describe, expect, it, vi } from 'vitest';
import { StaleTaskTokenError, resumeAlertLoop } from './resumeLoop';
import { fixtureTokenStore } from './tokenStore';

const ACK = {
  alertId: 'a1',
  chatId: 'c1',
  action: 'done',
  at: '2026-10-06T06:00:00.000Z',
} as const;

describe('resumeAlertLoop', () => {
  it('tells Step Functions the waiting step succeeded, then forgets the token', async () => {
    const tokens = fixtureTokenStore();
    await tokens.saveToken('a1', 'TOKEN', 0);
    const sendTaskSuccess = vi.fn().mockResolvedValue(undefined);

    expect(await resumeAlertLoop({ tokens, sendTaskSuccess })(ACK)).toBe('resumed');

    expect(sendTaskSuccess).toHaveBeenCalledWith(
      'TOKEN',
      JSON.stringify({ action: 'done', chatId: 'c1', at: ACK.at }),
    );
    expect(await tokens.getToken('a1')).toBeNull();
  });

  it('does nothing when no step is waiting', async () => {
    const sendTaskSuccess = vi.fn();
    const outcome = await resumeAlertLoop({ tokens: fixtureTokenStore(), sendTaskSuccess })(ACK);
    expect(outcome).toBe('nothing_waiting');
    expect(sendTaskSuccess).not.toHaveBeenCalled();
  });

  it('treats a finished or timed-out task as fine and clears the token', async () => {
    const tokens = fixtureTokenStore();
    await tokens.saveToken('a1', 'TOKEN', 0);
    const sendTaskSuccess = vi.fn().mockRejectedValue(new StaleTaskTokenError());
    expect(await resumeAlertLoop({ tokens, sendTaskSuccess })(ACK)).toBe('already_finished');
    expect(await tokens.getToken('a1')).toBeNull();
  });

  it('lets any other error through and keeps the token, so the tap is not silently lost', async () => {
    const tokens = fixtureTokenStore();
    await tokens.saveToken('a1', 'TOKEN', 0);
    const sendTaskSuccess = vi.fn().mockRejectedValue(new Error('throttled'));
    await expect(resumeAlertLoop({ tokens, sendTaskSuccess })(ACK)).rejects.toThrow('throttled');
    expect(await tokens.getToken('a1')).toBe('TOKEN');
  });
});
