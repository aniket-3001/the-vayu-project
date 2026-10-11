// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlacesPanel } from '../../places/ui/PlacesPanel';
import type { UnitHandlers, UnitTransport } from '../ble';
import { DEVICES_STORAGE_KEY, addMeasuredDevice } from '../devices';
import { sharedUnit } from '../unitController';
import { encodePacket } from '../unitProtocol';
import { AddDeviceSheet } from './AddDeviceSheet';
import { RoomScreen } from './RoomScreen';

beforeEach(() => {
  window.localStorage.clear();
  sharedUnit.reset();
});
afterEach(cleanup);

function unitTransport(): { transport: UnitTransport; send: (pm25: number) => void } {
  let handlers: UnitHandlers | undefined;
  return {
    transport: {
      supported: () => true,
      connect(h) {
        handlers = h;
        return Promise.resolve({ name: 'Vayu-78A5', disconnect: () => undefined });
      },
    },
    send: (pm25) => {
      handlers?.onPacket(
        encodePacket({
          pm1: pm25 * 0.9,
          pm25,
          pm4: pm25,
          pm10: pm25 * 1.1,
          uptimeS: 100,
          warming: false,
        }),
      );
    },
  };
}
const saveUnit = (): void => {
  window.localStorage.setItem(
    DEVICES_STORAGE_KEY,
    JSON.stringify(addMeasuredDevice([], { bleName: 'Vayu-78A5', where: 'home' })),
  );
};

describe('the room card on My Air', () => {
  it('is not there with no unit saved', () => {
    render(
      <MemoryRouter>
        <PlacesPanel />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Open your room')).toBeNull();
  });

  it('comes right after Add a place, with the live line where the forecast is, and opens the room', async () => {
    saveUnit();
    const u = unitTransport();
    await sharedUnit.connect(u.transport, () => 'unit:Vayu-78A5');
    render(
      <MemoryRouter>
        <PlacesPanel />
      </MemoryRouter>,
    );
    act(() => {
      u.send(18.8);
      u.send(20);
      u.send(21);
    });
    const grid = screen.getByRole('list', { name: 'Your places' });
    // After the "Add a place" card, which stays first.
    expect(grid.children[0]).toHaveClass('add-first');
    const first = grid.children[1];
    expect(first).toContainElement(screen.getByLabelText('Open your room'));
    expect(screen.getByText('Your room')).toBeInTheDocument();
    expect(first?.querySelector('.chart-live.compact svg')).not.toBeNull();
    expect(first?.querySelector('.pc-days')).toBeNull();
    expect(screen.getByLabelText('Open your room')).toHaveAttribute('href', '/room');
  });
});

describe('the room page', () => {
  const open = (): void => {
    render(
      <MemoryRouter initialEntries={['/room']}>
        <Routes>
          <Route path="/room" element={<RoomScreen transport={unitTransport().transport} />} />
          <Route path="/" element={<p>My Air</p>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('asks to connect when the unit is saved but not connected', () => {
    saveUnit();
    open();
    expect(
      screen.getByRole('heading', { name: 'Connect to see the live air' }),
    ).toBeInTheDocument();
  });

  it('shows the room against outside, the gap, and the day, with nothing about weather or wind', async () => {
    saveUnit();
    const u = unitTransport();
    await sharedUnit.connect(u.transport, () => 'unit:Vayu-78A5');
    open();
    act(() => {
      u.send(20);
      u.send(21);
      u.send(22);
    });
    expect(
      screen.getByRole('heading', { name: 'The room against outside, live' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What it tells you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect device' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove device' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your room today' })).toBeInTheDocument();
    expect(screen.queryByText(/\bwind\b/iu)).toBeNull();
    expect(screen.queryByText(/\bhumidity\b/iu)).toBeNull();
  });

  it('marks a purifier switched on and says how far the air moved since', async () => {
    saveUnit();
    const u = unitTransport();
    await sharedUnit.connect(u.transport, () => 'unit:Vayu-78A5');
    open();
    act(() => {
      u.send(40);
      u.send(40);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Purifier on' }));
    act(() => {
      u.send(30);
      u.send(18);
    });
    expect(screen.getByText(/PM2.5 40.0 → 18.0 µg\/m³/u)).toBeInTheDocument();
    expect(screen.getByText('55% lower')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Purifier on' }));
    expect(screen.queryByText(/PM2.5 40.0/u)).toBeNull();
  });
});

describe('adding a device', () => {
  it('connects a unit for the place chosen, and closes when it is sending', async () => {
    const u = unitTransport();
    let closed = false;
    render(
      <AddDeviceSheet
        transport={u.transport}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.click(screen.getByRole('button', { name: /Connect over Bluetooth/u }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      u.send(25);
    });
    expect(closed).toBe(true);
    expect(window.localStorage.getItem(DEVICES_STORAGE_KEY)).toContain('"where":"work"');
    expect(window.localStorage.getItem(DEVICES_STORAGE_KEY)).toContain('"measured":true');
  });

  it('says the cleaner is not built and adds only a labelled sample', () => {
    render(<AddDeviceSheet onClose={() => undefined} transport={unitTransport().transport} />);
    expect(screen.getByRole('note', { name: 'To be implemented' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a sample cleaner' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a sample cleaner in your home/u }));
    expect(window.localStorage.getItem(DEVICES_STORAGE_KEY)).not.toContain('"measured"');
  });
});
