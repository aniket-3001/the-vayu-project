// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEVICES_STORAGE_KEY,
  MAX_DEVICES,
  addDevice,
  loadDevices,
  removeDevice,
  saveDevices,
  sampleIndoorPm25,
} from './devices';

beforeEach(() => {
  window.localStorage.clear();
});

describe('devices', () => {
  it('starts with none, and never throws on rubbish in storage', () => {
    expect(loadDevices(window.localStorage)).toEqual([]);
    window.localStorage.setItem(DEVICES_STORAGE_KEY, '{nope');
    expect(loadDevices(window.localStorage)).toEqual([]);
    window.localStorage.setItem(
      DEVICES_STORAGE_KEY,
      JSON.stringify([{ id: 1 }, { id: 'a', name: 'x', where: 'moon' }]),
    );
    expect(loadDevices(window.localStorage)).toEqual([]);
  });

  it('adds a device with a place, names it Vayu monitor if no name was given, and remembers it', () => {
    const one = addDevice([], { name: '  ', where: 'home' });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ name: 'Vayu monitor', where: 'home' });
    saveDevices(window.localStorage, one);
    expect(loadDevices(window.localStorage)).toEqual(one);
  });

  it('removes a device by id and caps how many there can be', () => {
    let devices = addDevice([], { name: 'a', where: 'home' });
    for (let i = 0; i < MAX_DEVICES + 2; i++)
      devices = addDevice(devices, { name: `d${String(i)}`, where: 'work' });
    expect(devices.length).toBe(MAX_DEVICES);
    const first = devices[0];
    if (first === undefined) throw new Error('no device');
    expect(removeDevice(devices, first.id)).toHaveLength(MAX_DEVICES - 1);
  });

  it('makes up an indoor reading well under the outdoor one, to one decimal', () => {
    expect(sampleIndoorPm25(100)).toBe(30);
    expect(sampleIndoorPm25(71.3)).toBeLessThan(71.3);
    expect(sampleIndoorPm25(71.3) * 10).toBeCloseTo(Math.round(sampleIndoorPm25(71.3) * 10));
  });
});
