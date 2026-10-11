// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEVELS } from '../../design/levels';
import { LiveChart } from './LiveChart';

afterEach(cleanup);

const at = (s: number): number => Date.parse('2026-10-11T06:00:00.000Z') + s * 1000;

describe('the live chart', () => {
  it('draws nothing until there are two readings', () => {
    const { container } = render(<LiveChart points={[{ atMs: at(0), pm25: 20 }]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the standard level bands in their colours, a line and a dot for now', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ atMs: at(i * 2), pm25: 15 + i }));
    const { container } = render(<LiveChart points={points} />);
    expect(
      screen.getByRole('img', { name: /AQI in the room over the last 2 minutes/u }),
    ).toBeInTheDocument();
    const fills = [...container.querySelectorAll('rect.band')].map(
      (r) => (r as SVGElement).style.fill,
    );
    // Every level the chart's height reaches has its own colour, on a white card.
    expect(fills.length).toBeGreaterThanOrEqual(3);
    for (const fill of fills) expect(LEVELS.map((l) => l.solid)).toContain(rgbToHex(fill));
    expect(container.querySelector('path.trace')).not.toBeNull();
    expect(container.querySelector('circle.now-dot')).not.toBeNull();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('says the AQI it is now at, in the accessible name', () => {
    // 35.5 µg/m³ is AQI 101.
    const points = [
      { atMs: at(0), pm25: 10 },
      { atMs: at(2), pm25: 35.5 },
    ];
    render(<LiveChart points={points} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('now 101');
  });
});

function rgbToHex(value: string): string {
  const m = /^rgb\((\d+), (\d+), (\d+)\)$/u.exec(value);
  if (m === null) return value;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}
