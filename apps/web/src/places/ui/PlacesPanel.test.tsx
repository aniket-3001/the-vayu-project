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

  it('has the face, and the number with its label, on the card', () => {
    screenWith();
    const home = cardOf('Home');
    expect(home.querySelector('.pc-face')).toBeInTheDocument();
    expect(home.querySelector('.pc-aqi strong')).toBeInTheDocument();
  });

  it('shows, on a school’s card and only there, whether the morning assembly is inside or on the ground', () => {
    screenWith();
    const school = cardOf('School');
    const line = school.querySelector('.pc-assembly');
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/Morning assembly: (Inside|Open ground)/u);
    expect(line).toHaveTextContent(/AQI \d+/u);
    expect(cardOf('Home').querySelector('.pc-assembly')).not.toBeInTheDocument();
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
    await userEvent.click(within(sheet).getByRole('button', { name: 'Detect me' }));
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
        { name: 'Detect me' },
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

  it('makes the work or school field a choice of the two, asks who goes to a school, and the day follows when it is you', async () => {
    await chooseSchool();
    const who = screen.getByRole('dialog', { name: 'Who goes to this school?' });
    await userEvent.click(within(who).getByRole('button', { name: 'I do' }));
    expect(await screen.findByRole('link', { name: 'Open School' })).toBeInTheDocument();
    expect(peopleStored().people?.find((p) => p.id === 'me')?.day).toBe('school');
  });

  it('adds a child to the family when the school is theirs, with the school set as theirs and not as yours', async () => {
    await chooseSchool();
    const who = screen.getByRole('dialog', { name: 'Who goes to this school?' });
    await userEvent.click(within(who).getByRole('button', { name: 'My child' }));
    expect(await screen.findByRole('link', { name: 'Open School' })).toBeInTheDocument();
    const form = screen.getByRole('dialog', { name: /Add the child who goes to School/u });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Asha');
    await userEvent.type(within(form).getByRole('spinbutton', { name: 'Age' }), '9');
    await userEvent.click(within(form).getByRole('button', { name: 'Add person' }));
    const people = peopleStored().people ?? [];
    const asha = people.find((p) => p.name === 'Asha');
    expect(asha).toMatchObject({ age: 9, day: 'school' });
    // The owner's own day is not turned into a school day, and who Exposure looks at is unchanged.
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
    await userEvent.click(within(where).getByRole('button', { name: 'Detect me' }));
    const name = screen.getByRole('dialog', { name: 'Name this place' });
    // It cannot be pinned without a name.
    expect(within(name).getByRole('button', { name: /Pin it/u })).toBeDisabled();
    await userEvent.type(within(name).getByRole('textbox'), 'Gym');
    await userEvent.click(within(name).getByRole('button', { name: /Pin it/u }));
    expect(await screen.findByRole('link', { name: 'Open Gym' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    const link = await screen.findByRole('link', { name: 'Open Aunt’s house' });
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
