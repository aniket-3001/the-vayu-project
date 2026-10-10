// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('today’s tasks on My Air', () => {
  it('sit above the places, for the first place, with a ring, no streak and no points yet', () => {
    open();
    const card = screen.getByRole('region', { name: 'Today’s tasks' });
    expect(card).toHaveTextContent('For Home');
    expect(within(card).getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2);
    expect(card).toHaveTextContent('No streak yet');
    expect(card).toHaveTextContent('0 points · Getting started');
    expect(within(card).getByRole('img', { name: /0 of \d done/u })).toBeInTheDocument();
  });

  it('can be ticked for points and a streak, and unticked again', async () => {
    open();
    const card = screen.getByRole('region', { name: 'Today’s tasks' });
    const [first] = within(card).getAllByRole('checkbox');
    if (first === undefined) throw new Error('no task');
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(card).toHaveTextContent('1-day streak');
    expect(card).toHaveTextContent(/10 points/u);
    expect(within(card).getByRole('img', { name: /1 of \d done/u })).toBeInTheDocument();
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-checked', 'false');
    expect(card).toHaveTextContent('No streak yet');
  });

  it('remember what was done, and read as a checklist with the points in each name', async () => {
    open();
    const [first] = within(screen.getByRole('region', { name: 'Today’s tasks' })).getAllByRole(
      'checkbox',
    );
    if (first === undefined) throw new Error('no task');
    expect(first.getAttribute('aria-label')).toMatch(/\d+ points$/u);
    await userEvent.click(first);
    expect(window.localStorage.getItem(TASKS_STORAGE_KEY)).toContain('2026-10-10');
    cleanup();
    open();
    expect(
      within(screen.getByRole('region', { name: 'Today’s tasks' })).getAllByRole('checkbox')[0],
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('are hidden when no place is pinned, since there is no air to act on', () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    open();
    expect(screen.queryByRole('region', { name: 'Today’s tasks' })).not.toBeInTheDocument();
  });
});
