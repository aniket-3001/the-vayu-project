// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { sampleDay } from '../../today/sample';
import { alertsFor } from '../model';
import { AlertsStrip } from './AlertsStrip';

afterEach(cleanup);

const open = (id: Parameters<typeof sampleDay>[0], fires?: number): void => {
  const data = sampleDay(id);
  render(<AlertsStrip alerts={alertsFor(data, fires)} data={data} />);
};

describe('the alerts strip', () => {
  it('shows nothing when there is nothing to warn about', () => {
    open('good');
    expect(screen.queryByRole('region', { name: 'Alerts' })).not.toBeInTheDocument();
  });

  it('shows small cards, with the day on each, and today’s glow', () => {
    open('hazardous', 127);
    const strip = screen.getByRole('region', { name: 'Alerts' });
    const cards = within(strip).getAllByRole('listitem');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0]).toHaveTextContent('Today');
    expect(cards[0]).toHaveClass('now');
    expect(strip).toHaveTextContent('GRAP Stage IV likely today');
    expect(strip).toHaveTextContent('Heavy stubble burning nearby');
    expect(strip).toHaveTextContent('Tomorrow');
  });

  it('opens out into a list, and folds back', async () => {
    open('hazardous', 127);
    const toggle = screen.getByRole('button', { name: /Alerts/u });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('list')).not.toHaveClass('expanded');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list')).toHaveClass('expanded');
    await userEvent.click(toggle);
    expect(screen.getByRole('list')).not.toHaveClass('expanded');
  });

  it('puts a way to contact the authorities on the stubble alert only, and opens a sheet with official links', async () => {
    open('hazardous', 127);
    const buttons = screen.getAllByRole('button', { name: /Contact authorities/u });
    expect(buttons).toHaveLength(1);
    const [button] = buttons;
    if (button === undefined) throw new Error('no button');
    await userEvent.click(button);
    const sheet = screen.getByRole('dialog', { name: 'Contact the authorities' });
    expect(within(sheet).getByRole('link', { name: /caqm\.nic\.in/u })).toHaveAttribute(
      'href',
      'https://caqm.nic.in/',
    );
    expect(within(sheet).getByRole('link', { name: /cpcb\.nic\.in/u })).toHaveAttribute(
      'href',
      'https://cpcb.nic.in/',
    );
    expect(within(sheet).getByRole('link', { name: /call 112/iu })).toHaveAttribute(
      'href',
      'tel:112',
    );
    expect(sheet).toHaveTextContent(/do not print one/u);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet with its button too', async () => {
    open('hazardous', 127);
    await userEvent.click(screen.getByRole('button', { name: /Contact authorities/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
