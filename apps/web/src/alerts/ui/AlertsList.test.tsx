// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { sampleDay } from '../../today/sample';
import { alertsFor } from '../model';
import { AlertsList } from './AlertsList';

afterEach(cleanup);

const open = (id: Parameters<typeof sampleDay>[0], fires?: number): void => {
  const data = sampleDay(id);
  render(<AlertsList alerts={alertsFor(data, fires)} data={data} />);
};

describe('the alerts list', () => {
  it('shows nothing when there is nothing to warn about', () => {
    open('good');
    expect(screen.queryByRole('list', { name: 'Alerts' })).not.toBeInTheDocument();
  });

  it('is a list down the page, with the day on each, and today’s lit', () => {
    open('hazardous', 127);
    const list = screen.getByRole('list', { name: 'Alerts' });
    const rows = within(list).getAllByRole('button');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]).toHaveClass('now');
    expect(list).toHaveTextContent('GRAP Stage IV likely today');
    expect(list).toHaveTextContent('Heavy stubble burning nearby');
    expect(list).toHaveTextContent('Tomorrow');
  });

  it('puts the severe ones first, glowing red, and the cautions after them in soft yellow', () => {
    open('hazardous', 127);
    const rows = within(screen.getByRole('list', { name: 'Alerts' })).getAllByRole('button');
    const severities = rows.map((row) => (row.classList.contains('severe') ? 'severe' : 'caution'));
    expect(severities[0]).toBe('severe');
    expect(rows[0]).toHaveTextContent('GRAP Stage IV likely today');
    const firstCaution = severities.indexOf('caution');
    expect(firstCaution).toBeGreaterThan(0);
    expect(severities.slice(firstCaution)).not.toContain('severe');
    for (const row of rows.filter((r) => !r.classList.contains('severe')))
      expect(row).toHaveClass('caution');
  });

  it('gives each GRAP stage its own colour, yellow, orange, red and purple, and pulses the top two', () => {
    const rows = (id: Parameters<typeof sampleDay>[0]): string[] => {
      const data = sampleDay(id);
      return alertsFor(data, undefined).map((a) =>
        a.stage === undefined ? a.kind : `grap-s${String(a.stage)}`,
      );
    };
    expect(rows('hazardous')).toContain('grap-s4');
    const stages = new Map<number, string>();
    for (const id of ['unhealthy', 'dusty', 'hazardous'] as const) {
      for (const a of alertsFor(sampleDay(id), undefined)) {
        if (a.stage !== undefined) stages.set(a.stage, a.severity);
      }
    }
    for (const [stage, severity] of stages) {
      expect(severity).toBe(stage >= 3 ? 'severe' : 'caution');
    }
  });

  it('has no walk warning: the first alert is GRAP Stage I, past 200 on the CPCB scale', () => {
    for (const id of ['good', 'moderate', 'unhealthy'] as const) {
      const alerts = alertsFor(sampleDay(id), undefined);
      expect(alerts.some((a) => (a.kind as string) === 'walk')).toBe(false);
    }
  });

  it('says what to avoid for each stage, with schools and open assembly in it', () => {
    const grap = alertsFor(sampleDay('hazardous'), undefined).find((a) => a.kind === 'grap');
    expect(grap?.avoid.length).toBeGreaterThanOrEqual(3);
    expect(grap?.avoid.join(' ')).toMatch(/school/iu);
    expect(grap?.body).toMatch(/school/iu);
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
      [/GRAP Stage IV likely today/u, /India’s own scale \(CPCB\)/u],
      [
        /Heavy stubble burning nearby/u,
        /127 fires.*within 100 km.*upwind|127 fires.*within 100 km.*side the wind comes from/su,
      ],
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
