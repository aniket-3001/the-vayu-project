// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import type { PlaceMatch } from '../../data/geocode';
import { MyAirScreen } from '../../myair/MyAirScreen';

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#/';
});
afterEach(cleanup);

const lucknow: PlaceMatch = {
  name: 'Lucknow',
  detail: 'Lucknow, Uttar Pradesh',
  lat: 26.85,
  lng: 80.95,
};

const screenWith = (props: React.ComponentProps<typeof MyAirScreen> = {}): void => {
  render(
    <MemoryRouter>
      <MyAirScreen {...props} />
    </MemoryRouter>,
  );
};

describe('the Places screen', () => {
  const cardOf = (name: string): HTMLElement => {
    const card = screen.getByRole('button', { name: new RegExp(`^${name}\\b`, 'u') }).closest('li');
    if (card === null) throw new Error(`no card for ${name}`);
    return card;
  };

  it('starts with four square cards, each with a level, a number and a sky', () => {
    screenWith();
    const list = screen.getByRole('list', { name: 'Your places' });
    const cards = Array.from(list.children) as HTMLElement[];
    expect(cards).toHaveLength(4);
    const names = cards.map((card) => card.querySelector('.pc-name')?.textContent);
    expect(names).toEqual(['Home', 'School', 'Office', 'Park']);
    const levels = cards.map((card) => card.querySelector('.pc-level')?.textContent);
    expect(new Set(levels).size).toBe(4);
    for (const card of cards)
      expect(card.querySelector('.pc-aqi strong')?.textContent).toMatch(/^\d+$/u);
  });

  it('opens a card out to the next two days and where the number came from, and folds it again', async () => {
    screenWith();
    const home = cardOf('Home');
    expect(within(home).queryByRole('list', { name: 'Next two days' })).not.toBeInTheDocument();
    await userEvent.click(within(home).getByRole('button', { name: /^Home/u }));
    const days = within(within(home).getByRole('list', { name: 'Next two days' })).getAllByRole(
      'listitem',
    );
    expect(days).toHaveLength(2);
    expect(home).toHaveTextContent('Sample data');
    expect(within(home).getByRole('button', { name: /^Home/u })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.click(within(home).getByRole('button', { name: /^Home/u }));
    expect(within(home).queryByRole('list', { name: 'Next two days' })).not.toBeInTheDocument();
  });

  it('links an opened card to its place page', async () => {
    screenWith();
    await userEvent.click(within(cardOf('Home')).getByRole('button', { name: /^Home/u }));
    expect(screen.getByRole('link', { name: /Open Home/u })).toHaveAttribute(
      'href',
      '/place/28.59%2C77.05',
    );
  });

  it('removes a place, and remembers it after a reload', async () => {
    screenWith();
    await userEvent.click(screen.getByRole('button', { name: 'Remove School' }));
    expect(screen.queryByRole('button', { name: /^School\b/u })).not.toBeInTheDocument();
    cleanup();
    screenWith();
    expect(screen.queryByRole('button', { name: /^School\b/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Home\b/u })).toBeInTheDocument();
  });

  it('says plainly when nothing is pinned', async () => {
    screenWith();
    for (const name of ['Home', 'School', 'Office', 'Park']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    expect(screen.getByText(/Nothing pinned yet/u)).toBeInTheDocument();
  });

  it('searches by name and pins what the person picks, at the top', async () => {
    screenWith({ search: () => Promise.resolve([lucknow]) });
    await userEvent.type(screen.getByRole('searchbox'), 'Lucknow');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Lucknow' }));
    const cards = Array.from(
      screen.getByRole('list', { name: 'Your places' }).children,
    ) as HTMLElement[];
    expect(cards).toHaveLength(5);
    const first = cards[0];
    if (first === undefined) throw new Error('no cards');
    expect(first.querySelector('.pc-name')).toHaveTextContent('Lucknow');
  });

  it('says so when no monitors cover the search, and when search is down', async () => {
    screenWith({ search: () => Promise.resolve([]) });
    await userEvent.type(screen.getByRole('searchbox'), 'Paris');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No monitors cover that place/u)).toBeInTheDocument();
    cleanup();
    screenWith({ search: () => Promise.reject(new Error('offline')) });
    await userEvent.type(screen.getByRole('searchbox'), 'Delhi');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/Search is not working right now/u)).toBeInTheDocument();
  });

  it('pins the person’s location when it is inside our area', async () => {
    screenWith({
      locate: (found) => {
        found(28.6, 77.2);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('button', { name: /^Near you\b/u })).toBeInTheDocument();
  });

  it('explains when the location is outside our area or cannot be read', async () => {
    screenWith({
      locate: (found) => {
        found(48.8, 2.3);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent(/outside the area/u);
    cleanup();
    screenWith({
      locate: (_found, fail) => {
        fail();
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not get your location/u);
  });
});

describe('moving between Places and a place', () => {
  it('opens a place from its card and comes back with the back link', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /^Park\b/u }));
    await userEvent.click(screen.getByRole('link', { name: /Open Park/u }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Park' })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: 'Good' })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('banner')).getByRole('link', { name: /My Air/u }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'My Air' })).toBeInTheDocument();
  });

  it('says so when a place is not pinned, with a way back', () => {
    window.location.hash = '#/place/nowhere';
    render(<App />);
    expect(screen.getByText(/not pinned on this device/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your places' })).toBeInTheDocument();
  });
});
