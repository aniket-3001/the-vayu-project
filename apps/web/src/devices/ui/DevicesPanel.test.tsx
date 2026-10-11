// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICES_STORAGE_KEY } from '../devices';
import { DevicesPanel } from './DevicesPanel';
import type { UnitHandlers, UnitTransport } from '../ble';
import { encodePacket } from '../unitProtocol';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    DEVICES_STORAGE_KEY,
    JSON.stringify([{ id: 'd1', name: 'Living room', where: 'home' }]),
  );
});
afterEach(cleanup);

const open = (): HTMLElement => {
  render(
    <MemoryRouter>
      <DevicesPanel />
    </MemoryRouter>,
  );
  return screen.getByRole('list', { name: 'Your devices' });
};

describe('a device on the Devices tab', () => {
  it('shows the air in the room now, the outside air, and whether the cleaner is running', () => {
    const list = open();
    expect(within(list).getByText('AQI in the room')).toBeInTheDocument();
    expect(within(list).getByText(/^Outside$/u)).toBeInTheDocument();
    expect(within(list).getByText(/Cleaner (running|idle)/u)).toBeInTheDocument();
    expect(within(list).getByText('Sample reading')).toBeInTheDocument();
    expect(within(list).getByRole('img', { name: /Today so far, PM2.5/u })).toBeInTheDocument();
  });

  it('starts in Auto, and keeps the cleaner on or off when the person says so, remembering it', async () => {
    const list = open();
    const modes = within(list).getByRole('group', { name: 'Living room mode' });
    expect(within(modes).getByRole('button', { name: 'Auto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(list).getByLabelText('Switch on when the room is')).toBeInTheDocument();
    await userEvent.click(within(modes).getByRole('button', { name: 'Off' }));
    expect(within(list).getByText('Cleaner idle')).toBeInTheDocument();
    expect(within(list).getByText('Kept off by you.')).toBeInTheDocument();
    expect(within(list).queryByLabelText('Switch on when the room is')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DEVICES_STORAGE_KEY)).toContain('"mode":"off"');
    await userEvent.click(within(modes).getByRole('button', { name: 'On' }));
    expect(within(list).getByText('Cleaner running')).toBeInTheDocument();
  });

  it('says how the monitor feeds Exposure, with a link', () => {
    const list = open();
    expect(within(list).getByRole('link', { name: 'Exposure' })).toHaveAttribute(
      'href',
      '/exposure',
    );
  });
});

describe('a real measuring unit on the Devices tab', () => {
  const sender = (): { transport: UnitTransport; send: (pm25: number) => void } => {
    let handlers: UnitHandlers | undefined;
    return {
      transport: {
        supported: () => true,
        connect(h) {
          handlers = h;
          return Promise.resolve({ name: 'Vayu-3F2A', disconnect: () => undefined });
        },
      },
      send: (pm25) => {
        handlers?.onPacket(
          encodePacket({
            pm1: pm25 * 0.7,
            pm25,
            pm4: pm25 * 1.1,
            pm10: pm25 * 1.3,
            temperatureC: 27.5,
            humidityPct: 49,
            uptimeS: 10,
            warming: false,
          }),
        );
      },
    };
  };

  it('is connected over Bluetooth, becomes a card marked Measured, and shows the room against outside', async () => {
    window.localStorage.removeItem(DEVICES_STORAGE_KEY);
    const unit = sender();
    render(
      <MemoryRouter>
        <DevicesPanel transport={unit.transport} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Connect a measuring unit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect over Bluetooth' }));
    const card = await screen.findByRole('heading', { name: 'Vayu-3F2A' });
    expect(card).toBeInTheDocument();
    await act(async () => {
      unit.send(24);
      await Promise.resolve();
    });
    const list = screen.getByRole('list', { name: 'Your devices' });
    expect(within(list).getByText('Measured')).toBeInTheDocument();
    expect(within(list).getByText('AQI in the room')).toBeInTheDocument();
    expect(within(list).getByText(/24\.0 µg\/m³/u)).toBeInTheDocument();
    expect(within(list).getByText(/Connected/u)).toBeInTheDocument();
    expect(within(list).getByText(/than outside/u)).toBeInTheDocument();
    // It is kept as a measured device, so it is there after a reload.
    expect(window.localStorage.getItem(DEVICES_STORAGE_KEY)).toContain('"measured":true');
  });

  it('says plainly when the browser cannot do Bluetooth', () => {
    render(
      <MemoryRouter>
        <DevicesPanel
          transport={{ supported: () => false, connect: () => Promise.reject(new Error('no')) }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/cannot connect to a unit over Bluetooth/u)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Connect over Bluetooth' }),
    ).not.toBeInTheDocument();
  });
});
