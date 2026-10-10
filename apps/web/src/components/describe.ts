import type { Provenance } from '@vayu/contracts';

export interface ProvenanceText {
  /** "Nearby station", "Estimate" or "Your room". */
  readonly source: string;
  /** "12 min ago", "3 h ago", or "forecast". */
  readonly age: string;
  /** "Live", "Replay", "Model", "Measured" or "Sample data". */
  readonly mode: string;
}

const MODE_NAMES = {
  live: 'Live',
  replay: 'Replay',
  model: 'Model',
  measured: 'Measured',
} as const;

export function ageText(prov: Provenance): string {
  if (prov.source === 'forecast' || prov.source === 'pattern') return 'forecast';
  if (prov.source === 'model') return 'model';
  const minutes = prov.ageMinutes;
  if (minutes < 2) return 'just now';
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

/** Plain words for where a number came from. Every number is shown with these (rule I2). */
export function describeProvenance(prov: Provenance): ProvenanceText {
  return {
    source: prov.label,
    age: ageText(prov),
    mode: prov.simulated === true ? 'Sample data' : MODE_NAMES[prov.mode],
  };
}

export const roundPm = (value: number): string => String(Math.round(value));
