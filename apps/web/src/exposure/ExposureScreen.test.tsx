// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICES_STORAGE_KEY } from '../devices/devices';
import { AirUnitsProvider, UNITS_STORAGE_KEY } from '../units/AirUnits';
import { ExposureScreen } from './ExposureScreen';
import { PEOPLE_STORAGE_KEY } from './people';
import { SPOTS_STORAGE_KEY } from './spots';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'geolocation');
});

const open = (): void => {
  render(
    <MemoryRouter>
      <AirUnitsProvider>
        <ExposureScreen />
      </AirUnitsProvider>
    </MemoryRouter>,
  );
};

/** Adds someone through the sheet: a name, an age, and whatever else the test changes first. */
const addPerson = async (
  name: string,
  age: string,
  between?: () => Promise<void>,
): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: /Add person/u }));
  const sheet = screen.getByRole('dialog', { name: 'Add a person' });
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), name);
  await userEvent.type(within(sheet).getByRole('spinbutton', { name: 'Age' }), age);
  if (between !== undefined) await between();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
};

const cellsFilled = (): number => document.querySelectorAll('.cell:not(.empty)').length;

describe('the Exposure screen', () => {
  it('opens on Today, for an adult, with a dial, an answer, and only the places that matter', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Today’s exposure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Me/u })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /24-hour dial/u })).toBeInTheDocument();
    for (const name of ['Home', 'Work', 'Outdoor', 'Live location']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('region', { name: 'School' })).not.toBeInTheDocument();
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent(
      'so far today (17 hours)',
    );
  });

  it('keeps the tabs to four at most: All, Home, Work, Outdoor', () => {
    open();
    const group = screen.getByRole('group', { name: 'Show' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'Home', 'Work', 'Outdoor']);
  });

  it('adds a child, whose day goes to school instead of work, with school hours of 8 to 3', async () => {
    open();
    await addPerson('Asha', '9');
    expect(screen.getByRole('button', { name: /^Asha/u })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'School' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Work' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'School' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('School from')).toHaveValue('8');
    expect(screen.getByLabelText('School until')).toHaveValue('15');
    expect(window.localStorage.getItem(PEOPLE_STORAGE_KEY)).toContain('Asha');
  });

  it('adds an older person who stays mostly home: three tabs', async () => {
    open();
    await addPerson('Dadu', '70');
    const group = screen.getByRole('group', { name: 'Show' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'Home', 'Outdoor']);
  });

  it('lets the hours be changed before adding, and uses them', async () => {
    open();
    await addPerson('Asha', '9', async () => {
      const sheet = screen.getByRole('dialog', { name: 'Add a person' });
      await userEvent.selectOptions(within(sheet).getByLabelText('School until'), '14:00');
    });
    expect(screen.getByLabelText('School until')).toHaveValue('14');
  });

  it('asks for a name and a sensible age, and says what is wrong', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /Add person/u }));
    const sheet = screen.getByRole('dialog', { name: 'Add a person' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please give them a name.');
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'X');
    await userEvent.type(within(sheet).getByRole('spinbutton', { name: 'Age' }), '300');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('between 0 and 110');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches between people, each with their own places, and can remove one', async () => {
    open();
    await addPerson('Asha', '9');
    await userEvent.click(screen.getByRole('button', { name: /^Me/u }));
    expect(screen.getByRole('region', { name: 'Work' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Asha/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Asha' }));
    expect(screen.queryByRole('button', { name: /^Asha/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Me/u })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Remove Me' })).not.toBeInTheDocument();
  });

  it('gives a child the school’s unit automatically, with nothing added, and says so', () => {
    window.localStorage.setItem(
      PEOPLE_STORAGE_KEY,
      JSON.stringify({
        people: [{ id: 'kid', name: 'Asha', age: 9, day: 'school' }],
        current: 'kid',
      }),
    );
    open();
    const school = screen.getByRole('region', { name: 'School' });
    expect(school).toHaveTextContent('Vayu unit at the school');
    expect(school).toHaveTextContent(/you did not have to add it/u);
    expect(screen.getByRole('button', { name: 'How this is worked out' })).toBeInTheDocument();
  });

  it('puts the span in the order Past week, Yesterday, Today', () => {
    open();
    const group = screen.getByRole('group', { name: 'Span' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Past week', 'Yesterday', 'Today']);
    expect(within(group).getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a full day for yesterday, with the WHO line', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Yesterday’s exposure' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent('over the day');
    expect(screen.getByText(/times the WHO 24-hour guideline of 15/u)).toBeInTheDocument();
  });

  it('shows the past week as seven days, and opens a day when it is tapped', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Past week' }));
    expect(screen.getByRole('heading', { level: 1, name: 'The past week' })).toBeInTheDocument();
    const week = screen.getByRole('region', { name: 'The past week' });
    expect(within(week).getAllByRole('button')).toHaveLength(7);
    expect(week).toHaveTextContent(/Cleanest day: .* Worst: /u);
    await userEvent.click(
      within(week).getByRole('button', { name: /Sat 3 Oct: AQI \d+.*Open this day/u }),
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Exposure on Sat 3 Oct' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent('over the day');
  });

  it('opens any date from the calendar when we have it, and says plainly when we do not', () => {
    open();
    const date = screen.getByLabelText('Another date');
    fireEvent.change(date, { target: { value: '2026-10-01' } });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Exposure on Thu 1 Oct' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '' })?.textContent ?? '').not.toMatch(/No data/u);
    fireEvent.change(date, { target: { value: '2026-03-01' } });
    expect(screen.getByRole('status')).toHaveTextContent('No data for Sun 1 Mar.');
    expect(screen.queryByRole('img', { name: /24-hour dial/u })).not.toBeInTheDocument();
    fireEvent.change(date, { target: { value: '2026-10-20' } });
    expect(screen.getByRole('status')).toHaveTextContent('No data for Tue 20 Oct.');
  });

  it('says how much rests on an assumption, and lists the assumptions on request', async () => {
    open();
    expect(screen.getByText(/hours rest on an assumption/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How this is worked out' }));
    expect(screen.getByRole('note')).toHaveTextContent(/60% of what it is outside/u);
    expect(screen.getByRole('note')).toHaveTextContent(/made-up sample data/u);
  });

  it('shows what each hour was when it is picked, and says when an hour is in the future', () => {
    open();
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '12' } });
    expect(screen.getByText('12:00 to 13:00')).toBeInTheDocument();
    expect(document.querySelector('.readout')).toHaveTextContent(/Work, /u);
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '22' } });
    expect(screen.getByText('That hour has not happened yet.')).toBeInTheDocument();
  });

  it('narrows to one kind of place, and has no tab for live location', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Home' }),
    );
    expect(screen.getByRole('region', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Live location' })).not.toBeInTheDocument();
  });

  it('changes the hours a place is usually used, and the dial follows', async () => {
    open();
    const work = screen.getByRole('region', { name: 'Work' });
    const before = cellsFilled();
    await userEvent.selectOptions(within(work).getByLabelText('Work until'), '12:00');
    expect(cellsFilled()).toBeLessThan(before);
    expect(window.localStorage.getItem(SPOTS_STORAGE_KEY)).toContain('"to":12');
  });

  it('keeps each person’s changes apart', async () => {
    open();
    await userEvent.selectOptions(
      within(screen.getByRole('region', { name: 'Work' })).getByLabelText('Work until'),
      '12:00',
    );
    await addPerson('Asha', '9');
    expect(screen.getByLabelText('School until')).toHaveValue('15');
    await userEvent.click(screen.getByRole('button', { name: /^Me/u }));
    expect(screen.getByLabelText('Work until')).toHaveValue('12');
  });

  it('removes a place and says there is nothing to add up when none are left', async () => {
    open();
    for (const name of ['Home', 'Work', 'Outdoor']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    expect(screen.getByText(/Nothing to add up yet/u)).toBeInTheDocument();
  });

  it('uses a monitor at home for every kind of person who lives there, and says so', async () => {
    window.localStorage.setItem(
      DEVICES_STORAGE_KEY,
      JSON.stringify([{ id: 'd1', name: 'Bedroom unit', where: 'home' }]),
    );
    open();
    expect(screen.getByRole('region', { name: 'Home' })).toHaveTextContent(
      'Bedroom unit is here. It is yours',
    );
    await addPerson('Asha', '9');
    expect(screen.getByRole('region', { name: 'Home' })).toHaveTextContent(
      'Bedroom unit is here. It is yours',
    );
    expect(screen.getByRole('region', { name: 'School' })).toHaveTextContent(
      'Vayu unit at the school',
    );
  });

  it('adds cigarettes a day to the answer when the relatable measure is on', () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    open();
    expect(screen.getAllByText(/cigarettes? a day/u).length).toBeGreaterThan(0);
  });

  it('shows a made-up day of live movement on request, and picks up a friend’s unit by itself', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Show a sample day' }));
    expect(screen.getByText('Sample track')).toBeInTheDocument();
    expect(screen.getByText(/10 hours logged today/u)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '15' } });
    expect(document.querySelector('.readout')).toHaveTextContent(/Live, .*\(from a nearby unit\)/u);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No hours logged yet.')).toBeInTheDocument();
  });

  it('asks the browser for the location, logs the hour, and handles a refusal', async () => {
    let succeed: ((p: GeolocationPosition) => void) | undefined;
    let fail: (() => void) | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: (p: GeolocationPosition) => void, no: () => void) => {
          succeed = ok;
          fail = no;
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Use live location' }));
    expect(screen.getByRole('region', { name: 'Live location' })).toHaveTextContent(
      'Asking your browser',
    );
    act(() => {
      succeed?.({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition);
    });
    expect(screen.getByRole('button', { name: 'Turn off live location' })).toBeInTheDocument();
    expect(screen.getByText(/1 hour logged today/u)).toBeInTheDocument();
    act(() => {
      fail?.();
    });
    expect(screen.getByRole('region', { name: 'Live location' })).toHaveTextContent(
      /did not give us your location/u,
    );
  });
});
