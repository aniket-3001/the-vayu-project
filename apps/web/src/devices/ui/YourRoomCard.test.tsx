// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UnitHandlers, UnitTransport } from '../ble';
import { addMeasuredDevice, DEVICES_STORAGE_KEY } from '../devices';
import { sharedUnit } from '../unitController';
import { encodePacket } from '../unitProtocol';
import { YourRoomCard } from './YourRoomCard';

beforeEach(() => {
  window.localStorage.clear();
  sharedUnit.reset();
});
afterEach(cleanup);

function connectedTransport(): { transport: UnitTransport; send: (pm25: number) => void } {
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
          pm4: pm25 * 1.05,
          pm10: pm25 * 1.1,
          uptimeS: 100,
          warming: false,
        }),
      );
    },
  };
}

describe('the Your room card on My Air', () => {
  it('is not there until a unit is connected', () => {
    render(
      <MemoryRouter>
        <YourRoomCard />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Your room')).toBeNull();
  });

  it('appears when the unit connects, with the live reading, and says Exposure uses it', async () => {
    const devices = addMeasuredDevice([], { bleName: 'Vayu-78A5', where: 'home' });
    window.localStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(devices));
    const fake = connectedTransport();
    await sharedUnit.connect(fake.transport, () => 'unit:Vayu-78A5');
    render(
      <MemoryRouter>
        <YourRoomCard />
      </MemoryRouter>,
    );
    act(() => {
      fake.send(18.8);
    });
    expect(screen.getByRole('heading', { name: 'Your room' })).toBeInTheDocument();
    expect(screen.getByText('AQI in the room')).toBeInTheDocument();
    expect(screen.getByText('69')).toBeInTheDocument();
    expect(screen.getByText(/18\.8 µg\/m³/u)).toBeInTheDocument();
    expect(
      screen.getByText(/counts the hours you spend in your home from this reading/u),
    ).toBeInTheDocument();
    // More readings make the live chart.
    act(() => {
      fake.send(20);
      fake.send(22);
    });
    expect(screen.getByRole('img', { name: /AQI in the room over the last/u })).toBeInTheDocument();
  });

  it('goes when the unit is disconnected', async () => {
    const fake = connectedTransport();
    await sharedUnit.connect(fake.transport, () => 'unit:Vayu-78A5');
    render(
      <MemoryRouter>
        <YourRoomCard />
      </MemoryRouter>,
    );
    act(() => {
      fake.send(18.8);
    });
    expect(screen.getByText('Your room')).toBeInTheDocument();
    act(() => {
      sharedUnit.disconnect();
    });
    expect(screen.queryByText('Your room')).toBeNull();
  });
});
