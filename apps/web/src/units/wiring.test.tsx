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
  it('adds a small square cigarettes card on every place card and beside the AQI on the Today hero', () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    render(withUnits(<MyAirScreen />));
    expect(document.querySelectorAll('.place-card .smoke-square.compact').length).toBe(4);
    cleanup();
    render(withUnits(<TodayScreen data={sampleDay('unhealthy')} />));
    const square = screen.getByRole('group', { name: /cigarettes? a day\./u });
    expect(square).toHaveTextContent('cigarettes a day');
    expect(square).toHaveTextContent(/^\d/u);
    expect(screen.getByText(/Berkeley Earth/u)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.wisp, .cig-ember')).not.toBeInTheDocument();
  });

  it('shows none of it when the measure is off', () => {
    render(withUnits(<MyAirScreen />));
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
  });
});
