import type { Mode, Provenance, ProvenanceSource, TrustLabel } from '@vayu/contracts';
import { toMs } from './time';

export const ageMinutes = (observedAt: string, asOf: string): number =>
  Math.max(0, Math.round((toMs(asOf) - toMs(observedAt)) / 60_000));

/** A paired unit is "Your room", a station is "Nearby station", everything modelled is an "Estimate". */
export function trustLabelFor(source: ProvenanceSource): TrustLabel {
  switch (source) {
    case 'unit':
      return 'Your room';
    case 'station':
      return 'Nearby station';
    default:
      return 'Estimate';
  }
}

export interface ProvenanceInput {
  readonly mode: Mode;
  readonly source: ProvenanceSource;
  readonly asOf: string;
  readonly fetchedAt?: string | undefined;
  readonly observedAt?: string | undefined;
  readonly stationId?: string | undefined;
  readonly stationName?: string | undefined;
  readonly distanceKm?: number | undefined;
  readonly simulated?: boolean | undefined;
  readonly label?: TrustLabel | undefined;
}

/** Builds provenance with the age computed, so no caller can forget it (rule I2). */
export function makeProvenance(input: ProvenanceInput): Provenance {
  return {
    mode: input.mode,
    label: input.label ?? trustLabelFor(input.source),
    source: input.source,
    fetchedAt: input.fetchedAt ?? input.asOf,
    asOf: input.asOf,
    ageMinutes: input.observedAt === undefined ? 0 : ageMinutes(input.observedAt, input.asOf),
    ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
    ...(input.stationId === undefined ? {} : { stationId: input.stationId }),
    ...(input.stationName === undefined ? {} : { stationName: input.stationName }),
    ...(input.distanceKm === undefined ? {} : { distanceKm: input.distanceKm }),
    ...(input.simulated === true ? { simulated: true } : {}),
  };
}
