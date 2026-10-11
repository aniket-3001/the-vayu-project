// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MyAirScreen } from '../../myair/MyAirScreen';
import { setOwnerStartsWithSamples } from '../../exposure/spots';
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
    // The colour scale for reference comes after it, and nothing else.
    expect(footer?.nextElementSibling).toBe(card.lastElementChild);
    expect(card.lastElementChild).toHaveClass('aqi-scale');
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

  it('are hidden when no place is pinned or set, since there is no air to act on', () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    // The deployed app starts with no timetable; the prototype starts with a sample one.
    setOwnerStartsWithSamples(false);
    try {
      open();
      expect(
        screen.queryByRole('region', { name: 'Breathe better today' }),
      ).not.toBeInTheDocument();
    } finally {
      setOwnerStartsWithSamples(true);
    }
  });

  it('hold the tips as cards that scroll sideways, with a scroll indicator and no dots', () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    expect(screen.queryByRole('heading', { name: 'Alerts', level: 2 })).not.toBeInTheDocument();
    const row = card.querySelector<HTMLElement>('.tips-row');
    expect(row).toBeInTheDocument();
    expect(card.querySelector('.carousel-dots')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See all|Fold/u })).not.toBeInTheDocument();
    // A card holds only the heading; the full words are behind it.
    expect(row?.querySelector('li .task-words .muted')).not.toBeInTheDocument();
    expect(row?.querySelector('li .tip-open strong')).toBeInTheDocument();
  });

  it('open a tip up close from its heading, with the full words, and tick it off from there', async () => {
    open();
    const card = screen.getByRole('region', { name: 'Breathe better today' });
    const heading = card.querySelector<HTMLElement>('.tip-open');
    if (heading === null) throw new Error('no tip');
    await userEvent.click(heading);
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent(/\d+ points/u);
    expect(
      within(sheet).getByRole('region', { name: 'Details' }).textContent?.length,
    ).toBeGreaterThan(20);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark as done' }));
    expect(within(sheet).getByRole('button', { name: 'Mark as not done' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true');
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

  describe('for the family’s timetable', () => {
    const home = { id: '28.59,77.05', name: 'Home', lat: 28.59, lng: 77.05 };
    const school = { id: '28.4,77.05', name: 'DAV Public School', lat: 28.4, lng: 77.05 };
    const seed = (): void => {
      window.localStorage.setItem('vayu.pins.v1', JSON.stringify([home, school]));
      window.localStorage.setItem(
        'vayu.people.v1',
        JSON.stringify({
          people: [
            { id: 'me', name: 'Me', age: 38, day: 'work' },
            { id: 'asha', name: 'Asha', age: 9, day: 'school' },
          ],
          current: 'me',
        }),
      );
      window.localStorage.setItem(
        'vayu.spots.v3',
        JSON.stringify({
          me: { home: { pin: home, from: 0, to: 24 } },
          asha: {
            home: { pin: home, from: 0, to: 24 },
            school: { pin: school, from: 8, to: 15 },
          },
        }),
      );
    };

    it('include the school: where assembly should be, and how the child’s school day looks in the air', () => {
      seed();
      open();
      const card = screen.getByRole('region', { name: 'Breathe better today' });
      expect(card).toHaveTextContent('Home');
      expect(card).toHaveTextContent('DAV Public School');
      expect(card).toHaveTextContent(/Morning assembly: (Inside|Open ground|None)/u);
      expect(card).toHaveTextContent(/Asha, 9: AQI \d+ at school/u);
      // Each school tip says which place it is for.
      const places = Array.from(card.querySelectorAll('.tip-place')).map((el) => el.textContent);
      expect(places).toContain('DAV Public School');
    });

    it('are for the timetable and not for where the phone is', async () => {
      seed();
      const { setLiveLocation } = await import('../../places/liveLocation');
      const snapshot = {
        enabled: true,
        status: 'on',
        position: { lat: 12.97, lng: 77.59 },
        checkedAt: 1,
      } as const;
      setLiveLocation({
        get: () => snapshot,
        subscribe: () => () => undefined,
        set: () => undefined,
        resume: () => undefined,
      });
      try {
        open();
        const card = screen.getByRole('region', { name: 'Breathe better today' });
        expect(card).not.toHaveTextContent(/Here|Live location/u);
        expect(card).toHaveTextContent('Tips for Home');
      } finally {
        setLiveLocation(undefined);
      }
    });

    it('add nothing for school when none is set, and keep to home', () => {
      window.localStorage.setItem('vayu.pins.v1', JSON.stringify([home]));
      open();
      const card = screen.getByRole('region', { name: 'Breathe better today' });
      expect(card).not.toHaveTextContent(/Morning assembly/u);
    });
  });
});
