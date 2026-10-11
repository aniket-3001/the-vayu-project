import type { Pin } from '../data/pins';
import { weekActive } from './active';
import { WEEK_PINS } from './storage';

/**
 * The recorded days are a shared recording: the same for everyone who opens them. What a visitor adds on top is theirs,
 * kept in memory in their own tab and gone when the tab is closed or reloaded. What the recording starts with cannot be
 * removed, so it is always there to look at. These say what is original; outside the recorded days nothing is.
 */
export const isOriginalPlace = (pin: Pin): boolean =>
  weekActive() && WEEK_PINS.some((original) => original.id === pin.id);

export const isOriginalPerson = (personId: string): boolean => weekActive() && personId === 'me';

/** The place the original person is set to be at, from the recording. */
export const isOriginalSpot = (personId: string, pin: Pin | undefined): boolean =>
  pin !== undefined && isOriginalPerson(personId) && isOriginalPlace(pin);

/** What is said on the page, in the app and in the recorded days' information panel. */
export const RECORDING_NOTICE =
  'This is a shared recording, the same for everyone who opens it. You can add places and people on top of it. They stay in this tab only and are gone when you close or reload it. The original places, person and days cannot be changed or deleted.';
