// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type UnitHandlers,
  type UnitReading,
  type UnitTransport,
  encodePacket,
  sharedUnit,
} from '@vayu/unit';
import { PurifierPanel } from './PurifierPanel';

beforeEach(() => {
  window.localStorage.clear();
  sharedUnit.reset();
});
afterEach(cleanup);

const free = (pm25: number): UnitReading => ({
  pm1: pm25 * 0.9,
  pm25,
  pm4: pm25,
  pm10: pm25 * 1.1,
  uptimeS: 100,
  warming: false,
  context: 'free',
});
const onPurifier = (pm25: number, tag = 0xbeef): UnitReading => ({
  ...free(pm25),
  context: 'purifier',
  purifierTag: tag,
});

async function connect(): Promise<(reading: UnitReading) => void> {
  let handlers: UnitHandlers | undefined;
  const transport: UnitTransport = {
    supported: () => true,
    connect(h) {
      handlers = h;
      return Promise.resolve({ name: 'Vayu-78A5', disconnect: () => undefined });
    },
  };
  await act(async () => {
    await sharedUnit.connect(transport, () => 'unit-1');
  });
  return (reading) => {
    act(() => {
      handlers?.onPacket(encodePacket(reading));
    });
  };
}

describe('the purified air on the room screen', () => {
  it('shows nothing while the unit is not on a purifier', async () => {
    const send = await connect();
    send(free(80));
    render(<PurifierPanel nowMs={Date.now()} />);
    expect(screen.queryByText('Purified air')).toBeNull();
  });

  it('shows the air at the purifier’s output, labelled, once the unit is on it', async () => {
    const send = await connect();
    send(onPurifier(10));
    render(<PurifierPanel nowMs={Date.now()} />);
    expect(screen.getByText('Purified air')).toBeTruthy();
    expect(screen.getByText(/10/)).toBeTruthy();
  });

  it('asks which purifier it is once, then shows the name', async () => {
    const send = await connect();
    send(onPurifier(10));
    render(<PurifierPanel nowMs={Date.now()} />);
    fireEvent.change(screen.getByLabelText('Which purifier is this?'), {
      target: { value: 'Living room' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByLabelText('Which purifier is this?')).toBeNull();
    expect(screen.getByText(/Living room/)).toBeTruthy();
  });

  it('does not ask again for a purifier it already knows', async () => {
    window.localStorage.setItem('vayu.purifiers.v1', JSON.stringify({ [String(0xbeef)]: 'Study' }));
    const send = await connect();
    send(onPurifier(10));
    render(<PurifierPanel nowMs={Date.now()} />);
    expect(screen.queryByLabelText('Which purifier is this?')).toBeNull();
    expect(screen.getByText(/Study/)).toBeTruthy();
  });

  it('says how much cleaner the output is than the room, when it has both readings', async () => {
    const send = await connect();
    send(free(100));
    send(onPurifier(25));
    render(<PurifierPanel nowMs={Date.now()} />);
    expect(screen.getByText(/75% cleaner than the room/)).toBeTruthy();
  });

  it('says it cannot compare, and gives no number, with only the purified reading', async () => {
    const send = await connect();
    send(onPurifier(25));
    render(<PurifierPanel nowMs={Date.now()} />);
    expect(screen.getByText(/Not enough to compare yet/)).toBeTruthy();
    expect(screen.queryByText(/% cleaner/)).toBeNull();
  });
});
