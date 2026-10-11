import type { Fire } from '../map/fires';
import type { WindPoint } from '../map/live';

/**
 * What a recorded day changes outside the air store: the satellite fires of the day and the wind, which the app would
 * otherwise ask our API for as of this minute. Set by the week player; empty in the app everyone else uses.
 */
export interface WeekScene {
  readonly fires: readonly Fire[];
  readonly wind: readonly WindPoint[];
}

let scene: WeekScene | undefined;

export function setWeekScene(next: WeekScene | undefined): void {
  scene = next;
}

/** The recorded day on screen, or undefined when the app is running on the real, current air. */
export const weekScene = (): WeekScene | undefined => scene;

/** Whether the app is playing the recorded week. Nothing then leaves the device: no report, no request is sent. */
export const weekActive = (): boolean => scene !== undefined;
