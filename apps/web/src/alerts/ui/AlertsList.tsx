import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readDemo } from '../../demo/state';
import { Pill } from '../../today/ui/Chip';
import type { TodayData } from '../../today/types';
import { dayWord, type Alert } from '../model';
import { ALERT_ICONS, AlertSheet } from './AlertSheet';
import { AuthoritiesSheet } from './AuthoritiesSheet';
import { sceneFor } from './AlertScene';

/**
 * What to watch for in the next three days, worst first, as a short list down the page. Each row is plain: one colour for
 * what it is (the AQI scale's colour for a GRAP stage or smog, pastel blue for rain, pale teal for wind, orange for
 * burning), and a blinking border where it needs the eye. The moving scene is for the opened view. Pressing one
 * opens it up close, with the short reason it is there.
 */
export function AlertsList({
  alerts,
  data,
}: {
  readonly alerts: readonly Alert[];
  readonly data: TodayData;
}): React.JSX.Element | null {
  const [open, setOpen] = useState<Alert | undefined>(undefined);
  const [calling, setCalling] = useState(false);
  const staged = readDemo()?.openAlert;
  useEffect(() => {
    // A demo scenario can open an alert as soon as the list shows.
    if (staged === undefined) return;
    const found = alerts.find((alert) => alert.id === staged);
    if (found !== undefined) setOpen(found);
    // Only on first show: closing the sheet must not open it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (alerts.length === 0) return null;
  return (
    <>
      <ul className="alert-list" aria-label="Alerts">
        {alerts.map((alert) => {
          const Icon = ALERT_ICONS[alert.kind];
          const theme = sceneFor(alert);
          return (
            <li key={alert.id}>
              <button
                type="button"
                className={`alert-row ${theme.className} ${alert.severity}${alert.severity === 'severe' || alert.kind === 'stubble' ? ' blink' : ''}${alert.day === 0 ? ' now' : ''}`}
                style={theme.style}
                aria-haspopup="dialog"
                onClick={() => {
                  setOpen(alert);
                }}
              >
                <span className={`alert-icon alert-${alert.kind}`}>
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="alert-words">
                  <strong>{alert.title}</strong>
                  <span className="small">
                    {alert.place !== undefined && <b className="alert-place">{alert.place} · </b>}
                    {alert.body}
                  </span>
                </span>
                <Pill>{dayWord(alert.day, data)}</Pill>
                <ChevronRight size={18} aria-hidden="true" className="alert-go" />
              </button>
            </li>
          );
        })}
      </ul>
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
