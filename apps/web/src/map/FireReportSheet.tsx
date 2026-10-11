import { Check, Copy, Flame, MapPin, Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addressOf } from '../data/geocode';
import type { FireReportDraft } from './fireReport';

/** The emergency number for all of India, and the fire service's own. */
export const EMERGENCY_NUMBER = '112';
export const FIRE_SERVICE_NUMBER = '101';

/** "28.6139° N, 77.2090° E": the point as it is read out to someone on the phone. */
export const coordinatesText = (lat: number, lng: number): string =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

/** A link that opens the point in a map app or the browser's map. */
export const mapsLink = (lat: number, lng: number): string =>
  `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`;

/**
 * Report a fire: the place and its coordinates to read out or copy, and the numbers to call. The app contacts no one
 * itself and says so: the person does, with the location in hand.
 */
export function FireReportSheet({
  fire,
  onClose,
  lookup = addressOf,
}: {
  readonly fire: FireReportDraft;
  readonly onClose: () => void;
  readonly lookup?: (lat: number, lng: number) => Promise<string | undefined>;
}): React.JSX.Element {
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let current = true;
    void lookup(fire.lat, fire.lng).then((found) => {
      if (current) setAddress(found);
    });
    return () => {
      current = false;
    };
  }, [fire.lat, fire.lng, lookup]);

  const coordinates = coordinatesText(fire.lat, fire.lng);
  const whole = `${address === undefined ? '' : `${address}. `}${coordinates}. ${mapsLink(fire.lat, fire.lng)}`;
  const copy = (): void => {
    void navigator.clipboard
      .writeText(whole)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => {
          setCopied(false);
        }, 2500);
      })
      .catch(() => undefined);
  };

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
      <div className="sheet fire-report" role="dialog" aria-modal="true" aria-label="Report a fire">
        <div className="sheet-head">
          <h2>
            <Flame size={20} aria-hidden="true" /> Report a fire
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <section className="fire-where" aria-label="Where the fire is">
          <p className="fire-address">
            <MapPin size={18} aria-hidden="true" />{' '}
            <span>{address ?? 'Looking up the nearest address…'}</span>
          </p>
          <p className="fire-coordinates tnum">{coordinates}</p>
          {fire.hoursAgo !== undefined && (
            <p className="muted small">
              Seen by the satellite about {String(fire.hoursAgo)} h ago
              {fire.frp === undefined
                ? '.'
                : `, burning at about ${String(Math.round(fire.frp))} MW.`}
            </p>
          )}
          <div className="fire-actions">
            <button type="button" className="plain" onClick={copy}>
              {copied ? (
                <>
                  <Check size={16} aria-hidden="true" /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} aria-hidden="true" /> Copy location
                </>
              )}
            </button>
            <a
              className="plain"
              href={mapsLink(fire.lat, fire.lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in maps
            </a>
          </div>
        </section>

        <section className="fire-contact" aria-label="Contact the authorities">
          <h3>Contact the authorities</h3>
          <a className="fire-call" href={`tel:${EMERGENCY_NUMBER}`}>
            <Phone size={18} aria-hidden="true" /> Call {EMERGENCY_NUMBER}, the emergency number
          </a>
          <a className="fire-call" href={`tel:${FIRE_SERVICE_NUMBER}`}>
            <Phone size={18} aria-hidden="true" /> Call {FIRE_SERVICE_NUMBER}, the fire service
          </a>
          <p className="muted small">
            Read out the location above. This app does not contact anyone for you and does not keep
            what you do here.
          </p>
        </section>
      </div>
    </div>
  );
}
