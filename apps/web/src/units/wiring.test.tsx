// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('adds cigarettes a day on every place card, and a small card on the Today hero that opens the full picture', async () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    render(withUnits(<MyAirScreen />));
    expect(
      screen.getAllByText(/cigarettes? a day|under ½ cigarette a day/u).length,
    ).toBeGreaterThanOrEqual(4);
    cleanup();
    render(withUnits(<TodayScreen data={sampleDay('unhealthy')} />));

    const chip = screen.getByRole('button', { name: /cigarettes? a day\. Tap for more/u });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(chip);
    const sheet = screen.getByRole('dialog', { name: 'In cigarettes' });
    expect(sheet).toHaveTextContent(/Berkeley Earth/u);
    expect(sheet).toHaveTextContent(/About \d+(\.\d)? cigarettes/u);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows none of it when the measure is off', () => {
    render(withUnits(<MyAirScreen />));
    expect(screen.queryByText(/cigarette/u)).not.toBeInTheDocument();
  });
});
