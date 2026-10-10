export interface Shown {
  readonly monitors: boolean;
  readonly gradient: boolean;
  readonly fires: boolean;
  readonly wind: boolean;
}

/** What the map opens with: readings, the washed-out air colour, fires, and the wind. */
export const defaultLayers = (): Shown => ({
  monitors: true,
  gradient: true,
  fires: true,
  wind: true,
});

export const LAYER_LABELS: Readonly<
  Record<keyof Shown, { readonly name: string; readonly note: string }>
> = {
  monitors: { name: 'Monitors', note: 'Readings from stations and community sensors' },
  gradient: { name: 'Air colour', note: 'An estimate between monitors, not a measurement' },
  wind: { name: 'Wind', note: 'Fading blocks that drift the way the wind blows' },
  fires: { name: 'Fires', note: 'Burning detected by satellite, mostly stubble' },
};
