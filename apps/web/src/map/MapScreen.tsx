import { Flame } from 'lucide-react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { airStore, useStations } from '../air/store';
import { nowIso } from '../clock';
import { inCoverage } from '../data/geocode';
import { AqiScale } from '../components/AqiScale';
import { useLiveLocation } from '../places/liveLocation';
import { Pill } from '../today/ui/Chip';
import { useAirUnits } from '../units/AirUnits';
import { DetectLocation } from '../nav/DetectLocation';
import { defaultLayers } from './layers';
import { FireReportSheet } from './FireReportSheet';
import type { Fire } from './fires';
import { binMonitors, monitorsFromStations } from './monitors';
import { MapView } from './MapView';
import { WindStars } from './WindStars';
import { makeWindField } from './windTexture';
import { useMapData } from './useMapData';

/** Where the air is bad, and where it is going: a flat map of readings and fires, or a globe with the wind on it. */
export function MapScreen(): React.JSX.Element {
  // Everything is always on: the monitors, the air colour, the fires and the wind.
  const shown = useMemo(defaultLayers, []);
  const [reporting, setReporting] = useState<Fire | undefined>(undefined);
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
  // The colour between monitors is worked out from the real monitors; the prototype has a made-up grid instead.
  const air = useMemo(
    () => (sample ? data.air : binMonitors(monitors, 1)),
    [sample, data.air, monitors],
  );
  // A link can open the map somewhere: #/map?lat=28.6&lng=77.2&z=12.
  const [params] = useSearchParams();
  const start = useMemo(() => {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    const zoom = Number(params.get('z'));
    return params.has('lat') &&
      params.has('lng') &&
      Math.abs(lat) <= 85 &&
      Math.abs(lng) <= 180 &&
      Number.isFinite(zoom)
      ? { center: [lng, lat] as [number, number], zoom: Math.min(18, Math.max(1, zoom)) }
      : undefined;
    // Only the opening position is read; moving the map does not change the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const marker = useRef<Marker>();
  const windField = useMemo(() => makeWindField(data.wind), [data.wind]);
  const bottom = useRef<HTMLDivElement>(null);

  // The live location switch is on every screen. Here, on, it puts a blue dot where the device is and flies there.
  const live = useLiveLocation();
  const liveLat = live.enabled ? live.position?.lat : undefined;
  const liveLng = live.enabled ? live.position?.lng : undefined;
  const flown = useRef(false);
  useEffect(() => {
    if (map === undefined) return;
    if (liveLat === undefined || liveLng === undefined) {
      marker.current?.remove();
      marker.current = undefined;
      flown.current = false;
      return;
    }
    if (marker.current === undefined) {
      const dot = document.createElement('div');
      dot.className = 'you-dot';
      marker.current = new Marker({ element: dot });
    }
    marker.current.setLngLat([liveLng, liveLat]).addTo(map);
    // Fly in once, when the position first arrives, unless a link opened the map somewhere on purpose.
    if (!flown.current && start === undefined)
      void map.flyTo({ center: [liveLng, liveLat], zoom: 9.5, duration: 1800 });
    flown.current = true;
  }, [map, liveLat, liveLng, start]);
  useEffect(
    () => () => {
      marker.current?.remove();
    },
    [],
  );
  const where =
    liveLat !== undefined && liveLng !== undefined && !inCoverage(liveLat, liveLng)
      ? 'You are outside north India, so the monitors and fires shown are far away.'
      : '';

  // The buttons that stay on every screen sit just above this panel, so tell the page how tall it is.
  useEffect(() => {
    const panel = bottom.current;
    const root = document.documentElement;
    if (panel === null || typeof ResizeObserver === 'undefined') return;
    const report = (): void => {
      root.style.setProperty('--dock-lift', `${String(Math.round(panel.offsetHeight) + 6)}px`);
    };
    report();
    const watcher = new ResizeObserver(report);
    watcher.observe(panel);
    return () => {
      watcher.disconnect();
      root.style.removeProperty('--dock-lift');
    };
  }, []);

  return (
    <div className="map-screen">
      <MapView
        layers={shown}
        smoke={smoke}
        air={air}
        monitors={monitors}
        fires={data.fireList}
        sample={sample}
        start={start}
        onReady={setMap}
        onReportFire={setReporting}
      />
      <WindStars map={map} enabled={shown.wind} field={windField} />

      <div className="map-bottom" ref={bottom}>
        <div className="map-legend">
          <div className="legend-head">
            <p className="legend-pills">
              {sample && data.fires === undefined && <Pill>Sample data</Pill>}
              {((!sample && monitors.length > 0) || data.windLive || data.fires !== undefined) && (
                <Pill>Live</Pill>
              )}
            </p>
            <DetectLocation />
          </div>
          <p className="small" role="status">
            {where}
          </p>
          <div className="legend-body">
            <AqiScale />
            <details className="legend-about">
              <summary>About this data</summary>
              <p className="legend-notes small">
                {shown.monitors && !sample && (
                  <span>
                    {stations.status === 'loading'
                      ? 'Getting the monitors…'
                      : monitors.length === 0
                        ? 'No monitor has reported in the last six hours, so none are shown.'
                        : `${String(monitors.length)} monitors worldwide with a PM2.5 reading in the last six hours (OpenAQ). Each is a dot; zoom in for its number.`}
                  </span>
                )}
                {shown.gradient && (
                  <span>
                    Colour between monitors is an estimate from the nearest ones. It fades out about
                    450 km from any monitor, where we know nothing.
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
                      ? 'Wind: ICON and GFS models via Open-Meteo, right now: close detail over south Asia, coarser elsewhere.'
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
      {reporting !== undefined && (
        <FireReportSheet
          fire={{
            lat: reporting.lat,
            lng: reporting.lng,
            hoursAgo: reporting.hoursAgo,
            frp: reporting.frp,
          }}
          onClose={() => {
            setReporting(undefined);
          }}
        />
      )}
    </div>
  );
}
