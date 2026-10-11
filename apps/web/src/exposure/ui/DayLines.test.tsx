// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Cell } from '../model';
import { DayLines } from './DayLines';

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
    <DayLines
      cells={cells}
      names={names}
      nowHour={undefined}
      picked={0}
      onPick={() => undefined}
    />,
  ).container;

describe('the day as lines', () => {
  it('colours a whole hour on one line', () => {
    const rows = draw([cell({})]).querySelectorAll('.dl-row');
    const home = rows[0]?.querySelectorAll('.dl-cell:not(.blank)') ?? [];
    expect(home).toHaveLength(1);
    expect(home[0]?.querySelector('i')).toHaveStyle({ left: '0%', width: '100%' });
  });

  it('colours a split hour on two lines, each for only its own part of the hour', () => {
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
    const [home, work, outdoor] = Array.from(container.querySelectorAll('.dl-row'));
    const piece = (row: Element | undefined): HTMLElement | null =>
      row?.querySelector<HTMLElement>('.dl-cell:not(.blank) i') ?? null;
    expect(piece(home)).toHaveStyle({ left: '0%', width: '50%' });
    expect(piece(outdoor)).toHaveStyle({ left: '50%', width: '50%' });
    expect(piece(work)).toBeNull();
  });

  it('marks the picked hour down every line, and the hour in progress', () => {
    const { container } = render(
      <DayLines cells={[]} names={names} nowHour={9.5} picked={4} onPick={() => undefined} />,
    );
    expect(container.querySelectorAll('.dl-picked')).toHaveLength(3);
    expect(container.querySelectorAll('.dl-now')).toHaveLength(3);
  });
});
