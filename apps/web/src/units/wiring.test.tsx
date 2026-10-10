// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MyAirScreen } from '../myair/MyAirScreen';
import { sampleDay } from '../today/sample';
import { TodayScreen } from '../today/ui/TodayScreen';
import { AirUnitsProvider, UNITS_STORAGE_KEY } from './AirUnits';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

const withUnits = (node: React.ReactNode): React.JSX.Element => (
  <MemoryRouter>
    <AirUnitsProvider>{node}</AirUnitsProvider>
  </MemoryRouter>
);

describe('the relatable measure on the screens', () => {
  it('adds cigarettes a day beside the AQI on every place card, and the caveat on the Today hero', () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    render(withUnits(<MyAirScreen />));
    expect(screen.getAllByText(/cigarettes? a day/u).length).toBeGreaterThanOrEqual(4);
    cleanup();
    render(withUnits(<TodayScreen data={sampleDay('unhealthy')} />));
    expect(screen.getByText(/Berkeley Earth/u)).toBeInTheDocument();
    expect(screen.getAllByText(/about \d+(\.\d)? cigarettes a day/u).length).toBeGreaterThan(0);
  });

  it('shows none of it when the measure is off', () => {
    render(withUnits(<MyAirScreen />));
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
  });
});
