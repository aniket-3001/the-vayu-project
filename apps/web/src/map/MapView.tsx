import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import { LEVELS } from '../design/levels';
import { cigarettesPerDay, describeCigarettes } from '../units/smoke';
import { FIELD_BOUNDS, renderField } from './field';
import { firesGeoJson, sampleFires } from './fires';
import { monitorsGeoJson, sampleMonitors } from './monitors';

export type MapMode = 'map' | 'globe';

export interface MapLayers {
  readonly monitors: boolean;
  readonly gradient: boolean;
  readonly fires: boolean;
}

// The worker is its own file, which the build has to bundle and serve; say where it ends up.
setWorkerUrl(workerUrl);

/** A light, free, keyless vector style. If it cannot be reached, the map falls back to plain ground. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const PLAIN: StyleSpecification = {
  version: 8,
  sources: {},
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#eef2f7' } }],
};

const VIEWS = {
  map: { center: [79, 23] as [number, number] },
  globe: { center: [80, 22] as [number, number] },
};

/** A zoom at which the whole globe fills about 85% of the smaller side of the box. */
const globeZoom = (box: { width: number; height: number }): number =>
  Math.log2((0.85 * Math.min(box.width, box.height) * Math.PI) / 512);

const zoomFor = (mode: MapMode, box: { width: number; height: number }): number =>
  mode === 'globe' ? globeZoom(box) : 3.9;

/** The AQI colour for a number, as a map expression over the level starts. */
const aqiColour = (value: unknown): unknown => [
  'step',
  value,
  LEVELS[0]?.solid,
  ...LEVELS.slice(1).flatMap((level) => [level.from, level.solid]),
];

function fieldImage(): string {
  const cols = 136;
  const rows = 144;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return '';
  const data = ctx.createImageData(cols, rows);
  data.data.set(renderField(sampleMonitors(), cols, rows));
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

/** The map itself: monitors, the colour field between them, fires, and a switch between flat and globe. */
export function MapView({
  mode,
  layers,
  smoke,
  onReady,
}: {
  readonly mode: MapMode;
  readonly layers: MapLayers;
  /** Whether popups also say cigarettes a day. */
  readonly smoke: boolean;
  readonly onReady: (map: MapLibreMap) => void;
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>();
  const ready = useRef(false);
  const latest = useRef({ mode, layers, smoke });
  latest.current = { mode, layers, smoke };
  const monitors = useMemo(() => sampleMonitors(), []);
  const fires = useMemo(() => sampleFires(), []);

  useEffect(() => {
    const el = container.current;
    if (el === null) return;
    const m = new MapLibreMap({
      container: el,
      style: STYLE_URL,
      center: VIEWS[latest.current.mode].center,
      zoom: zoomFor(latest.current.mode, el.getBoundingClientRect()),
      minZoom: 0.4,
      maxZoom: 11,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    map.current = m;
    if (import.meta.env.DEV) Object.assign(window, { __vayuMap: m });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const addLayers = (): void => {
      ready.current = true;
      if (m.getSource('field') !== undefined) return;
      const { layers: on, mode: current } = latest.current;
      m.setProjection({ type: current === 'globe' ? 'globe' : 'mercator' });
      m.addSource('field', {
        type: 'image',
        url: fieldImage(),
        coordinates: [
          [FIELD_BOUNDS.west, FIELD_BOUNDS.north],
          [FIELD_BOUNDS.east, FIELD_BOUNDS.north],
          [FIELD_BOUNDS.east, FIELD_BOUNDS.south],
          [FIELD_BOUNDS.west, FIELD_BOUNDS.south],
        ],
      });
      m.addLayer({
        id: 'field',
        type: 'raster',
        source: 'field',
        paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        layout: { visibility: on.gradient ? 'visible' : 'none' },
      });
      m.addSource('fires', { type: 'geojson', data: firesGeoJson(fires) });
      m.addLayer({
        id: 'fires',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-color': '#e8743b',
          'circle-opacity': 0.8,
          'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 4, 2.5, 50, 6],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
        layout: { visibility: on.fires ? 'visible' : 'none' },
      });
      m.addSource('monitors', {
        type: 'geojson',
        data: monitorsGeoJson(monitors),
        cluster: true,
        clusterRadius: 38,
        clusterMaxZoom: 6,
        clusterProperties: { total: ['+', ['get', 'aqi']] },
      });
      const label = [
        'to-string',
        [
          'round',
          [
            'case',
            ['has', 'point_count'],
            ['/', ['get', 'total'], ['get', 'point_count']],
            ['get', 'aqi'],
          ],
        ],
      ];
      const value = [
        'case',
        ['has', 'point_count'],
        ['/', ['get', 'total'], ['get', 'point_count']],
        ['get', 'aqi'],
      ];
      m.addLayer({
        id: 'monitors-dot',
        type: 'circle',
        source: 'monitors',
        paint: {
          'circle-color': aqiColour(value) as never,
          'circle-radius': ['case', ['has', 'point_count'], 17, 13],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
        layout: { visibility: on.monitors ? 'visible' : 'none' },
      });
      m.addLayer({
        id: 'monitors-label',
        type: 'symbol',
        source: 'monitors',
        layout: {
          'text-field': label as never,
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
          'text-allow-overlap': true,
          visibility: on.monitors ? 'visible' : 'none',
        },
        paint: { 'text-color': '#334155' },
      });
    };

    m.on('style.load', addLayers);
    let plain = false;
    m.on('error', () => {
      // No network for the style: carry on over plain ground, so the data still shows.
      if (plain || m.isStyleLoaded()) return;
      plain = true;
      m.setStyle(PLAIN);
    });

    m.on('click', 'monitors-dot', (event) => {
      const feature = event.features?.[0];
      if (feature === undefined) return;
      const p = feature.properties as {
        name?: string;
        aqi?: number;
        pm25?: number;
        age?: number;
        point_count?: number;
      };
      if (p.point_count !== undefined) {
        void m.easeTo({ center: event.lngLat, zoom: m.getZoom() + 2 });
        return;
      }
      const box = document.createElement('div');
      box.className = 'map-popup';
      const title = document.createElement('strong');
      title.textContent = p.name ?? 'Monitor';
      const body = document.createElement('p');
      body.textContent = `AQI ${String(p.aqi)} · PM2.5 ${String(p.pm25)} µg/m³ · ${String(p.age)} min ago`;
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Sample data';
      box.append(title, body);
      if (latest.current.smoke && p.pm25 !== undefined) {
        const smokes = document.createElement('p');
        smokes.textContent = describeCigarettes(cigarettesPerDay(p.pm25));
        box.append(smokes);
      }
      box.append(note);
      new Popup({ closeButton: false, offset: 14 })
        .setLngLat(event.lngLat)
        .setDOMContent(box)
        .addTo(m);
    });
    m.on('mouseenter', 'monitors-dot', () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'monitors-dot', () => {
      m.getCanvas().style.cursor = '';
    });

    onReady(m);
    return () => {
      m.remove();
      map.current = undefined;
    };
    // The map is built once; later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    const apply = (): void => {
      m.setProjection({ type: mode === 'globe' ? 'globe' : 'mercator' });
      void m.easeTo({
        ...VIEWS[mode],
        zoom: zoomFor(mode, m.getContainer().getBoundingClientRect()),
        duration: 1400,
      });
    };
    apply();
  }, [mode]);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    const show = (ids: readonly string[], on: boolean): void => {
      for (const id of ids)
        if (m.getLayer(id) !== undefined)
          m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    };
    const apply = (): void => {
      show(['monitors-dot', 'monitors-label'], layers.monitors);
      show(['field'], layers.gradient);
      show(['fires'], layers.fires);
    };
    apply();
  }, [layers]);

  return <div ref={container} className="map-view" />;
}
