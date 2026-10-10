// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MyAirScreen } from '../../myair/MyAirScreen';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

const openDevices = async (): Promise<void> => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <MyAirScreen />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Devices' }));
};

describe('the Devices tab', () => {
  it('opens on Places, and switches to Devices and back', async () => {
    await openDevices();
    expect(screen.getByRole('tab', { name: 'Devices' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Vayu monitor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Places' }));
    expect(screen.getByRole('list', { name: 'Your places' })).toBeInTheDocument();
  });

  it('is only about the devices: no alerts, no tips, no streak', async () => {
    await openDevices();
    expect(screen.queryByRole('region', { name: 'Alerts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Breathe better today' })).not.toBeInTheDocument();
    expect(screen.queryByText(/streak/u)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Places' }));
    expect(screen.getByRole('region', { name: 'Breathe better today' })).toBeInTheDocument();
  });

  it('is honest that the monitor is not built or for sale', async () => {
    await openDevices();
    expect(screen.getByText(/In development. Not for sale yet/u)).toBeInTheDocument();
  });

  it('adds a device at a chosen place, with a sample reading it labels as made up', async () => {
    await openDevices();
    await userEvent.click(screen.getByRole('button', { name: 'Add first device' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Bedroom unit');
    await userEvent.click(screen.getByRole('button', { name: 'School' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add device' }));
    const list = screen.getByRole('list', { name: 'Your devices' });
    expect(within(list).getByRole('heading', { name: 'Bedroom unit' })).toBeInTheDocument();
    expect(list).toHaveTextContent('In your school');
    expect(list).toHaveTextContent('Sample reading');
    expect(list).toHaveTextContent('Indoors');
  });

  it('shows indoor air cleaner than outside, remembers the device, and lets it be removed', async () => {
    await openDevices();
    await userEvent.click(screen.getByRole('button', { name: 'Add first device' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add device' }));
    const readings = screen
      .getAllByText(/µg\/m³/u)
      .map((el) => el.parentElement?.querySelector('strong')?.textContent);
    const [indoors, outside] = readings.map(Number);
    expect(indoors).toBeLessThan(outside ?? 0);
    cleanup();
    await openDevices();
    expect(
      within(screen.getByRole('list', { name: 'Your devices' })).getByRole('heading', {
        name: 'Vayu monitor',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vayu monitor' }));
    expect(screen.getByRole('button', { name: 'Add first device' })).toBeInTheDocument();
  });
});
