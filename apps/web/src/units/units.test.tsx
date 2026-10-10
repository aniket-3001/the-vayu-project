// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AirUnitsProvider, SmokeFigure, SmokeToggle, UNITS_STORAGE_KEY } from './AirUnits';
import {
  PM25_PER_CIGARETTE,
  cigarettesForAqi,
  cigarettesPerDay,
  describeCigarettes,
} from './smoke';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

describe('cigarettes a day', () => {
  it('is PM2.5 over 22 µg/m³, to one decimal, never negative', () => {
    expect(PM25_PER_CIGARETTE).toBe(22);
    expect(cigarettesPerDay(22)).toBe(1);
    expect(cigarettesPerDay(66)).toBe(3);
    expect(cigarettesPerDay(71.3)).toBe(3.2);
    expect(cigarettesPerDay(0)).toBe(0);
    expect(cigarettesPerDay(-4)).toBe(0);
  });

  it('works from an AQI too, and rises with it', () => {
    expect(cigarettesForAqi(50)).toBeLessThan(cigarettesForAqi(150));
    expect(cigarettesForAqi(150)).toBeLessThan(cigarettesForAqi(300));
  });

  it('says it plainly, with the right singular', () => {
    expect(describeCigarettes(0.2)).toBe('less than half a cigarette a day');
    expect(describeCigarettes(1)).toBe('about 1 cigarette a day');
    expect(describeCigarettes(3.2)).toBe('about 3.2 cigarettes a day');
    expect(describeCigarettes(13.4)).toBe('about 13 cigarettes a day');
  });
});

describe('the relatable measure switch', () => {
  const Demo = (): React.JSX.Element => (
    <AirUnitsProvider>
      <SmokeToggle />
      <p>
        AQI 158 <SmokeFigure pm25={71.3} />
      </p>
    </AirUnitsProvider>
  );

  it('is off at first, shows nothing extra, and turns on with the icon', async () => {
    render(<Demo />);
    const toggle = screen.getByRole('button', { name: /Relatable measure/u });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: /3\.2 cigarettes a day/u })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
  });

  it('remembers the choice on this device', async () => {
    const { unmount } = render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: /Relatable measure/u }));
    expect(window.localStorage.getItem(UNITS_STORAGE_KEY)).toBe('smoke');
    unmount();
    render(<Demo />);
    expect(screen.getByRole('group', { name: /3\.2 cigarettes a day/u })).toBeInTheDocument();
  });

  it('shows nothing, and does not fail, when used without a provider', () => {
    render(<SmokeFigure pm25={50} />);
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
  });

  it('never calls itself a mode or a game in its name', () => {
    render(<Demo />);
    expect(
      screen.getByRole('button', { name: /Relatable measure/u }).getAttribute('aria-label'),
    ).not.toMatch(/mode/iu);
  });
});
