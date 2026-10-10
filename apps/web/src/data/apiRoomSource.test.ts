import { describe, expect, it, vi } from 'vitest';
import { apiRoomSource } from './apiRoomSource';

const OBSERVATION = {
  roomId: 'vayu-dev-01',
  roomName: 'Your room (vayu-dev-01)',
  asOf: '2026-10-08T10:00:00.000Z',
  insidePm25: 40,
  insideObservedAt: '2026-10-08T09:59:50.000Z',
  rhPct: 52,
  outsidePm25: 130,
  outsideObservedAt: '2026-10-08T09:00:00.000Z',
  lastSeenMinutes: 0,
  simulated: true,
};
const reply = (body: unknown, status = 200): typeof fetch =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('apiRoomSource', () => {
  it('asks the API for the room and hands the observation to the room page unchanged', async () => {
    const fetchImpl = reply(OBSERVATION);
    const input = await apiRoomSource('https://api.example.com/', fetchImpl).load('vayu-dev-01');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/v1/rooms/vayu-dev-01');
    expect(input).toEqual(OBSERVATION);
  });

  it('keeps an unknown reading unknown (null), never zero', async () => {
    const quiet = {
      ...OBSERVATION,
      insidePm25: null,
      insideObservedAt: null,
      lastSeenMinutes: null,
      simulated: false,
    };
    const input = await apiRoomSource('https://api.example.com', reply(quiet)).load('vayu-dev-01');
    expect(input).toMatchObject({ insidePm25: null, lastSeenMinutes: null, simulated: false });
  });

  it('encodes the room name in the address', async () => {
    const fetchImpl = reply(OBSERVATION);
    await apiRoomSource('https://api.example.com', fetchImpl).load('a b');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/v1/rooms/a%20b');
  });

  it('fails loudly on an error status or an answer that breaks the contract', async () => {
    await expect(
      apiRoomSource('https://api.example.com', reply({}, 500)).load('x'),
    ).rejects.toThrow(/500/);
    await expect(
      apiRoomSource('https://api.example.com', reply({ nope: 1 })).load('x'),
    ).rejects.toThrow();
  });
});
