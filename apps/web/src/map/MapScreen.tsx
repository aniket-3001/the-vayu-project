import { Flame, Layers, LocateFixed, Wind } from 'lucide-react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { useMemo, useRef, useState } from 'react';
import { airStore, useStations } from '../air/store';
import { nowIso } from '../clock';
import { inCoverage } from '../data/geocode';
import { LEVELS } from '../design/levels';
import { Pill } from '../today/ui/Chip';
import { useAirUnits } from '../units/AirUnits';
import { LAYER_LABELS, defaultLayers, type Shown } from './layers';
import { monitorsFromStations } from './monitors';
import { MapView } from './MapView';
import { WindStars } from './WindStars';
import { makeWindField } from './windTexture';
import { useMapData } from './useMapData';

const STOPS = [0, 50, 100, 150, 200, 300] as const;

/** Where the air is bad, and where it is going: a flat map of readings and fires, or a globe with the wind on it. */
export function MapScreen(): React.JSX.Element {
  const [shown, setShown] = useState<Shown>(defaultLayers());
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState<MapLibreMap>();
  const { smoke } = useAirUnits();
  const data = useMapData();
  const stations = useStations();
  const sample = airStore().kind === 'sample';
  const monitors = useMemo(
    () =>
      stations.status === 'ready' ? monitorsFromStations(stations.data, Date.parse(nowIso())) : [],
    [stations],
  );
  const [where, setWhere] = useState('');
  const marker = useRef<Marker>();
  const windField = useMemo(() => makeWindField(data.wind), [data.wind]);

  /** Asks where the person is, drops a blue dot there and flies in close. */
  const findMe = (): void => {
    if (map === undefined) return;
    if (!('geolocation' in navigator)) {
      setWhere('This browser cannot share a location.');
      return;
    }
    setWhere('Finding where you are…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        marker.current?.remove();
        const dot = document.createElement('div');
        dot.className = 'you-dot';
        marker.current = new Marker({ element: dot }).setLngLat([longitude, latitude]).addTo(map);
        void map.flyTo({ center: [longitude, latitude], zoom: 9.5, duration: 1800 });
        setWhere(
          inCoverage(latitude, longitude)
            ? 'You are here.'
            : 'You are here. It is outside north India, so the monitors and fires shown are far away.',
        );
      },
      () => {
        setWhere('We could not get your location. You can still pan the map.');
      },
      { timeout: 10_000 },
    );
  };
  const toggle = (key: keyof Shown): void => {
    setShown((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="map-screen">
      <MapView
        layers={shown}
        smoke={smoke}
        air={data.air}
        monitors={monitors}
        fires={data.fireList}
        sample={sample}
        onReady={setMap}
      />
      <WindStars map={map} enabled={shown.wind} field={windField} />

      <div className="map-bottom">
        {open && (
          <fieldset className="map-sheet" id="map-layers">
            <legend>Show on the map</legend>
            {(Object.keys(LAYER_LABELS) as (keyof Shown)[])
              .filter((key) => key !== 'wind')
              .map((key) => (
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

        <div className="map-controls">
          <button
            type="button"
            className="map-layers-button wind-switch"
            aria-pressed={shown.wind}
            aria-label={shown.wind ? 'Wind on. Turn wind off' : 'Wind off. Turn wind on'}
            onClick={() => {
              toggle('wind');
            }}
          >
            <Wind size={18} strokeWidth={1.75} aria-hidden="true" />{' '}
            <span className="btn-label">Wind {shown.wind ? 'on' : 'off'}</span>
          </button>
          <button type="button" className="map-layers-button" aria-label="Find me" onClick={findMe}>
            <LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" />{' '}
            <span className="btn-label">Find me</span>
          </button>
          <button
            type="button"
            className="map-layers-button"
            aria-label="Layers"
            aria-expanded={open}
            aria-controls="map-layers"
            onClick={() => {
              setOpen((v) => !v);
            }}
          >
            <Layers size={18} strokeWidth={1.75} aria-hidden="true" />{' '}
            <span className="btn-label">Layers</span>
          </button>
        </div>

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
          <p className="small" role="status">
            {where}
          </p>
          <p className="legend-pills">
            {sample && (shown.monitors || data.fires === undefined) && <Pill>Sample data</Pill>}
            {((!sample && shown.monitors && monitors.length > 0) ||
              (shown.gradient && data.airLive) ||
              (shown.wind && data.windLive) ||
              data.fires !== undefined) && <Pill>Live</Pill>}
          </p>
          <details className="legend-about">
            <summary>About this data</summary>
            <p className="legend-notes small">
              {shown.monitors && !sample && (
                <span>
                  {stations.status === 'loading'
                    ? 'Getting the monitors…'
                    : monitors.length === 0
                      ? 'No monitor has reported in the last six hours, so none are shown.'
                      : `${String(monitors.length)} monitors in north India with a reading in the last six hours (OpenAQ).`}
                </span>
              )}
              {shown.gradient && (
                <span>
                  {data.airLive
                    ? 'Air colour: the CAMS model via Open-Meteo, right now. An estimate, not a measurement.'
                    : 'Colour between monitors is an estimate.'}
                </span>
              )}
              {shown.fires && (
                <span className="legend-fire">
                  <Flame size={14} strokeWidth={2} aria-hidden="true" />{' '}
                  {data.fires === undefined
                    ? 'Fires, last 24 hours'
                    : `${String(data.fires)} fires in the last 24 hours (NASA satellite).${sample ? ' Positions are a sample.' : ''}`}
                </span>
              )}
              {shown.wind && (
                <span>
                  {data.windLive
                    ? 'Wind: ICON and GFS models via Open-Meteo, right now.'
                    : sample
                      ? 'Wind is a sample flow.'
                      : 'The wind could not be loaded just now, so none is shown.'}
                </span>
              )}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
