import { Flame, Phone, TriangleAlert, Wind, X, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Pill } from '../../today/ui/Chip';
import type { TodayData } from '../../today/types';
import { dayWord, type Alert, type AlertKind } from '../model';

export const ALERT_ICONS: Readonly<Record<AlertKind, LucideIcon>> = {
  grap: TriangleAlert,
  smog: Wind,
  stubble: Flame,
};

/**
 * One alert, up close, the way AirPods announce themselves: a big icon, what it is, and a short clear reason
 * why it is here. Below it, what to do, and for burning, a way to reach the authorities.
 */
export function AlertSheet({
  alert,
  data,
  onClose,
  onAuthorities,
}: {
  readonly alert: Alert;
  readonly data: TodayData;
  readonly onClose: () => void;
  readonly onAuthorities: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const Icon = ALERT_ICONS[alert.kind];
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        className="sheet alert-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-title"
      >
        <button type="button" className="icon-button sheet-x" aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="alert-hero">
          <span className={`alert-big-icon alert-${alert.kind}`}>
            <Icon size={40} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <Pill>{dayWord(alert.day, data)}</Pill>
          <h2 id="alert-title">{alert.title}</h2>
        </div>
        <section aria-label="Why">
          <h3>Why</h3>
          <p>{alert.reason}</p>
        </section>
        {alert.avoid.length > 0 && (
          <section aria-label="What to avoid">
            <h3>What to avoid</h3>
            <ul className="todo avoid">
              {alert.avoid.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </section>
        )}
        <section aria-label="What to do">
          <h3>What to do</h3>
          <ul className="todo">
            {alert.todo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
        <p className="muted small">Our estimate, not an order. Official orders come first.</p>
        {alert.authorities && (
          <button type="button" className="primary" onClick={onAuthorities}>
            <Phone size={16} aria-hidden="true" /> Contact authorities
          </button>
        )}
        <button type="button" className="plain" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
