// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { levelForAqi } from '../../design/levels';
import { SAMPLE_IDS, sampleDay } from '../sample';
import { TodayScreen } from './TodayScreen';

afterEach(cleanup);

describe('the Today screen', () => {
  it.each(SAMPLE_IDS)('shows the %s day: level, number, source and every section', (id) => {
    const day = sampleDay(id);
    render(<TodayScreen data={day} />);
    const hero = screen.getByRole('region', { name: levelForAqi(day.aqi).name });
    expect(within(hero).getByText(`AQI ${String(day.aqi)}`)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /Air quality in Delhi/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Where this comes from' })).toHaveTextContent(
      'Sample data',
    );
    for (const name of [
      'Hourly forecast',
      'Daily forecast',
      'Air pollutants',
      'Health recommendations',
      'Last 48 hours',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('gives 48 hourly columns, 7 daily rows and 6 pollutant tiles, each with units', () => {
    const day = sampleDay('unhealthy');
    render(<TodayScreen data={day} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(48);
    expect(within(table).getByRole('rowheader', { name: 'Wind, km/h' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Humidity, %' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /Daily forecast/u })).getAllByRole('listitem'),
    ).toHaveLength(7);
    const tiles = within(screen.getByRole('region', { name: 'Air pollutants' })).getAllByText(
      /µg\/m³/u,
    );
    expect(tiles.length).toBeGreaterThanOrEqual(6);
  });

  it('shows three days when asked', async () => {
    render(<TodayScreen data={sampleDay('good')} />);
    await userEvent.click(screen.getByRole('button', { name: '3 days' }));
    const daily = screen.getByRole('region', { name: 'Daily forecast' });
    expect(within(daily).getAllByRole('listitem')).toHaveLength(3);
  });

  it('puts a moon at night and a sun by day in the hourly sky row', () => {
    render(<TodayScreen data={sampleDay('good')} />);
    expect(screen.getAllByRole('img', { name: 'Clear' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Clear, night' }).length).toBeGreaterThan(0);
  });

  it('says what to do, and says it is general guidance', () => {
    render(<TodayScreen data={sampleDay('hazardous')} />);
    expect(screen.getByText(/Stay indoors/u)).toBeInTheDocument();
    expect(screen.getByText(/Not medical advice/u)).toBeInTheDocument();
  });

  it('gives the WHO line a real 24-hour mean, over or within', () => {
    const { unmount } = render(<TodayScreen data={sampleDay('unhealthy')} />);
    expect(screen.getByText(/times the WHO 24-hour guideline of 15 µg\/m³/u)).toBeInTheDocument();
    unmount();
    render(<TodayScreen data={sampleDay('good')} />);
    expect(screen.getByText(/within the WHO 24-hour guideline/u)).toBeInTheDocument();
  });
});

describe('the sample switcher', () => {
  it('changes the whole screen to another made-up day and says so in the address', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(screen.getByRole('region', { name: 'Unhealthy' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Winter smog/u }));
    expect(screen.getByRole('region', { name: 'Hazardous' })).toBeInTheDocument();
    expect(window.location.search).toBe('?day=hazardous');
    expect(screen.getByRole('button', { name: /Winter smog/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens on the day named in the address, and falls back when the name is nonsense', () => {
    window.history.replaceState(null, '', '/?day=good');
    const { unmount } = render(<App />);
    expect(screen.getByRole('region', { name: 'Good' })).toBeInTheDocument();
    unmount();
    window.history.replaceState(null, '', '/?day=nope');
    render(<App />);
    expect(screen.getByRole('region', { name: 'Unhealthy' })).toBeInTheDocument();
  });
});
