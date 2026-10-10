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

  it('shows small cards in a row, with the day on each, and a glow on today’s', () => {
    open('hazardous', 127);
    const strip = screen.getByRole('region', { name: 'Alerts' });
    const cards = within(strip).getAllByRole('button');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0]).toHaveTextContent('Today');
    expect(cards[0]).toHaveClass('now');
    expect(strip).toHaveTextContent('GRAP Stage IV likely today');
    expect(strip).toHaveTextContent('Heavy stubble burning nearby');
    expect(strip).toHaveTextContent('Tomorrow');
  });

  it('has no fold and unfold: the row is the row', () => {
    open('hazardous', 127);
    expect(screen.queryByRole('button', { name: /See all|Fold/u })).not.toBeInTheDocument();
    expect(screen.getByRole('list')).not.toHaveClass('expanded');
  });

  it('opens an alert up close, with a short reason and what to do, and closes it again', async () => {
    open('hazardous', 127);
    await userEvent.click(screen.getByRole('button', { name: /GRAP Stage IV likely today/u }));
    const sheet = screen.getByRole('dialog', { name: 'GRAP Stage IV likely today' });
    expect(within(sheet).getByRole('region', { name: 'Why' })).toHaveTextContent(
      /India’s own scale \(CPCB\)/u,
    );
    expect(
      within(sheet).getByRole('region', { name: 'What to do' }).querySelectorAll('li').length,
    ).toBeGreaterThanOrEqual(2);
    expect(sheet).toHaveTextContent(/not an order/u);
    expect(
      within(sheet).queryByRole('button', { name: /Contact authorities/u }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives each kind of alert a reason of its own', async () => {
    open('hazardous', 127);
    for (const [name, why] of [
      [/Avoid park walks today/u, /breathe several times more air/u],
      [/Heavy stubble burning nearby/u, /127 fires.*within 100 km.*upwind|127 fires.*within 100 km.*side the wind comes from/su],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(
        within(screen.getByRole('dialog')).getByRole('region', { name: 'Why' }),
      ).toHaveTextContent(why);
      await userEvent.keyboard('{Escape}');
    }
  });

  it('offers the authorities on the stubble alert only, and opens a sheet with official links', async () => {
    open('hazardous', 127);
    await userEvent.click(screen.getByRole('button', { name: /Heavy stubble burning nearby/u }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Contact authorities/u }),
    );
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
});
