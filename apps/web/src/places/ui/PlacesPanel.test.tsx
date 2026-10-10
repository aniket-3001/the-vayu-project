// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import type { PlaceMatch } from '../../data/geocode';
import { MyAirScreen } from '../../myair/MyAirScreen';
import { createLiveLocation, setLiveLocation } from '../liveLocation';

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
    const card = screen.getByRole('link', { name: `Open ${name}` }).closest('li');
    if (card === null) throw new Error(`no card for ${name}`);
    return card;
  };

  it('starts with four square cards, each with a level, a number and a sky', () => {
    screenWith();
    const list = screen.getByRole('list', { name: 'Your places' });
    // The four cards, then one dotted square with a plus to add a place.
    const cards = (Array.from(list.children) as HTMLElement[]).filter(
      (item) => !item.classList.contains('add-place'),
    );
    expect(cards).toHaveLength(4);
    expect(list.querySelector('.add-place button')).toHaveAccessibleName('Add a place');
    const names = cards.map((card) => card.querySelector('.pc-name')?.textContent);
    expect(names).toEqual(['Home', 'School', 'Office', 'Park']);
    const levels = cards.map((card) => card.querySelector('.pc-level')?.textContent);
    expect(new Set(levels).size).toBe(4);
    for (const card of cards)
      expect(card.querySelector('.pc-aqi strong')?.textContent).toMatch(/^\d+$/u);
  });

  it('opens the place when the card is pressed: a link to its page', () => {
    screenWith();
    expect(screen.getByRole('link', { name: 'Open Home' })).toHaveAttribute(
      'href',
      '/place/28.59%2C77.05',
    );
    expect(screen.getByRole('link', { name: 'Open School' })).toBeInTheDocument();
  });

  it('opens a card out to today and the next two days with an arrow beside the cross, and folds it again', async () => {
    screenWith();
    const home = cardOf('Home');
    expect(
      within(home).queryByRole('list', { name: 'Today and the next two days' }),
    ).not.toBeInTheDocument();
    const actions = home.querySelector('.pc-actions');
    expect(actions?.querySelectorAll('button')).toHaveLength(2);
    expect(actions?.querySelectorAll('button')[1]).toHaveAccessibleName('Remove Home');
    await userEvent.click(within(home).getByRole('button', { name: 'Show Home for three days' }));
    const days = within(
      within(home).getByRole('list', { name: 'Today and the next two days' }),
    ).getAllByRole('listitem');
    expect(days).toHaveLength(3);
    expect(days[0]).toHaveTextContent('Today');
    expect(home).toHaveTextContent('Sample data');
    expect(within(home).getByRole('button', { name: 'Fold Home' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.click(within(home).getByRole('button', { name: 'Fold Home' }));
    expect(
      within(home).queryByRole('list', { name: 'Today and the next two days' }),
    ).not.toBeInTheDocument();
  });

  it('puts the face in the bottom right of the square, and the number bottom left', () => {
    screenWith();
    const home = cardOf('Home');
    expect(home.querySelector('.pc-face')).toBeInTheDocument();
    expect(home.querySelector('.pc-aqi strong')).toBeInTheDocument();
  });

  it('removes a place, and remembers it after a reload', async () => {
    screenWith();
    await userEvent.click(screen.getByRole('button', { name: 'Remove School' }));
    expect(screen.queryByRole('link', { name: 'Open School' })).not.toBeInTheDocument();
    cleanup();
    screenWith();
    expect(screen.queryByRole('link', { name: 'Open School' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Home' })).toBeInTheDocument();
  });

  it('says plainly when nothing is pinned: only the dotted square with a plus is left', async () => {
    screenWith();
    for (const name of ['Home', 'School', 'Office', 'Park']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    const list = screen.getByRole('list', { name: 'Your places' });
    expect(list.children).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add a place' })).toBeInTheDocument();
  });

  it('adds a place from the plus square: where, then what to call it, then it is pinned under that name', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    screenWith({
      locate: (found) => {
        found(28.4, 77.05);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add a place' }));
    const where = screen.getByRole('dialog', { name: 'Add a place' });
    await userEvent.click(within(where).getByRole('button', { name: 'Detect me' }));
    const name = screen.getByRole('dialog', { name: 'Name this place' });
    // It cannot be pinned without a name.
    expect(within(name).getByRole('button', { name: /Pin it/u })).toBeDisabled();
    await userEvent.click(within(name).getByRole('button', { name: 'School' }));
    await userEvent.click(within(name).getByRole('button', { name: /Pin it/u }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open School' })).toBeInTheDocument();
  });

  it('asks for a name before a searched place is pinned, and accepts any name', async () => {
    screenWith({ search: () => Promise.resolve([lucknow]) });
    await userEvent.type(screen.getByRole('searchbox'), 'Lucknow');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Lucknow' }));
    // Not pinned yet: it is waiting for a name, and says which place it is.
    expect(screen.queryByRole('link', { name: 'Open Lucknow' })).not.toBeInTheDocument();
    const sheet = screen.getByRole('dialog', { name: 'Name this place' });
    expect(sheet).toHaveTextContent('Lucknow');
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Name for this place' }),
      'Aunt’s house',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: /Pin it/u }));
    const link = screen.getByRole('link', { name: 'Open Aunt’s house' });
    expect(link).toBeInTheDocument();
    // The card still says which place it is, under the name.
    expect(link).toHaveTextContent('Lucknow');
  });

  it('says so when no monitors cover the search, and when search is down', async () => {
    screenWith({ search: () => Promise.resolve([]) });
    await userEvent.type(screen.getByRole('searchbox'), 'Paris');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/could not find that/u)).toBeInTheDocument();
    cleanup();
    screenWith({ search: () => Promise.reject(new Error('offline')) });
    await userEvent.type(screen.getByRole('searchbox'), 'Delhi');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/Search is not working right now/u)).toBeInTheDocument();
  });

  it('asks what to do with where you are: pin it under a name you choose', async () => {
    screenWith({
      locate: (found) => {
        found(28.6, 77.2);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Detect me' }));
    const sheet = screen.getByRole('dialog', { name: 'Where you are' });
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Name for this place' }),
      'Gym',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: /Pin it/u }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Gym' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Near you' })).not.toBeInTheDocument();
  });

  it('keeps it live instead: the switch is on, and a card that follows you appears', async () => {
    const store = createLiveLocation({
      storage: window.localStorage,
      geolocation: () =>
        ({
          getCurrentPosition: (ok: PositionCallback) => {
            ok({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition);
          },
        }) as unknown as Geolocation,
    });
    setLiveLocation(store);
    screenWith({
      locate: (found) => {
        found(28.6, 77.2);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Detect me' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Live/u }),
    );
    expect(store.get().enabled).toBe(true);
    expect(await screen.findByRole('link', { name: 'Open Here' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Here' })).not.toBeInTheDocument();
    setLiveLocation(undefined);
  });

  it('says so when the place is outside our area, and when the location cannot be read', async () => {
    screenWith({
      locate: (found) => {
        found(48.8, 2.3);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Detect me' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/outside north India/u);
    cleanup();
    screenWith({
      locate: (_found, fail) => {
        fail();
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Detect me' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not get your location/u);
  });
});

describe('moving between Places and a place', () => {
  it('opens a place from its card and comes back with the back link', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Open Park' }));
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
