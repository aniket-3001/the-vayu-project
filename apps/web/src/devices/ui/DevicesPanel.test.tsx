// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICES_STORAGE_KEY } from '../devices';
import { DevicesPanel } from './DevicesPanel';

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
