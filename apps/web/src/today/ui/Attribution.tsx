import { MapPin } from 'lucide-react';
import type { TodayData } from '../types';
import { Pill } from './Chip';

const age = (minutes: number): string => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  return `${String(Math.round(minutes / 60))} h ago`;
};

/** Where the number came from and how old it is. Our one addition to the IQAir layout. */
export function Attribution({ data }: { readonly data: TodayData }): React.JSX.Element {
  const p = data.provenance;
  return (
    <section className="attribution" aria-label="Where this comes from">
      <Pill>{p.mode === 'live' ? 'Live' : 'Sample data'}</Pill>
      <p>
        <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>
          {p.stationName}, {p.distanceKm} km away · {age(p.ageMinutes)}
        </span>
      </p>
      <p className="muted">
        {p.stations} stations from {p.contributors} contributors
      </p>
    </section>
  );
}
