import { cpcbAqiFor, grapStageFor } from '../tasks/model';
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
 * Whether the morning assembly should be inside or on the open ground, by the GRAP stage our estimate points to:
 * no stage leaves it on the ground; Stage I keeps it on the ground but short, with children who have asthma
 * staying in; Stage II and above puts it inside. The AQI expected at eight is quoted beside it. Where the stage
 * cannot be worked out (no PM10 to go with the PM2.5), the AQI at eight decides instead, and the words say so.
 * Our advice, never an order: the official GRAP order comes first.
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
  const known = cpcbAqiFor(data) !== null;
  const stage = grapStageFor(data);
  const numeral = ['', 'I', 'II', 'III', 'IV'][stage] ?? '';
  const basis = known
    ? stage === 0
      ? `No GRAP stage is likely (AQI ${String(aqi)} at ${when}).`
      : `GRAP Stage ${numeral} is likely (AQI ${String(aqi)} at ${when}).`
    : `No GRAP stage could be worked out, so this is from the AQI: ${String(aqi)} at ${when}.`;
  // Without a stage, the AQI stands in for it: unhealthy (151+) is as bad as Stage II, 101 to 150 as Stage I.
  const effective = known ? stage : aqi >= 151 ? 2 : aqi >= 101 ? 1 : 0;
  if (effective >= 2)
    return {
      where: 'inside',
      label: 'Inside',
      words: `Hold assembly inside, in classrooms or the hall. ${basis}`,
      aqi,
      when,
    };
  if (effective === 1)
    return {
      where: 'short',
      label: 'Open ground, kept short',
      words: `The open ground is fine if it is short, under 15 minutes. Children with asthma can stay in. ${basis}`,
      aqi,
      when,
    };
  return {
    where: 'open',
    label: 'Open ground',
    words: `The open ground is fine. ${basis}`,
    aqi,
    when,
  };
}
