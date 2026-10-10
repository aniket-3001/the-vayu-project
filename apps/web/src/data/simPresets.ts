import { rules, type CleanerSpec, type RoomSpec } from '@vayu/contracts';

type Leakiness = RoomSpec['leakiness'];

const { airChangesPerHour } = rules.room;

/** A few named rooms, differing only in size and leakiness — custom dimensions are full-tier. */
export const ROOM_PRESETS: readonly RoomSpec[] = [
  {
    id: 'home-bedroom',
    name: 'Home bedroom',
    lengthM: 4,
    widthM: 3.5,
    heightM: 3,
    airChangesPerHour: airChangesPerHour.typical,
    leakiness: 'typical',
    volumeM3: 4 * 3.5 * 3,
  },
  {
    id: 'classroom-closed',
    name: 'Classroom, windows shut',
    lengthM: 10,
    widthM: 7,
    heightM: 3.5,
    airChangesPerHour: airChangesPerHour.closed,
    leakiness: 'closed',
    volumeM3: 10 * 7 * 3.5,
  },
  {
    id: 'classroom-windows-open',
    name: 'Classroom, windows open',
    lengthM: 10,
    widthM: 7,
    heightM: 3.5,
    airChangesPerHour: airChangesPerHour.windows_open,
    leakiness: 'windows_open',
    volumeM3: 10 * 7 * 3.5,
  },
];

export const LEAKINESS_LABEL: Record<Leakiness, string> = {
  closed: 'Closed (sealed well)',
  typical: 'Typical (a few gaps)',
  windows_open: 'Windows open',
  custom: 'Custom',
};

/** Our unit — CADR is a placeholder until the lab test (06.4/06.5) gives a measured number. */
export const OUR_UNIT: CleanerSpec = {
  id: 'vayu-unit',
  name: 'Our unit',
  layers: ['foam', 'merv13'],
  cadrM3h: { pm25: 250, pm10: 280 },
  basis: 'assumed',
};
