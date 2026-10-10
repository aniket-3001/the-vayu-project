import type { MapMode } from './MapView';

export interface Shown {
  readonly monitors: boolean;
  readonly gradient: boolean;
  readonly fires: boolean;
  readonly wind: boolean;
}

/** What each view opens with: the flat map is for readings and fires, the globe is for the air moving. */
export const defaultLayers = (mode: MapMode): Shown =>
  mode === 'map'
    ? { monitors: true, gradient: false, fires: true, wind: false }
    : { monitors: false, gradient: true, fires: false, wind: true };

export const LAYER_LABELS: Readonly<
  Record<keyof Shown, { readonly name: string; readonly note: string }>
> = {
  monitors: { name: 'Monitors', note: 'Readings from stations and community sensors' },
  gradient: { name: 'Air colour', note: 'An estimate between monitors, not a measurement' },
  wind: { name: 'Wind', note: 'Sample flow, drawn as moving streaks' },
  fires: { name: 'Fires', note: 'Burning detected by satellite, mostly stubble' },
};
