import type { Place } from './schemas';

/** Four fixed demo places. Coordinates are approximate and used only to pick a station. */
export const DEMO_PLACES: readonly Place[] = [
  { id: 'home', name: 'Home', kind: 'home', lat: 28.5921, lng: 77.046 },
  { id: 'school', name: 'School', kind: 'school', lat: 28.5672, lng: 77.176 },
  { id: 'office', name: 'Office', kind: 'office', lat: 28.6315, lng: 77.2167 },
  { id: 'park', name: 'Park', kind: 'park', lat: 28.5931, lng: 77.2197 },
];

/** How much dirtier or cleaner each sample place is than the sample city series. */
export const SAMPLE_SCALE: Readonly<Record<string, number>> = {
  home: 1,
  school: 1.12,
  office: 0.92,
  park: 0.78,
};
