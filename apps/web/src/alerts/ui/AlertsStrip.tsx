import { Flame, Footprints, Phone, TriangleAlert, Wind, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '../../today/ui/Chip';
import type { TodayData } from '../../today/types';
import { dayWord, type Alert, type AlertKind } from '../model';
import { AuthoritiesSheet } from './AuthoritiesSheet';
import { Carousel } from './Carousel';

const ICONS: Readonly<Record<AlertKind, LucideIcon>> = {
  grap: TriangleAlert,
  smog: Wind,
  walk: Footprints,
  stubble: Flame,
};

/** What to watch for in the next three days. A soft glow around each card keeps them in sight. */
export function AlertsStrip({
  alerts,
  data,
}: {
  readonly alerts: readonly Alert[];
  readonly data: TodayData;
}): React.JSX.Element | null {
  const [calling, setCalling] = useState(false);
  if (alerts.length === 0) return null;
  return (
    <>
      <Carousel
        title="Alerts"
        hint={`${String(alerts.length)} for the next three days`}
        className="alerts"
      >
        {alerts.map((alert) => {
          const Icon = ICONS[alert.kind];
          return (
            <li key={alert.id} className={`alert-card${alert.day === 0 ? ' now' : ''}`}>
              <span className="alert-icon">
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="alert-words">
                <span className="alert-day">
                  <Pill>{dayWord(alert.day, data)}</Pill>
                </span>
                <strong>{alert.title}</strong>
                <span className="small">{alert.body}</span>
                {alert.authorities && (
                  <button
                    type="button"
                    className="alert-call"
                    onClick={() => {
                      setCalling(true);
                    }}
                  >
                    <Phone size={14} aria-hidden="true" /> Contact authorities
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </Carousel>
      {calling && (
        <AuthoritiesSheet
          onClose={() => {
            setCalling(false);
          }}
        />
      )}
    </>
  );
}
