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

/** Presses a person in the list, which opens their timetable. */
const openPanel = async (name: string): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}\\b`, 'u') }));
  return screen.getByRole('dialog', { name: new RegExp(`${name}’s day`, 'u') });
};

const closePanel = async (): Promise<void> => {
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
};

const cellsFilled = (): number => document.querySelectorAll('.cell:not(.empty)').length;

describe('the Exposure screen', () => {
  it('opens on Today, for me, with a dial and an answer, and nothing to set up on the page', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Today’s exposure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Me/u })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /24-hour dial/u })).toBeInTheDocument();
    expect(screen.getByText(/You breathed an average of AQI/u)).toHaveTextContent(
      'so far today (17 hours)',
    );
    for (const name of ['Home', 'Work', 'Outdoor', 'Live location']) {
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
    }
  });

  it('ends at Your day in the air: the last thing on the page is the answer', () => {
    open();
    const main = document.querySelector('.exposure-main');
    expect(main?.lastElementChild).toBe(
      screen.getByRole('region', { name: 'Your day in the air' }),
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

  it('opens a person’s timetable when they are pressed, with a place for each part of their day', async () => {
    open();
    const panel = await openPanel('Me');
    for (const name of ['Home', 'Work', 'Live location']) {
      expect(within(panel).getByRole('region', { name })).toBeInTheDocument();
    }
    // Home has no hours: the rest of the time is at home. Work has its days. Your own outdoor time is automatic.
    expect(within(panel).queryByLabelText('Home from')).not.toBeInTheDocument();
    expect(within(panel).getByRole('group', { name: 'Work days' })).toBeInTheDocument();
    expect(within(panel).queryByRole('region', { name: 'Outdoor time' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('region', { name: 'School' })).not.toBeInTheDocument();
    await closePanel();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds a child, whose day goes to school instead of work, with school hours of 8 to 3', async () => {
    open();
    await addPerson('Asha', '9');
    expect(screen.getByRole('button', { name: /^Asha/u })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'School' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show' })).queryByRole('button', { name: 'Work' }),
    ).not.toBeInTheDocument();
    const panel = await openPanel('Asha');
    expect(within(panel).getByLabelText('School from')).toHaveValue('8');
    expect(within(panel).getByLabelText('School until')).toHaveValue('15');
    expect(within(panel).queryByRole('region', { name: 'Live location' })).not.toBeInTheDocument();
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
    const panel = await openPanel('Asha');
    expect(within(panel).getByLabelText('School until')).toHaveValue('14');
  });

  it('asks for a name and a sensible age, and says what is wrong', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /Add person/u }));
    const sheet = screen.getByRole('dialog', { name: 'Add a person' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Please give them a name.');
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'X');
    await userEvent.type(within(sheet).getByRole('spinbutton', { name: 'Age' }), '300');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('between 0 and 110');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes a person from their own panel, and never the last one', async () => {
    open();
    await addPerson('Asha', '9');
    const panel = await openPanel('Asha');
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove Asha' }));
    expect(screen.queryByRole('button', { name: /^Asha/u })).not.toBeInTheDocument();
    const mine = await openPanel('Me');
    expect(within(mine).queryByRole('button', { name: 'Remove Me' })).not.toBeInTheDocument();
  });

  it('gives a child the school’s unit automatically, with nothing added, and says so', async () => {
    window.localStorage.setItem(
      PEOPLE_STORAGE_KEY,
      JSON.stringify({
        people: [{ id: 'kid', name: 'Asha', age: 9, day: 'school' }],
        current: 'kid',
      }),
    );
    open();
    const panel = await openPanel('Asha');
    const school = within(panel).getByRole('region', { name: 'School' });
    expect(school).toHaveTextContent('Vayu unit at the school');
    expect(school).toHaveTextContent(/you did not have to add it/u);
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
  });

  it('opens any date from the calendar when we have it, and says plainly when we do not', () => {
    open();
    const date = screen.getByLabelText('Another date');
    fireEvent.change(date, { target: { value: '2026-10-01' } });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Exposure on Thu 1 Oct' }),
    ).toBeInTheDocument();
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

  it('shows what each hour was when it is picked, and says when an hour is in the future', async () => {
    open();
    // Today is a Saturday, when there is no work: the whole day is at home.
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '12' } });
    expect(document.querySelector('.readout')).toHaveTextContent(/Home, /u);
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '22' } });
    expect(screen.getByText('That hour has not happened yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '12' } });
    expect(screen.getByText('12:00 to 13:00')).toBeInTheDocument();
    expect(document.querySelector('.readout')).toHaveTextContent(/Work, /u);
  });

  it('narrows the dial to one kind of place, with no tab for live location', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Home' }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Home' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes the hours a place is usually used from the timetable, and the dial follows', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    const before = cellsFilled();
    const panel = await openPanel('Me');
    await userEvent.selectOptions(
      within(within(panel).getByRole('region', { name: 'Work' })).getByLabelText('Work until'),
      '12:00',
    );
    await closePanel();
    expect(cellsFilled()).toBeLessThan(before);
    expect(window.localStorage.getItem(SPOTS_STORAGE_KEY)).toContain('"to":12');
  });

  it('keeps each person’s changes apart', async () => {
    open();
    const mine = await openPanel('Me');
    await userEvent.selectOptions(
      within(within(mine).getByRole('region', { name: 'Work' })).getByLabelText('Work until'),
      '12:00',
    );
    await closePanel();
    await addPerson('Asha', '9');
    const hers = await openPanel('Asha');
    expect(within(hers).getByLabelText('School until')).toHaveValue('15');
    await closePanel();
    const again = await openPanel('Me');
    expect(within(again).getByLabelText('Work until')).toHaveValue('12');
  });

  it('removes a place in the timetable and says there is nothing to add up when none are left', async () => {
    open();
    const panel = await openPanel('Me');
    for (const name of ['Home', 'Work']) {
      await userEvent.click(within(panel).getByRole('button', { name: `Remove ${name}` }));
    }
    await closePanel();
    expect(screen.getByText(/Nothing to add up yet/u)).toBeInTheDocument();
  });

  it('uses a monitor at home for everyone who lives there, and says so', async () => {
    window.localStorage.setItem(
      DEVICES_STORAGE_KEY,
      JSON.stringify([{ id: 'd1', name: 'Bedroom unit', where: 'home' }]),
    );
    open();
    const mine = await openPanel('Me');
    expect(within(mine).getByRole('region', { name: 'Home' })).toHaveTextContent(
      'Bedroom unit is here. It is yours',
    );
    await closePanel();
    await addPerson('Asha', '9');
    const hers = await openPanel('Asha');
    expect(within(hers).getByRole('region', { name: 'Home' })).toHaveTextContent(
      'Bedroom unit is here. It is yours',
    );
    expect(within(hers).getByRole('region', { name: 'School' })).toHaveTextContent(
      'Vayu unit at the school',
    );
  });

  it('adds a small square cigarettes card beside the answer when the relatable measure is on', () => {
    window.localStorage.setItem(UNITS_STORAGE_KEY, 'smoke');
    open();
    const summary = screen.getByRole('region', { name: 'Your day in the air' });
    expect(
      within(summary).getByRole('group', { name: /cigarettes? a day\./u }),
    ).toBeInTheDocument();
  });
});

describe('working it out from where I am', () => {
  const fakeLocation = (): { succeed: () => void; fail: () => void } => {
    let ok: ((p: GeolocationPosition) => void) | undefined;
    let no: (() => void) | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (success: (p: GeolocationPosition) => void, failure: () => void) => {
          ok = success;
          no = failure;
          return 1;
        },
        clearWatch: () => undefined,
      },
    });
    return {
      succeed: () => {
        act(() => {
          ok?.({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition);
        });
      },
      fail: () => {
        act(() => {
          no?.();
        });
      },
    };
  };

  it('is a switch for me, off to begin with, and not there for anyone else', async () => {
    open();
    const toggle = screen.getByRole('switch', { name: /Work it out from where I am/u });
    expect(toggle).not.toBeChecked();
    await addPerson('Asha', '9');
    expect(screen.queryByRole('switch', { name: /where I am/u })).not.toBeInTheDocument();
  });

  it('asks the browser when switched on, logs the hour, and stops and clears when switched off', async () => {
    const location = fakeLocation();
    open();
    const toggle = screen.getByRole('switch', { name: /Work it out from where I am/u });
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    location.succeed();
    expect(screen.getByText(/On\. Using your location/u)).toBeInTheDocument();
    const panel = await openPanel('Me');
    expect(within(panel).getByRole('region', { name: 'Live location' })).toHaveTextContent(
      /1 hour logged today/u,
    );
    await closePanel();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('says plainly when the browser would not share the location', async () => {
    const location = fakeLocation();
    open();
    await userEvent.click(screen.getByRole('switch', { name: /Work it out from where I am/u }));
    location.fail();
    const panel = await openPanel('Me');
    expect(within(panel).getByRole('region', { name: 'Live location' })).toHaveTextContent(
      /did not give us your location/u,
    );
  });

  it('shows a made-up day of movement from the timetable, and picks up a friend’s unit by itself', async () => {
    open();
    const panel = await openPanel('Me');
    await userEvent.click(within(panel).getByRole('button', { name: 'Show a sample day' }));
    expect(within(panel).getByText('Sample track')).toBeInTheDocument();
    expect(within(panel).getByText(/10 hours logged today/u)).toBeInTheDocument();
    await closePanel();
    fireEvent.change(screen.getByRole('slider', { name: 'Hour' }), { target: { value: '15' } });
    expect(document.querySelector('.readout')).toHaveTextContent(/Live, .*\(from a nearby unit\)/u);
  });

  it('adds a person with just school or work hours and the days it runs, and the rest is home', async () => {
    open();
    await addPerson('Asha', '9', async () => {
      const sheet = screen.getByRole('dialog', { name: 'Add a person' });
      expect(within(sheet).queryByLabelText(/Park|Outdoor|Home from/u)).not.toBeInTheDocument();
      expect(within(sheet).getByRole('group', { name: 'School days' })).toBeInTheDocument();
      // Monday to Friday to begin with; add Saturday, drop Friday.
      await userEvent.click(within(sheet).getByRole('button', { name: 'Saturday' }));
      await userEvent.click(within(sheet).getByRole('button', { name: 'Friday' }));
    });
    const saved = JSON.parse(window.localStorage.getItem(SPOTS_STORAGE_KEY) ?? '{}') as Record<
      string,
      { school?: { days?: number[] } }
    >;
    const school = Object.values(saved).find((s) => s.school !== undefined)?.school;
    expect(school?.days).toEqual([1, 2, 3, 4, 6]);
    const panel = await openPanel('Asha');
    expect(within(panel).getByRole('button', { name: 'Saturday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(panel).getByRole('button', { name: 'Friday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('will not add school or work with no day picked', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /Add person/u }));
    const sheet = screen.getByRole('dialog', { name: 'Add a person' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Asha');
    await userEvent.type(within(sheet).getByRole('spinbutton', { name: 'Age' }), '9');
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      await userEvent.click(within(sheet).getByRole('button', { name: d }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add person' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(/at least one day for school/u);
  });

  it('logs a walk for someone else, shows it on the Outdoor tab, and lets it be removed', async () => {
    open();
    expect(screen.queryByRole('button', { name: /Log outdoor time/u })).not.toBeInTheDocument();
    await addPerson('Asha', '9');
    await userEvent.click(screen.getByRole('button', { name: /Log outdoor time for Asha/u }));
    const sheet = screen.getByRole('dialog', { name: /Outdoor time for Asha/u });
    await userEvent.selectOptions(within(sheet).getByLabelText('Where'), 'Park');
    await userEvent.selectOptions(within(sheet).getByLabelText('For how long'), '45 minutes');
    await userEvent.click(within(sheet).getByRole('button', { name: /Add to Asha/u }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Outdoor' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(cellsFilled()).toBeGreaterThan(0);
    const panel = await openPanel('Asha');
    const outdoor = within(panel).getByRole('region', { name: 'Outdoor time' });
    expect(outdoor).toHaveTextContent('Walk or run in Park');
    expect(outdoor).toHaveTextContent('45 min');
    await userEvent.click(
      within(outdoor).getByRole('button', { name: /^Remove walk or run in Park/u }),
    );
    expect(within(panel).queryByText(/Walk or run in Park/u)).not.toBeInTheDocument();
  });

  it('will not log outdoor time that has not happened yet', async () => {
    open();
    await addPerson('Asha', '9');
    await userEvent.click(screen.getByRole('button', { name: /Log outdoor time for Asha/u }));
    const sheet = screen.getByRole('dialog', { name: /Outdoor time for Asha/u });
    fireEvent.change(within(sheet).getByLabelText('Started at'), { target: { value: '19:00' } });
    await userEvent.click(within(sheet).getByRole('button', { name: /Add to Asha/u }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('has not happened yet');
  });
});
