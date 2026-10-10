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
  it('puts the cigarettes right beside the AQI, the same size, on every place card and on the Today hero', () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    render(withUnits(<MyAirScreen />));
    const figures = document.querySelectorAll('.place-card .pc-aqi .smoke-fig');
    expect(figures.length).toBe(4);
    for (const figure of figures) expect(figure.previousElementSibling).toHaveClass('fig');
    cleanup();
    render(withUnits(<TodayScreen data={sampleDay('unhealthy')} />));
    const square = screen.getByRole('group', { name: /cigarettes? a day\./u });
    expect(square).toHaveClass('badge');
    expect(square).toHaveTextContent('a day');
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
