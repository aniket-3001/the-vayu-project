/**
 * What to do about the room's air, in plain words, from the room's AQI and (when there is one) the air outside.
 * Our advice from two numbers, not a health order.
 */
export interface RoomAdvice {
  readonly kind: 'air' | 'shut' | 'clean-up' | 'fine' | 'same';
  readonly title: string;
  readonly text: string;
}

/** Within this many AQI points, the room and outside are the same air. */
const SAME = 15;

export function roomAdvice(roomAqi: number, outsideAqi: number | undefined): RoomAdvice {
  if (outsideAqi !== undefined && outsideAqi + SAME < roomAqi)
    return {
      kind: 'air',
      title: 'Outside is cleaner than the room',
      text: `Outside is AQI ${String(outsideAqi)} and the room is ${String(roomAqi)}. Open a window or the door for ten minutes to air it, then close up. Cooking, incense and sweeping are the usual causes.`,
    };
  if (roomAqi >= 151)
    return {
      kind: 'clean-up',
      title: 'The room’s air is unhealthy',
      text:
        outsideAqi === undefined
          ? 'Keep windows shut, run a purifier if you have one, and avoid frying, incense and sweeping. Wear a well-fitted N95 if you have to be here for long.'
          : `Outside is no better (AQI ${String(outsideAqi)}). Keep windows shut, run a purifier if you have one, and avoid frying, incense and sweeping.`,
    };
  if (outsideAqi !== undefined && roomAqi + SAME < outsideAqi)
    return {
      kind: 'shut',
      title: 'The room is cleaner than outside',
      text: `The room is AQI ${String(roomAqi)} against ${String(outsideAqi)} outside. Keep windows and doors shut, and air the room only when outside gets cleaner.`,
    };
  if (roomAqi <= 50)
    return {
      kind: 'fine',
      title: 'The room’s air is good',
      text: 'Nothing to do. Good air in a room is the best breathing you will get all day.',
    };
  return {
    kind: 'same',
    title: 'The room is about as clean as outside',
    text:
      outsideAqi === undefined
        ? 'There is no outside reading to compare with yet. Keep an eye on the live line when you cook or sweep.'
        : `The room (AQI ${String(roomAqi)}) and outside (${String(outsideAqi)}) are close. A purifier or a shut window changes this: use the test below to see by how much.`,
  };
}
