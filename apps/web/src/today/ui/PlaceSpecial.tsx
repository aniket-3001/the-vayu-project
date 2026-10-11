import { Footprints, School, Sun, type LucideIcon } from 'lucide-react';
import { alertsFor } from '../../alerts/model';
import { AlertsList } from '../../alerts/ui/AlertsList';
import { useFires } from '../../alerts/useFires';
import type { Pin } from '../../data/pins';
import { placeNote, type NoteKind } from '../../places/notes';
import { isSchoolPin } from '../../places/roles';
import type { TodayData } from '../types';

const ICONS: Readonly<Record<NoteKind, LucideIcon>> = {
  assembly: School,
  walk: Footprints,
  clean: Sun,
};

/**
 * Insights for this place, beside its air: the alerts that apply here (a GRAP stage, smog, burning nearby,
 * rain or wind on the way), where a school's assembly should be held, the best time for a walk in a park. Short
 * lines on the place's card point here for the detail.
 */
export function PlaceSpecial({
  data,
  pin,
}: {
  readonly data: TodayData;
  readonly pin: Pin | undefined;
}): React.JSX.Element {
  const fires = useFires(pin, data.hourly[0]?.weather?.windFromDeg);
  // The lines about assembly are for a school's page; anywhere else they would be noise.
  const alerts = alertsFor(data, fires, { school: pin !== undefined && isSchoolPin(pin) });
  const note = pin === undefined ? undefined : placeNote(data, pin);
  const Icon = note === undefined ? Sun : ICONS[note.kind];
  return (
    <section className="card special" aria-labelledby="special-title">
      <h2 id="special-title">Insights for this place</h2>
      {alerts.length > 0 ? (
        <AlertsList alerts={alerts} data={data} />
      ) : (
        <p className="muted">No alert for this place right now.</p>
      )}
      {note !== undefined && (
        <div className={`special-note ${note.kind}`}>
          <span className="special-icon">
            <Icon size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h3>{note.title}</h3>
            <p>{note.long}</p>
            {note.rules.length > 0 && (
              <ul className="special-rules">
                {note.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="muted small">Our estimate, not an order. Official orders come first.</p>
    </section>
  );
}
