/**
 * The two numbers in the exposure estimate that we did not measure. Both are rough, both are shown to
 * the person as "Assumed", and both give way to a real reading: a monitor in the room replaces the
 * indoor figure. Change them here and the screen follows.
 */

/** Indoor PM2.5 as a share of the outdoor figure when windows are shut and nothing is cleaning the air. */
export const INDOOR_SHARE = 0.6;

/** PM2.5 in a park with trees, as a share of open air. Trees help a little; the size varies a great deal. */
export const TREE_SHARE = 0.85;

export const ASSUMPTION_NOTES: readonly string[] = [
  `Indoors with no monitor, we assume the air is about ${String(Math.round(INDOOR_SHARE * 100))}% of what it is outside.`,
  `In a park with trees, we assume about ${String(Math.round(TREE_SHARE * 100))}% of the open-air figure.`,
  'With a Vayu monitor in a place, its reading replaces the indoor assumption for that place.',
  'Outdoor air comes from the nearest monitor, so it can be off by a few streets.',
];
