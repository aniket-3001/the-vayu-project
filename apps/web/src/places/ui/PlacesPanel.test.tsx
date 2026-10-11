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
      <MyAirScreen address={() => Promise.resolve('Sector 49, Gurugram')} {...props} />
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

  it('shows today and the next two days on the card itself, with no arrow to open it', () => {
    screenWith();
    const home = cardOf('Home');
    const actions = home.querySelector('.pc-actions');
    expect(actions?.querySelectorAll('button')).toHaveLength(1);
    expect(actions?.querySelector('button')).toHaveAccessibleName('Remove Home');
    expect(
      within(home).queryByRole('button', { name: /three days|Fold/u }),
    ).not.toBeInTheDocument();
    const days = within(
      within(home).getByRole('list', { name: 'Today and the next two days' }),
    ).getAllByRole('listitem');
    expect(days).toHaveLength(3);
    expect(days[0]).toHaveTextContent('Today');
    expect(home).toHaveTextContent('Sample data');
  });

  it('shows a glowing GRAP pill, coloured by stage, on a card where a stage is likely, and only there', () => {
    screenWith();
    const cards = Array.from(
      screen
        .getByRole('list', { name: 'Your places' })
        .querySelectorAll<HTMLElement>('li.place-card'),
    );
    const withPill = cards.filter((card) => card.querySelector('.grap-pill') !== null);
    // The sample Park is clean and the sample school is hazardous: one has a stage, the other none.
    expect(withPill.length).toBeGreaterThan(0);
    expect(withPill.length).toBeLessThan(cards.length);
    for (const card of withPill) {
      const pill = card.querySelector('.grap-pill');
      expect(pill?.className).toMatch(/grap-s[1-4]/u);
      expect(pill?.textContent).toMatch(/^GRAP [1-4]$/u);
    }
    expect(cardOf('Park').querySelector('.grap-pill')).not.toBeInTheDocument();
  });

  it('has the face, and the number with its label, on the card', () => {
    screenWith();
    const home = cardOf('Home');
    expect(home.querySelector('.pc-face')).toBeInTheDocument();
    expect(home.querySelector('.pc-aqi strong')).toBeInTheDocument();
  });

  it('says in one short line, on a school’s card, whether the morning assembly is inside or on the ground', () => {
    screenWith();
    const line = cardOf('School').querySelector('.pc-note');
    expect(line).toHaveClass('assembly');
    expect(line).toHaveTextContent(/^Morning assembly: (Inside|Open ground)/u);
    // One line only: the reasons and the AQI are on the place's page.
    expect(line?.textContent?.length).toBeLessThan(45);
    expect(cardOf('Home').querySelector('.pc-note')).not.toHaveClass('assembly');
  });

  it('gives every card one short note in the same place, so the cards read alike', () => {
    screenWith();
    const notes = Array.from(document.querySelectorAll('.place-card .pc-note'));
    expect(notes.length).toBeGreaterThanOrEqual(2);
    const home = cardOf('Home').querySelector('.pc-note');
    expect(home).toHaveTextContent(/^Cleanest hour: /u);
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

  it('says plainly when nothing is pinned: three set-up fields and the plus square are left', async () => {
    screenWith();
    for (const name of ['Home', 'School', 'Office', 'Park']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    for (const name of ['Set Home', 'Set Work or school', 'Set Park', 'Add a place'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('asks for home, work or school, and a park as input fields, and a field becomes a card when set', async () => {
    window.localStorage.setItem('vayu.pins.v1', '[]');
    screenWith({
      locate: (found) => {
        found(28.4, 77.05);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Set Home' }));
    const sheet = screen.getByRole('dialog', { name: 'Where is home?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Detect my location' }));
    // Home needs no name: it goes straight to a card, with the address under it.
    const card = (await screen.findByRole('link', { name: 'Open Home' })).closest('li');
    expect(card?.querySelector('.pc-name')).toHaveTextContent('Home');
    expect(card?.querySelector('.pc-detail')).toHaveTextContent('Sector 49, Gurugram');
    expect(screen.queryByRole('button', { name: 'Set Home' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Work or school' })).toBeInTheDocument();
    // And it counts in the owner's day on Exposure.
    const spots = JSON.parse(window.localStorage.getItem('vayu.spots.v3') ?? '{}') as {
      me?: { home?: { pin?: { name?: string } } };
    };
    expect(spots.me?.home?.pin?.name).toBe('Home');
  });

  const chooseSchool = async (): Promise<void> => {
    if (window.localStorage.getItem('vayu.pins.v1') === null)
      window.localStorage.setItem('vayu.pins.v1', '[]');
    screenWith({
      locate: (found) => {
        found(28.4, 77.05);
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Set Work or school' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Where do you work or study?' })).getByRole(
        'button',
        { name: 'Detect my location' },
      ),
    );
    const name = screen.getByRole('dialog', { name: 'Name this place' });
    // Only the two, and no name of your own.
    expect(within(name).queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(within(name).getByRole('button', { name: 'School' }));
    await userEvent.click(within(name).getByRole('button', { name: /Pin it/u }));
  };
  const peopleStored = (): { people?: { id: string; name: string; age: number; day: string }[] } =>
    JSON.parse(window.localStorage.getItem('vayu.people.v1') ?? '{}') as {
      people?: { id: string; name: string; age: number; day: string }[];
    };

  it('makes the work or school field a choice of the two, asks who it is for, and the day follows when it is you', async () => {
    await chooseSchool();
    const who = screen.getByRole('dialog', { name: 'Who is this for?' });
    await userEvent.click(within(who).getByRole('checkbox', { name: /Me/u }));
    await userEvent.click(within(who).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('link', { name: 'Open School' })).toBeInTheDocument();
    expect(peopleStored().people?.find((p) => p.id === 'me')?.day).toBe('school');
  });

  it('asks who it is for with the right people ticked: a school for the children, home for everyone', async () => {
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
    await chooseSchool();
    const who = screen.getByRole('dialog', { name: 'Who is this for?' });
    expect(within(who).getByRole('checkbox', { name: /Asha/u })).toBeChecked();
    expect(within(who).getByRole('checkbox', { name: /Me/u })).not.toBeChecked();
    await userEvent.click(within(who).getByRole('button', { name: 'Done' }));
    const spots = JSON.parse(window.localStorage.getItem('vayu.spots.v3') ?? '{}') as Record<
      string,
      { school?: { pin: { lat: number } } }
    >;
    expect(spots.asha?.school?.pin.lat).toBeCloseTo(28.4, 1);
    // The owner's own day is not turned into a school day.
    expect(peopleStored().people?.find((p) => p.id === 'me')?.day).toBe('work');
  });

  it('adds someone new to the family when it is for them, with the place set as theirs and not as yours', async () => {
    await chooseSchool();
    const who = screen.getByRole('dialog', { name: 'Who is this for?' });
    await userEvent.click(within(who).getByRole('button', { name: 'Someone new' }));
    expect(await screen.findByRole('link', { name: 'Open School' })).toBeInTheDocument();
    const form = screen.getByRole('dialog', { name: /Add the person for School/u });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Asha');
    await userEvent.type(within(form).getByRole('spinbutton', { name: 'Age' }), '9');
    await userEvent.click(within(form).getByRole('button', { name: 'Add person' }));
    const people = peopleStored().people ?? [];
    const asha = people.find((p) => p.name === 'Asha');
    expect(asha).toMatchObject({ age: 9, day: 'school' });
    expect(people.find((p) => p.id === 'me')?.day).not.toBe('school');
    const spots = JSON.parse(window.localStorage.getItem('vayu.spots.v3') ?? '{}') as Record<
      string,
      { school?: { pin: { lat: number } } }
    >;
    expect(spots[asha?.id ?? '']?.school?.pin.lat).toBeCloseTo(28.4, 1);
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
    await userEvent.click(within(where).getByRole('button', { name: 'Detect my location' }));
    const name = screen.getByRole('dialog', { name: 'Name this place' });
    // It cannot be pinned without a name.
    expect(within(name).getByRole('button', { name: /Pin it/u })).toBeDisabled();
    await userEvent.type(within(name).getByRole('textbox'), 'Gym');
    await userEvent.click(within(name).getByRole('button', { name: /Pin it/u }));
    expect(await screen.findByRole('link', { name: 'Open Gym' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  const openAdd = async (): Promise<HTMLElement> => {
    await userEvent.click(screen.getByRole('button', { name: 'Add a place' }));
    return screen.getByRole('dialog', { name: 'Add a place' });
  };

  it('has no search bar on the page: the first card adds a place', () => {
    screenWith();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    const first = screen.getByRole('list', { name: 'Your places' }).firstElementChild;
    expect(first).toHaveClass('add-place');
    expect(first?.querySelector('button')).toHaveAccessibleName('Add a place');
  });

  it('asks for a name before a searched place is pinned, and accepts any name', async () => {
    screenWith({ search: () => Promise.resolve([lucknow]) });
    const where = await openAdd();
    await userEvent.type(within(where).getByRole('searchbox'), 'Lucknow');
    await userEvent.click(within(where).getByRole('button', { name: 'Search' }));
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
    const link = await screen.findByRole('link', { name: 'Open Aunt’s house' });
    expect(link).toBeInTheDocument();
    // The card still says which place it is, under the name.
    expect(link).toHaveTextContent('Lucknow');
  });

  it('says so when no monitors cover the search, and when search is down', async () => {
    screenWith({ search: () => Promise.resolve([]) });
    let where = await openAdd();
    await userEvent.type(within(where).getByRole('searchbox'), 'Paris');
    await userEvent.click(within(where).getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/could not find that/u)).toBeInTheDocument();
    cleanup();
    screenWith({ search: () => Promise.reject(new Error('offline')) });
    where = await openAdd();
    await userEvent.type(within(where).getByRole('searchbox'), 'Delhi');
    await userEvent.click(within(where).getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/Search is not working right now/u)).toBeInTheDocument();
  });

  it('pins where you are under a name you choose, from Detect my location in the add sheet', async () => {
    screenWith({
      locate: (found) => {
        found(28.6, 77.2);
      },
    });
    const where = await openAdd();
    await userEvent.click(within(where).getByRole('button', { name: 'Detect my location' }));
    const sheet = screen.getByRole('dialog', { name: 'Name this place' });
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Name for this place' }),
      'Gym',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: /Pin it/u }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Gym' })).toBeInTheDocument();
  });

  it('keeps it live instead: the switch is on, and a live card that says so appears', async () => {
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
    const where = await openAdd();
    await userEvent.click(within(where).getByRole('button', { name: 'Detect my location' }));
    await userEvent.click(screen.getByRole('button', { name: /Follow me instead/u }));
    expect(store.get().enabled).toBe(true);
    const link = await screen.findByRole('link', { name: 'Open Live location' });
    const card = link.closest('li');
    expect(card).toHaveClass('live-card');
    expect(card?.querySelector('.live-pill')).toHaveTextContent('LIVE');
    expect(card?.querySelector('.live-pill .live-dot')).toBeInTheDocument();
    expect(card?.querySelector('.outdoor-tag')).toHaveTextContent('Outdoor');
    // The address sits under the heading, and the live card cannot be removed.
    expect(card?.querySelector('.pc-detail')).toHaveTextContent('Sector 49, Gurugram');
    expect(screen.queryByRole('button', { name: /Remove Live location/u })).not.toBeInTheDocument();
    setLiveLocation(undefined);
  });

  it('calls the live card “Same as Home” when it is at a saved place, and drops the Outdoor tag', async () => {
    const store = createLiveLocation({
      storage: window.localStorage,
      geolocation: () =>
        ({
          getCurrentPosition: (ok: PositionCallback) => {
            // Within a few metres of the sample Home, 28.59, 77.05.
            ok({ coords: { latitude: 28.5902, longitude: 77.0501 } } as GeolocationPosition);
          },
        }) as unknown as Geolocation,
    });
    setLiveLocation(store);
    store.set(true);
    screenWith();
    const link = await screen.findByRole('link', { name: 'Open Same as Home' });
    const card = link.closest('li');
    expect(card).toHaveClass('live-card');
    expect(card?.querySelector('.outdoor-tag')).not.toBeInTheDocument();
    expect(card?.querySelector('.live-pill')).toHaveTextContent('LIVE');
    setLiveLocation(undefined);
  });

  it('says so when the location cannot be read', async () => {
    screenWith({
      locate: (_found, fail) => {
        fail();
      },
    });
    const where = await openAdd();
    await userEvent.click(within(where).getByRole('button', { name: 'Detect my location' }));
    expect(within(where).getByRole('status')).toHaveTextContent(/could not get your location/u);
  });

  it('keeps the order of the cards when one is moved to another’s place', async () => {
    const { movePin } = await import('../../data/pins');
    const order = movePin(
      [
        { id: 'a', name: 'A', lat: 1, lng: 1 },
        { id: 'b', name: 'B', lat: 2, lng: 2 },
        { id: 'c', name: 'C', lat: 3, lng: 3 },
      ],
      'a',
      'c',
    ).map((p) => p.id);
    expect(order).toEqual(['b', 'c', 'a']);
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
