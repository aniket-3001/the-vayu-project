import { rules, type HourPoint } from '@vayu/contracts';
import { exposureAvoided, hourOfDay, localDate, localHour, type ExposureAvoided } from '@vayu/core';

/**
 * What a "Done" tap on a walk/airing window actually avoided, against the usual time for that
 * kind of activity (`rules.walkWindow.usualStart`) on the same day. Uses `core.exposureAvoided`
 * directly (04.5's own done-criterion) rather than re-deriving the math here.
 */
export function impactOfDoing(
  hours: readonly HourPoint[],
  chosenStartIso: string,
): ExposureAvoided | null {
  const date = localDate(chosenStartIso);
  const usualHour = hourOfDay(rules.walkWindow.usualStart);
  const usualPoint = hours.find(
    (hour) => localDate(hour.hourStart) === date && localHour(hour.hourStart) === usualHour,
  );
  if (usualPoint === undefined) {
    return null;
  }
  return exposureAvoided(hours, usualPoint.hourStart, chosenStartIso, 1);
}
