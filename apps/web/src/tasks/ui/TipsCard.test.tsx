// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MyAirScreen } from '../../myair/MyAirScreen';
import { TASKS_STORAGE_KEY } from '../store';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

const open = (): void => {
  render(
    <MemoryRouter>
      <MyAirScreen />
    </MemoryRouter>,
  );
};

describe('the Breathe better tips on My Air', () => {
  it('sit above the places, for the first place, with a ring, no streak and no points yet', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    expect(card).toHaveTextContent('Tips for Home');
    expect(within(card).getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2);
    expect(card).toHaveTextContent('No streak yet');
    expect(card).toHaveTextContent('0 points · Getting started');
    expect(within(card).getByRole('img', { name: /0 of \d done/u })).toBeInTheDocument();
  });

  it('put the streak and points in a footer under the tips, above the search', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    const footer = card.querySelector('.tips-footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent('No streak yet');
    expect(card.querySelector('ul')?.contains(footer)).toBe(false);
    expect(card.lastElementChild).toBe(footer);
    expect(card.querySelector('.tip-stat')).not.toBeInTheDocument();
  });

  it('can be ticked for points and a streak, and unticked again', async () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    const [first] = within(card).getAllByRole('checkbox');
    if (first === undefined) throw new Error('no task');
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(card).toHaveTextContent('1-day streak');
    expect(card).toHaveTextContent(/30 points/u);
    expect(within(card).getByRole('img', { name: /1 of \d done/u })).toBeInTheDocument();
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-checked', 'false');
    expect(card).toHaveTextContent('No streak yet');
  });

  it('remember what was done, and read as a checklist with the points in each name', async () => {
    open();
    const [first] = within(
      screen.getByRole('region', { name: 'Breathe better today' }),
    ).getAllByRole('checkbox');
    if (first === undefined) throw new Error('no task');
    expect(first.getAttribute('aria-label')).toMatch(/\d+ points$/u);
    await userEvent.click(first);
    expect(window.localStorage.getItem(TASKS_STORAGE_KEY)).toContain('2026-10-10');
    cleanup();
    open();
    expect(
      within(screen.getByRole('region', { name: 'Breathe better today' })).getAllByRole(
        'checkbox',
      )[0],
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('are hidden when no place is pinned, since there is no air to act on', () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    open();
    expect(screen.queryByRole('region', { name: 'Breathe better today' })).not.toBeInTheDocument();
  });

  it('hold the tips as cards that scroll sideways, with a scroll indicator and no dots', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    expect(screen.queryByRole('heading', { name: 'Alerts', level: 2 })).not.toBeInTheDocument();
    const row = card.querySelector<HTMLElement>('.tips-row');
    expect(row).toBeInTheDocument();
    expect(card.querySelector('.carousel-dots')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See all|Fold/u })).not.toBeInTheDocument();
    // Each tip shows its reason in full beside its star, with no unfolding.
    expect(row?.querySelector('li .task-words .muted')).toBeInTheDocument();
  });

  it('shows how much of the row is in view, and where, from the row’s own scroll position', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    const row = card.querySelector<HTMLElement>('.tips-row');
    if (row === null) throw new Error('no row');
    // A row twice as wide as the screen, scrolled a quarter of the way.
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(row, 'scrollLeft', { configurable: true, writable: true, value: 200 });
    act(() => {
      fireEvent.scroll(row);
    });
    const thumb = card.querySelector<HTMLElement>('.scroll-thumb');
    expect(thumb).toBeInTheDocument();
    expect(thumb?.style.width).toBe('50%');
    expect(thumb?.style.left).toBe('25%');
  });

  it('show the points as a gold star icon and then the number, as the totals do', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    const coins = card.querySelectorAll('.task-points');
    expect(coins.length).toBeGreaterThanOrEqual(2);
    for (const coin of coins) {
      expect(coin).toHaveTextContent(/^\d+$/u);
      expect(coin.querySelector('svg.ic-star')).toBeInTheDocument();
      expect(coin.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    }
    expect(within(card).getAllByRole('img', { name: /\d+ points/u }).length).toBe(coins.length);
  });
});
