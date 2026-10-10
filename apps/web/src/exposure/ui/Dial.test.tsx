// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Cell } from '../model';
import { Dial } from './Dial';

afterEach(cleanup);

const names = { home: 'Home', work: 'School / Work', outdoor: 'Live outdoor location' } as const;
const cell = (patch: Partial<Cell>): Cell => ({
  hour: 16,
  where: 'home',
  pm25: 40,
  aqi: 110,
  source: 'assumed',
  ...patch,
});

const draw = (cells: readonly Cell[]): HTMLElement =>
  render(
    <Dial cells={cells} names={names} nowHour={undefined} picked={0} onPick={() => undefined} />,
  ).container;

describe('the dial', () => {
  it('colours a whole hour in one ring', () => {
    const rings = draw([cell({})]).querySelectorAll('.ring');
    const home = rings[0]?.querySelectorAll('path.cell:not(.empty)') ?? [];
    expect(home).toHaveLength(1);
  });

  it('colours a split hour in two rings, each for only its own minutes, and greys the rest', () => {
    const container = draw([
      cell({
        where: 'outdoor',
        aqi: 160,
        parts: [
          { where: 'outdoor', from: 0.5, to: 1, aqi: 160 },
          { where: 'home', from: 0, to: 0.5, aqi: 90 },
        ],
      }),
    ]);
    const [home, work, outdoor] = Array.from(container.querySelectorAll('.ring'));
    const coloured = (ring: Element | undefined): number =>
      ring?.querySelectorAll('path.cell:not(.empty)').length ?? 0;
    expect(coloured(home)).toBe(1);
    expect(coloured(outdoor)).toBe(1);
    expect(coloured(work)).toBe(0);
    // The outside half is the second half of the hour, and the home half the first, so they do not overlap.
    const first = outdoor?.querySelector('path.cell:not(.empty)')?.getAttribute('d');
    const other = home?.querySelector('path.cell:not(.empty)')?.getAttribute('d');
    expect(first).toBeTruthy();
    expect(other).toBeTruthy();
    // A grey underlay stays under each half, so the hour's whole width is still there.
    expect(outdoor?.querySelectorAll('path.cell.empty').length).toBeGreaterThanOrEqual(24);
  });
});
