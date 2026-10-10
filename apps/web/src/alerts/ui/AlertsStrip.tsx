import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '../../today/ui/Chip';
import type { TodayData } from '../../today/types';
import { dayWord, type Alert } from '../model';
import { ALERT_ICONS, AlertSheet } from './AlertSheet';
import { AuthoritiesSheet } from './AuthoritiesSheet';

/**
 * What to watch for in the next three days: small cards in a row, a soft glow round today's. No folding and
 * unfolding; pressing a card opens it up close, with the short reason it is there.
 */
export function AlertsStrip({
  alerts,
  data,
}: {
  readonly alerts: readonly Alert[];
  readonly data: TodayData;
}): React.JSX.Element | null {
  const [open, setOpen] = useState<Alert | undefined>(undefined);
  const [calling, setCalling] = useState(false);
  if (alerts.length === 0) return null;
  return (
    <>
      <section className="carousel-section alerts" aria-labelledby="alerts-title">
        <div>
          <h2 id="alerts-title">Alerts</h2>
          <span className="muted small">
            {alerts.length} for the next three days. Tap one for why.
          </span>
        </div>
        <ul className="carousel">
          {alerts.map((alert) => {
            const Icon = ALERT_ICONS[alert.kind];
            return (
              <li key={alert.id}>
                <button
                  type="button"
                  className={`alert-card${alert.day === 0 ? ' now' : ''}`}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setOpen(alert);
                  }}
                >
                  <span className="alert-icon">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="alert-words">
                    <span className="alert-day">
                      <Pill>{dayWord(alert.day, data)}</Pill>
                    </span>
                    <strong>{alert.title}</strong>
                    <span className="small">{alert.body}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" className="alert-go" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {open !== undefined && !calling && (
        <AlertSheet
          alert={open}
          data={data}
          onClose={() => {
            setOpen(undefined);
          }}
          onAuthorities={() => {
            setCalling(true);
          }}
        />
      )}
      {calling && (
        <AuthoritiesSheet
          onClose={() => {
            setCalling(false);
            setOpen(undefined);
          }}
        />
      )}
    </>
  );
}
