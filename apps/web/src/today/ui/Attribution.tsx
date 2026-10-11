import { MapPin } from 'lucide-react';
import type { TodayData } from '../types';
import { weekActive } from '../../week/active';
import { Pill } from './Chip';

const age = (minutes: number): string => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min old`;
  if (minutes < 48 * 60) return `${String(Math.round(minutes / 60))} h old`;
  return `${String(Math.round(minutes / 1440))} days old`;
};

/**
 * Where the number came from and how old it is (rule I2). A nearby monitor says which and how far. With no recent
 * monitor the screen says it is a regional model estimate, and that nothing here is a measurement.
 */
export function Attribution({ data }: { readonly data: TodayData }): React.JSX.Element {
  const p = data.provenance;
  // On a day of the recorded days the reading is real but not current, and the hours after it were recorded, not modelled.
  const recorded = weekActive();
  return (
    <section className="attribution" aria-label="Where this comes from">
      <Pill>
        {recorded
          ? 'Recorded'
          : p.mode === 'live'
            ? 'Live'
            : p.mode === 'model'
              ? 'Estimate'
              : 'Sample data'}
      </Pill>
      {p.stationName !== undefined && p.distanceKm !== undefined ? (
        <p>
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>
            {p.stationName}, {Math.round(p.distanceKm * 10) / 10} km away ·{' '}
            {recorded ? 'as recorded' : age(p.ageMinutes)}
          </span>
        </p>
      ) : (
        <p>
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>
            {p.mode === 'model'
              ? 'No monitor near here has reported lately, so this is the regional model’s estimate.'
              : 'A made-up day for the prototype.'}
          </span>
        </p>
      )}
      {p.mode === 'live' && (
        <p className="muted">
          {recorded
            ? 'Real monitor readings from the archive; the hours after this moment are what was recorded next, shown as a forecast would be.'
            : 'Real monitor readings; the forecast hours are a model.'}
        </p>
      )}
    </section>
  );
}
