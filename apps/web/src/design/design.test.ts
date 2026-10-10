import { Band } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { BAND_STYLES, US_AQI_STYLES } from './bands';
import { contrastRatio } from './contrast';

describe('band palette', () => {
  it('styles every band', () => {
    for (const band of Band.options) expect(BAND_STYLES[band].name).not.toBe('');
  });

  it('keeps text on every band tile at or above 4.5:1 contrast', () => {
    for (const band of Band.options) {
      const { foreground, background } = BAND_STYLES[band];
      expect(contrastRatio(foreground, background), band).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text on every US AQI colour at or above 4.5:1 contrast', () => {
    expect(US_AQI_STYLES).toHaveLength(6);
    US_AQI_STYLES.forEach(({ foreground, background }, level) => {
      expect(contrastRatio(foreground, background), `level ${level}`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('fills the ring glyph a little more for each worse band (colour is not the only signal)', () => {
    const fills = Band.options.map((band) => BAND_STYLES[band].fill);
    expect(fills).toEqual([...fills].sort((a, b) => a - b));
    expect(new Set(fills).size).toBe(6);
  });

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
