import { rules, type RawHour, type SimInput, type SimPoint, type SimResult } from '@vayu/contracts';
import { bandFromConcentration } from './bands';
import { mean } from './stats';
import { HOUR_MS, floorToHourMs, toIso, toMs } from './time';

/**
 * A well-mixed single room, solved exactly for each step with inputs held constant over the step:
 *
 *     lambda  = a + k + Q / V
 *     Css     = (a * P * Cout + S / V) / lambda
 *     C(t+dt) = Css + (C(t) - Css) * exp(-lambda * dt)
 *
 * `a` air changes per hour, `P` penetration, `k` deposition, `Q` total cleaner airflow (m3/h),
 * `V` volume (m3), `S` an indoor source.
 */
export function steadyState(
  airChanges: number,
  penetration: number,
  outdoor: number,
  deposition: number,
  cleanerFlow: number,
  volume: number,
  source = 0,
): number {
  const lambda = airChanges + deposition + cleanerFlow / volume;
  return (airChanges * penetration * outdoor + source / volume) / lambda;
}

export function stepConcentration(
  current: number,
  airChanges: number,
  penetration: number,
  outdoor: number,
  deposition: number,
  cleanerFlow: number,
  volume: number,
  hours: number,
  source = 0,
): number {
  const lambda = airChanges + deposition + cleanerFlow / volume;
  const target = steadyState(
    airChanges,
    penetration,
    outdoor,
    deposition,
    cleanerFlow,
    volume,
    source,
  );
  return target + (current - target) * Math.exp(-lambda * hours);
}

interface Outdoor {
  readonly pm25: number;
  readonly pm10: number;
}

function outdoorLookup(hours: readonly RawHour[]): (ms: number) => Outdoor {
  const sorted = [...hours].sort((a, b) => toMs(a.hourStart) - toMs(b.hourStart));
  const first = sorted[0];
  if (first === undefined) throw new RangeError('A simulation needs at least one outdoor hour');
  const byStart = new Map(sorted.map((hour) => [toMs(hour.hourStart), hour]));
  return (ms) => {
    const hour =
      byStart.get(floorToHourMs(ms)) ??
      sorted.findLast((candidate) => toMs(candidate.hourStart) <= ms) ??
      first;
    return { pm25: hour.pm25 ?? 0, pm10: hour.pm10 ?? hour.pm25 ?? 0 };
  };
}

/** Runs the room model for a duration with optional smoke and dust puffs, with and without cleaners. */
export function simulate(input: SimInput, defaults = rules.room): SimResult {
  const volume = input.room.volumeM3;
  const airChanges = input.room.airChangesPerHour;
  const penetration = defaults.penetration;
  const deposition = defaults.deposition;
  const stepMinutes = input.stepMinutes ?? defaults.stepMinutes;
  const stepHours = stepMinutes / 60;
  const steps = Math.round((input.durationHours * 60) / stepMinutes);
  const start = toMs(input.startAt);
  const outdoorAt = outdoorLookup(input.outdoor);

  const flow25 = input.cleaners.reduce((sum, c) => sum + c.count * c.spec.cadrM3h.pm25, 0);
  const flow10 = input.cleaners.reduce((sum, c) => sum + c.count * c.spec.cadrM3h.pm10, 0);
  const puffs = input.events.map((event) => ({
    at: toMs(event.at),
    pm25: event.pm25 ?? 0,
    pm10: event.pm10 ?? 0,
  }));

  const run = (cleanerFlow25: number, cleanerFlow10: number): SimPoint[] => {
    const first = outdoorAt(start);
    let pm25 = steadyState(airChanges, penetration, first.pm25, deposition.pm25, 0, volume);
    let pm10 = steadyState(airChanges, penetration, first.pm10, deposition.pm10, 0, volume);
    const points: SimPoint[] = [];
    for (let step = 0; step <= steps; step++) {
      const now = start + step * stepMinutes * 60_000;
      for (const puff of puffs) {
        if (puff.at >= now && puff.at < now + stepMinutes * 60_000) {
          pm25 += puff.pm25;
          pm10 += puff.pm10;
        }
      }
      points.push({ ts: toIso(now), pm25, pm10 });
      const outdoor = outdoorAt(now);
      pm25 = stepConcentration(
        pm25,
        airChanges,
        penetration,
        outdoor.pm25,
        deposition.pm25,
        cleanerFlow25,
        volume,
        stepHours,
      );
      pm10 = stepConcentration(
        pm10,
        airChanges,
        penetration,
        outdoor.pm10,
        deposition.pm10,
        cleanerFlow10,
        volume,
        stepHours,
      );
    }
    return points;
  };

  const meanOutdoor25 = mean(
    Array.from(
      { length: Math.floor(input.durationHours) + 1 },
      (_, hour) => outdoorAt(floorToHourMs(start) + hour * HOUR_MS).pm25,
    ),
  );
  const withCleaners = steadyState(
    airChanges,
    penetration,
    meanOutdoor25,
    deposition.pm25,
    flow25,
    volume,
  );
  const withoutCleaners = steadyState(
    airChanges,
    penetration,
    meanOutdoor25,
    deposition.pm25,
    0,
    volume,
  );
  const lambda = airChanges + deposition.pm25 + flow25 / volume;

  const firstCleaner = input.cleaners[0]?.spec;
  const target = input.targetAch ?? defaults.targetAch.classroom;
  const unitsNeeded =
    firstCleaner !== undefined && firstCleaner.cadrM3h.pm25 > 0
      ? Math.ceil((target * volume) / firstCleaner.cadrM3h.pm25)
      : 0;

  return {
    schemaVersion: 1,
    series: run(flow25, flow10),
    baseline: run(0, 0),
    summary: {
      halvingMinutes: (Math.LN2 / lambda) * 60,
      steadyPm25: withCleaners,
      steadyPm25NoCleaner: withoutCleaners,
      lowerPct: withoutCleaners > 0 ? (1 - withCleaners / withoutCleaners) * 100 : 0,
      bandBefore: bandFromConcentration('pm25', withoutCleaners),
      bandAfter: bandFromConcentration('pm25', withCleaners),
      changesPerHour: flow25 / volume,
      unitsNeeded,
    },
    assumptions: [
      { name: 'Penetration of outdoor air', value: penetration, basis: 'assumed' },
      { name: 'Air changes per hour', value: airChanges, basis: 'assumed' },
      { name: 'Deposition PM2.5 (per hour)', value: deposition.pm25, basis: 'assumed' },
      { name: 'Deposition PM10 (per hour)', value: deposition.pm10, basis: 'assumed' },
      ...input.cleaners.map((cleaner) => ({
        name: `${cleaner.spec.name} CADR PM2.5 (m3/h)`,
        value: cleaner.spec.cadrM3h.pm25,
        basis: cleaner.spec.basis,
      })),
      { name: 'Target clean-air changes per hour', value: target, basis: 'assumed' as const },
    ],
  };
}
