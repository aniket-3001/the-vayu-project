import { rules } from '@vayu/contracts';
import { maxPm25ForUsAqi } from '@vayu/core';

export interface WalkLimit {
  /** The highest US AQI at which we still suggest an hour outside. */
  readonly usAqi: number;
  /** The PM2.5 (µg/m³) at that US AQI. */
  readonly pm25: number;
}

/** The limit the walk and airing advice applies, set from the EPA's own guidance. */
export function walkLimit(sensitive: boolean): WalkLimit {
  const aqi = sensitive ? rules.walkWindow.maxUsAqiSensitive : rules.walkWindow.maxUsAqi;
  return { usAqi: aqi, pm25: maxPm25ForUsAqi(aqi) };
}

/** One plain sentence saying which limit is being applied to whom, so the difference is visible. */
export function limitSentence(name: string, sensitive: boolean): string {
  const limit = walkLimit(sensitive);
  const who = sensitive
    ? `${name}, the stricter limit applies`
    : `${name}, the standard limit applies`;
  return `For ${who}: we only suggest an hour outside when the air stays at or under US AQI ${limit.usAqi} (PM2.5 ${limit.pm25} µg/m³).`;
}
