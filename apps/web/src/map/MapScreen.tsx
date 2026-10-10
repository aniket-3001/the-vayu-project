import { Flame, Layers } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useState } from 'react';
import { LEVELS } from '../design/levels';
import { Pill } from '../today/ui/Chip';
import { LAYER_LABELS, defaultLayers, type Shown } from './layers';
import { MapView, type MapMode } from './MapView';
import { WindCanvas } from './WindCanvas';

const MODES: readonly { readonly id: MapMode; readonly label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'globe', label: 'Globe' },
];

const STOPS = [0, 50, 100, 150, 200, 300] as const;

/** Where the air is bad, and where it is going: a flat map of readings and fires, or a globe with the wind on it. */
export function MapScreen(): React.JSX.Element {
  const [mode, setMode] = useState<MapMode>('map');
  const [shown, setShown] = useState<Shown>(defaultLayers('map'));
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState<MapLibreMap>();

  const choose = (next: MapMode): void => {
    setMode(next);
    setShown(defaultLayers(next));
  };
  const toggle = (key: keyof Shown): void => {
    setShown((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="map-screen">
      <MapView mode={mode} layers={shown} onReady={setMap} />
      <WindCanvas map={map} enabled={shown.wind} />

      <div className="map-top">
        <div className="segmented" role="group" aria-label="View">
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => {
                choose(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="map-layers-button"
          aria-expanded={open}
          aria-controls="map-layers"
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <Layers size={18} strokeWidth={1.75} aria-hidden="true" /> Layers
        </button>
      </div>

      {open && (
        <fieldset className="map-sheet" id="map-layers">
          <legend>Show on the map</legend>
          {(Object.keys(LAYER_LABELS) as (keyof Shown)[]).map((key) => (
            // The label text is a computed name inside nested spans, which the rule cannot see.
            // eslint-disable-next-line jsx-a11y/label-has-associated-control
            <label key={key} className="map-toggle" htmlFor={`layer-${key}`}>
              <input
                id={`layer-${key}`}
                type="checkbox"
                checked={shown[key]}
                onChange={() => {
                  toggle(key);
                }}
              />
              <span>
                <strong>{LAYER_LABELS[key].name}</strong>
                <span className="muted small"> {LAYER_LABELS[key].note}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="map-legend">
        <div
          className="legend-bar"
          role="img"
          aria-label="AQI colours, from Good in green to Hazardous in rose-plum"
        >
          {LEVELS.map((level) => (
            <span key={level.name} style={{ background: level.solid }} />
          ))}
        </div>
        <div className="legend-ticks" aria-hidden="true">
          {STOPS.map((stop) => (
            <span key={stop}>{stop}</span>
          ))}
          <span>+</span>
        </div>
        <p className="legend-notes small">
          <Pill>Sample data</Pill>
          {shown.gradient && <span>Colour between monitors is an estimate.</span>}
          {shown.fires && (
            <span className="legend-fire">
              <Flame size={14} strokeWidth={2} aria-hidden="true" /> Fires, last 24 hours
            </span>
          )}
          {shown.wind && <span>Wind is a sample flow.</span>}
        </p>
      </div>
    </div>
  );
}
