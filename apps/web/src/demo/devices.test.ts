import { describe, expect, it } from 'vitest';
import { DEVICES, deviceById, fitScale, geometry } from './devices';

describe('devices', () => {
  it('offers an iPhone, an Android phone, a tablet and a laptop, with distinct ids', () => {
    expect(DEVICES.map((d) => d.id)).toEqual(['iphone', 'android', 'tablet', 'laptop']);
    expect(new Set(DEVICES.map((d) => d.label)).size).toBe(4);
  });

  it('falls back to the iPhone for an unknown or missing name', () => {
    expect(deviceById('nokia').id).toBe('iphone');
    expect(deviceById(null).id).toBe('iphone');
    expect(deviceById('laptop').id).toBe('laptop');
  });

  it('gives the app the screen minus the status and home bars', () => {
    const iphone = deviceById('iphone');
    const g = geometry(iphone, false);
    expect(g.appWidth).toBe(393);
    expect(g.appHeight).toBe(852 - iphone.top - iphone.bottom);
    expect(g.outerWidth).toBe(393 + iphone.bezel * 2);
  });

  it('turns a phone sideways, but never a laptop', () => {
    const sideways = geometry(deviceById('iphone'), true);
    expect(sideways.appWidth).toBe(852);
    expect(sideways.appHeight).toBeLessThan(393);
    const laptop = deviceById('laptop');
    expect(geometry(laptop, true)).toEqual(geometry(laptop, false));
  });

  it('gives a wide app view on a laptop, wide enough for the two-column layout', () => {
    expect(geometry(deviceById('laptop'), false).appWidth).toBeGreaterThanOrEqual(1000);
    expect(geometry(deviceById('tablet'), false).appWidth).toBeGreaterThanOrEqual(640);
  });

  it('scales down to fit, never up, and survives an empty space', () => {
    expect(fitScale(400, 800, 2000, 2000)).toBe(1);
    expect(fitScale(400, 800, 200, 2000)).toBeCloseTo(0.5);
    expect(fitScale(400, 800, 2000, 400)).toBeCloseTo(0.5);
    expect(fitScale(400, 800, 0, 0)).toBe(1);
  });
});
