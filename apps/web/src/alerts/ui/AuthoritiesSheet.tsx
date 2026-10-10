import { ExternalLink, Phone, X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Where to take a complaint about burning, or an emergency. We link to the official sites and do not print a
 * helpline we have not checked; the national emergency number is the one number we are sure of.
 */
export function AuthoritiesSheet({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
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
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="authorities-title">
        <div className="sheet-head">
          <h2 id="authorities-title">Contact the authorities</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p>
          For burning of crop stubble, waste or anything else, report it with the{' '}
          <strong>place</strong>, the <strong>time</strong> and a <strong>photo</strong> if you can
          take one safely.
        </p>
        <ul className="sheet-links">
          <li>
            <a href="https://caqm.nic.in/" target="_blank" rel="noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Commission for Air Quality Management
              (caqm.nic.in)
            </a>
          </li>
          <li>
            <a href="https://cpcb.nic.in/" target="_blank" rel="noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Central Pollution Control Board
              (cpcb.nic.in)
            </a>
          </li>
        </ul>
        <p className="muted small">
          Both run complaint channels, including apps that take a geotagged photo. We have not
          checked a helpline number, so we do not print one here.
        </p>
        <a className="primary sheet-call" href="tel:112">
          <Phone size={18} aria-hidden="true" /> Emergency: call 112
        </a>
        <p className="muted small">
          112 is India’s national emergency number. Use it for fire or danger to life.
        </p>
      </div>
    </div>
  );
}
