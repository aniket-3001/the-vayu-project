import { cpcbAqiFor, grapStageFor } from '../tasks/model';
import { hourName, hourOfDay, isoDate } from '../today/time';
import type { TodayData } from '../today/types';

/** Where a school's morning assembly should be held, by the air expected at assembly time. */
export interface AssemblyAdvice {
  readonly where: 'open' | 'short' | 'inside' | 'closed';
  /** The GRAP stage this follows, 0 to 4; where none could be worked out, the stage the AQI stands in for (0 to 2). */
  readonly stage: 0 | 1 | 2 | 3 | 4;
  /** "Inside", "Open ground, kept short", "Open ground", "None: school likely closed". */
  readonly label: string;
  /** What the stage means for school, as short lines for the place's page. Our reading, never an order. */
  readonly rules: readonly string[];
  /** Why: the stage (or AQI) and the hour it was taken at, as one sentence. */
  readonly basis: string;
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
  const effective: 0 | 1 | 2 | 3 | 4 = known ? stage : aqi >= 151 ? 2 : aqi >= 101 ? 1 : 0;
  switch (effective) {
    case 4:
      return {
        where: 'closed',
        stage: 4,
        label: 'None: school likely closed',
        rules: [
          'School is likely closed or moved online, so there is no assembly to hold.',
          'Do not send children before you have read the school’s notice and the official order.',
          'If the school is open, keep everyone indoors.',
        ],
        words: `At Stage IV schools are likely to be shut or moved online, so there is no assembly to hold. Read the school’s notice and the official order. ${basis}`,
        aqi,
        when,
        basis,
      };
    case 3:
      return {
        where: 'inside',
        stage: 3,
        label: 'Inside',
        rules: [
          'No assembly, sport or play outside: hold anything that must happen inside.',
          'Younger classes may be moved online or paused by the authorities.',
          'Check the school’s notice and the official order.',
        ],
        words: `No assembly, sport or play outside; hold it inside if at all. Younger classes may be moved online. ${basis}`,
        aqi,
        when,
        basis,
      };
    case 2:
      return {
        where: 'inside',
        stage: 2,
        label: 'Inside',
        rules: [
          'Hold assembly inside, in classrooms or the hall.',
          'Limit time outside: no outdoor sport or long play.',
          'A well-fitted N95 or FFP2 mask for the way to and from school.',
        ],
        words: `Hold assembly inside, in classrooms or the hall, and limit time outside. ${basis}`,
        aqi,
        when,
        basis,
      };
    case 1:
      return {
        where: 'short',
        stage: 1,
        label: 'Open ground, kept short',
        rules: [
          'Keep assembly on the open ground short, under 15 minutes, or hold it inside.',
          'Limit time outside for sport and play; children with asthma stay in.',
        ],
        words: `Limit time outside: the open ground is fine if it is short, under 15 minutes, or hold it inside. Children with asthma can stay in. ${basis}`,
        aqi,
        when,
        basis,
      };
    case 0:
      return {
        where: 'open',
        stage: 0,
        label: 'Open ground',
        rules: ['The open ground is fine for assembly, sport and play.'],
        words: `The open ground is fine. ${basis}`,
        aqi,
        when,
        basis,
      };
  }
}
