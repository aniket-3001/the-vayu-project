import { levelForAqi } from '../design/levels';
import { hourName, hourOfDay, isoDate } from '../today/time';
import type { TodayData } from '../today/types';

/** Where a school's morning assembly should be held, by the air expected at assembly time. */
export interface AssemblyAdvice {
  readonly where: 'open' | 'short' | 'inside';
  /** "Inside", "Open ground, kept short", "Open ground". */
  readonly label: string;
  /** One sentence for the school: what to do and why. */
  readonly words: string;
  readonly aqi: number;
  /** The hour the air was taken at, such as "8 am", or "tomorrow, 8 am". */
  readonly when: string;
}

/** Assembly is held at eight in the morning, as most schools do. */
export const ASSEMBLY_HOUR = 8;

/**
 * Whether the morning assembly should be inside or on the open ground, from the AQI forecast for eight o'clock:
 * today's if it has not passed (or is just under way), otherwise the next day's. Unhealthy air (AQI 151 or more)
 * puts it inside; air that is only unhealthy for sensitive groups keeps it on the ground but short; anything
 * cleaner leaves it where it is. Our advice, not an order.
 */
export function assemblyFor(data: TodayData): AssemblyAdvice {
  const nowHour = hourOfDay(data.asOf);
  const today = isoDate(data.asOf);
  const wanted = nowHour >= ASSEMBLY_HOUR + 1 ? 'tomorrow' : 'today';
  const slot = data.hourly.find((h) => {
    const day = isoDate(h.at);
    return (
      Math.floor(hourOfDay(h.at)) === ASSEMBLY_HOUR &&
      (wanted === 'today' ? day === today : day !== today)
    );
  });
  const aqi = slot?.aqi ?? data.aqi;
  const when = `${wanted === 'tomorrow' ? 'tomorrow, ' : ''}${hourName(ASSEMBLY_HOUR)}`;
  const level = levelForAqi(aqi).name.toLowerCase();
  if (aqi >= 151)
    return {
      where: 'inside',
      label: 'Inside',
      words: `Hold assembly inside, in classrooms or the hall. The air is expected to be ${level} (AQI ${String(aqi)}) at ${when}.`,
      aqi,
      when,
    };
  if (aqi >= 101)
    return {
      where: 'short',
      label: 'Open ground, kept short',
      words: `The open ground is fine if it is short, under 15 minutes. Children with asthma can stay in. AQI ${String(aqi)} at ${when}.`,
      aqi,
      when,
    };
  return {
    where: 'open',
    label: 'Open ground',
    words: `The open ground is fine. AQI ${String(aqi)} is expected at ${when}.`,
    aqi,
    when,
  };
}
