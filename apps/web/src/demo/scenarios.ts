import { DEVICES_STORAGE_KEY, type Device } from '../devices/devices';
import { PEOPLE_STORAGE_KEY, ME, type Household } from '../exposure/people';
import { UNITS_STORAGE_KEY } from '../units/AirUnits';
import { APP_KEYS, DEMO_STORAGE_KEY, type DemoState } from './state';

export interface Scenario {
  readonly id: string;
  readonly label: string;
  /** One line on what to look at, shown while the tour plays. */
  readonly caption: string;
  /** Where in the app it starts, as a hash route. */
  readonly route: string;
  /** How long the tour stays on it. */
  readonly seconds: number;
  readonly state: Omit<DemoState, 'id' | 'name'>;
  /** What else the scenario saves on the device before the app opens. */
  readonly saved?: Readonly<Record<string, unknown>>;
}

const HOME_PAGE = `/place/${encodeURIComponent('28.59,77.05')}`;

const HOME_MONITOR: readonly Device[] = [{ id: 'demo-home', name: 'Living room', where: 'home' }];

const WITH_ASHA: Household = {
  people: [ME, { id: 'asha', name: 'Asha', age: 9, day: 'school' }],
  current: 'asha',
};

/** The presets, in the order of the one-minute tour. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'good',
    label: 'Good time to walk',
    caption: 'A clean day: the tips find the best hour for a walk.',
    route: '/',
    seconds: 5,
    state: { day: 'good' },
  },
  {
    id: 'bad',
    label: 'Bad day',
    caption: 'An unhealthy day: the tips say to keep walks short and the windows shut.',
    route: '/',
    seconds: 5,
    state: { day: 'unhealthy' },
  },
  {
    id: 'grap',
    label: 'GRAP Stage IV',
    caption: 'Hazardous air: our unofficial GRAP stage, and what to do.',
    route: '/',
    seconds: 5,
    state: { day: 'hazardous', openAlert: 'grap-today' },
  },
  {
    id: 'stubble',
    label: 'Stubble burning',
    caption: 'Heavy fires nearby: an alert with a way to reach the authorities.',
    route: '/',
    seconds: 5,
    state: { day: 'unhealthy', fires: 140, openAlert: 'stubble' },
  },
  {
    id: 'smoke',
    label: 'Cigarettes a day',
    caption: 'The same air as cigarettes a day, beside every AQI.',
    route: '/',
    seconds: 5,
    state: { day: 'unhealthy' },
    saved: { [UNITS_STORAGE_KEY]: 'smoke' },
  },
  {
    id: 'rain',
    label: 'Rainy day',
    caption: 'Rain clears the air: hours, wind and rain on a place page.',
    route: HOME_PAGE,
    seconds: 5,
    state: { day: 'rainy' },
  },
  {
    id: 'monitor',
    label: 'My monitor',
    caption: 'The monitor at home: air now, the cleaner switching itself on, the day.',
    route: '/?add=device',
    seconds: 6,
    state: { day: 'unhealthy' },
    saved: { [DEVICES_STORAGE_KEY]: HOME_MONITOR },
  },
  {
    id: 'exposure',
    label: 'My exposure',
    caption: 'A monitor at home and a day out: where the air got to you.',
    route: '/exposure',
    seconds: 6,
    state: { day: 'unhealthy', live: true },
    saved: { [DEVICES_STORAGE_KEY]: HOME_MONITOR, [UNITS_STORAGE_KEY]: 'smoke' },
  },
  {
    id: 'child',
    label: 'A child at school',
    caption:
      'Add a child with school hours and days: the school’s monitor is picked up on its own.',
    route: '/exposure',
    seconds: 5,
    state: { day: 'dusty' },
    saved: { [PEOPLE_STORAGE_KEY]: WITH_ASHA },
  },
  {
    id: 'map',
    label: 'Map and wind',
    caption: 'Monitors, fires and the wind, on one globe.',
    route: '/map',
    seconds: 5,
    state: { day: 'unhealthy', fires: 127 },
  },
  {
    id: 'lens',
    label: 'AIR Lens',
    caption: 'Point the camera: what the number means where you stand.',
    route: '/lens',
    seconds: 5,
    state: { day: 'unhealthy' },
  },
  {
    id: 'ask',
    label: 'Assistant',
    caption: 'Say what someone did outdoors: Asha’s walk is added to her day.',
    route: '/exposure',
    seconds: 6,
    state: { day: 'moderate', ask: 'Asha took a walk in the park for 40 minutes' },
    saved: { [PEOPLE_STORAGE_KEY]: WITH_ASHA },
  },
];

/**
 * More presets to look at one by one: they are in the picker but not in the one-minute tour, which stays about a
 * minute.
 */
export const MORE_SCENARIOS: readonly Scenario[] = [
  {
    id: 'rain-alert',
    label: 'Rain alert',
    caption: 'Dark clouds, drops that bead and slide down the card: rain should clear the air.',
    route: '/',
    seconds: 5,
    state: { day: 'rainy', openAlert: 'rain-0' },
  },
  {
    id: 'wind',
    label: 'Windy day',
    caption: 'Wind carries smoke and dust away: streaks and leaves behind the words.',
    route: '/',
    seconds: 5,
    state: { day: 'hazardous', openAlert: 'wind-0' },
  },
  {
    id: 'place',
    label: 'Place details',
    caption: 'On a place’s page: its insights, then hours beside pollutants, days beside advice.',
    route: HOME_PAGE,
    seconds: 6,
    state: { day: 'hazardous' },
  },
];

/** Every preset, tour first. */
export const ALL_SCENARIOS: readonly Scenario[] = [...SCENARIOS, ...MORE_SCENARIOS];

export const scenarioById = (id: string | null | undefined): Scenario | undefined =>
  ALL_SCENARIOS.find((scenario) => scenario.id === id);

/** Total seconds the tour takes. */
export const TOUR_SECONDS = SCENARIOS.reduce((sum, scenario) => sum + scenario.seconds, 0);

/**
 * Sets the device up for a scenario: clears what the app saved, then saves only what the scenario needs.
 * Returns the route to open. Nothing here reaches a server.
 */
export function applyScenario(storage: Storage, scenario: Scenario): string {
  try {
    for (const key of APP_KEYS) storage.removeItem(key);
    for (const [key, value] of Object.entries(scenario.saved ?? {})) {
      storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    const state: DemoState = { id: scenario.id, name: scenario.label, ...scenario.state };
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be blocked; the app then simply opens as it does by default.
  }
  return scenario.route;
}
