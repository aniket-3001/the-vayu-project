// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICES_STORAGE_KEY } from '../devices/devices';
import { ExposureScreen } from './ExposureScreen';
import { SPOTS_STORAGE_KEY } from './spots';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'geolocation');
});

const open = (): void => {
  render(
    <MemoryRouter>
      <ExposureScreen />
    </MemoryRouter>,
  );
};

describe('the Exposure screen', () => {
  it('opens on Today with a dial, an answer, and a section for each kind of place', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Today’s exposure' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /24-hour dial/u })).toBeInTheDocument();
    for (const name of ['Home', 'Work', 'School', 'Outdoor', 'Live location']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent(
      'so far today (17 hours)',
    );
  });

  it('gives a full day for yesterday, with the WHO line', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Yesterday’s exposure' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent('over the day');
    expect(screen.getByText(/times the WHO 24-hour guideline of 15/u)).toBeInTheDocument();
  });

  it('says how much rests on an assumption, and lists the assumptions on request', async () => {
    open();
    expect(screen.getByText(/hours rest on an assumption/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How this is worked out' }));
    expect(screen.getByRole('note')).toHaveTextContent(/60% of what it is outside/u);
    expect(screen.getByRole('note')).toHaveTextContent(/made-up sample data/u);
  });

  it('shows what each hour was when the hour is picked, and says when an hour is in the future', () => {
    open();
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '12' } });
    expect(screen.getByText('12:00 to 13:00')).toBeInTheDocument();
    const readout = document.querySelector('.readout');
    expect(readout).toHaveTextContent(/Work, moderate/u);
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '22' } });
    expect(screen.getByText('That hour has not happened yet.')).toBeInTheDocument();
  });

  it('narrows to one kind of place, and has no tab for live location', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('region', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Live location' })).not.toBeInTheDocument();
  });

  it('sets School from the places already pinned, and keeps it after a reload', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Set School' }));
    await userEvent.click(
      within(screen.getByRole('region', { name: 'School' })).getByRole('button', {
        name: 'School',
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'School' })).getByLabelText('School from'),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(SPOTS_STORAGE_KEY)).toContain('"school"');
    cleanup();
    open();
    expect(screen.queryByRole('button', { name: 'Set School' })).not.toBeInTheDocument();
  });

  it('changes the hours a place is usually used, and the dial follows', async () => {
    open();
    const work = screen.getByRole('region', { name: 'Work' });
    const before = document.querySelectorAll('.cell:not(.empty)').length;
    await userEvent.selectOptions(within(work).getByLabelText('Work until'), '12:00');
    expect(document.querySelectorAll('.cell:not(.empty)').length).toBeLessThan(before);
  });

  it('removes a place and says there is nothing to add up when none are left', async () => {
    open();
    for (const name of ['Home', 'Work', 'Outdoor']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    expect(screen.getByText(/Nothing to add up yet/u)).toBeInTheDocument();
  });

  it('uses a monitor’s reading at home once one is added, and says so', () => {
    window.localStorage.setItem(
      DEVICES_STORAGE_KEY,
      JSON.stringify([{ id: 'd1', name: 'Bedroom unit', where: 'home' }]),
    );
    open();
    const home = screen.getByRole('region', { name: 'Home' });
    expect(home).toHaveTextContent('Bedroom unit is here');
    expect(screen.getByRole('region', { name: 'Work' })).toHaveTextContent(/No monitor here/u);
  });

  it('shows a made-up day of live movement on request, labelled as a sample', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Show a sample day' }));
    expect(screen.getByText('Sample track')).toBeInTheDocument();
    expect(screen.getByText(/10 hours logged today/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No hours logged yet.')).toBeInTheDocument();
  });

  it('asks the browser for the location, logs the hour, and handles a refusal', async () => {
    let succeed: ((p: GeolocationPosition) => void) | undefined;
    let fail: (() => void) | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: (p: GeolocationPosition) => void, no: () => void) => {
          succeed = ok;
          fail = no;
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Use live location' }));
    expect(screen.getByRole('region', { name: 'Live location' })).toHaveTextContent(
      'Asking your browser',
    );
    await vi.waitFor(() => {
      expect(succeed).toBeDefined();
    });
    const { act } = await import('@testing-library/react');
    act(() => {
      succeed?.({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition);
    });
    expect(screen.getByRole('button', { name: 'Turn off live location' })).toBeInTheDocument();
    expect(screen.getByText(/1 hour logged today/u)).toBeInTheDocument();
    act(() => {
      fail?.();
    });
    expect(screen.getByRole('region', { name: 'Live location' })).toHaveTextContent(
      /did not give us your location/u,
    );
  });
});
