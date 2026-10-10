import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { LEVELS } from '../design/levels';
import type { Monitor } from './monitors';
import { cigarettesPerDay, describeCigarettes } from '../units/smoke';
import { FIELD_TILES, grainyField, type Window } from './field';
import { firesGeoJson, type Fire } from './fires';
import { monitorsGeoJson } from './monitors';

/** The part of MapLibre's image source that swaps the picture. */
interface ImageUpdater {
  updateImage: (options: { url: string }) => void;
}

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

/** Where the map opens: south Asia at country level. Zoom out and it turns into a globe by itself. */
const START = { center: [79, 23] as [number, number], zoom: 3.9 };

/** The AQI colour for a number, as a map expression over the level starts. */
const aqiColour = (value: unknown): unknown => [
  'step',
  value,
  LEVELS[0]?.solid,
  ...LEVELS.slice(1).flatMap((level) => [level.from, level.solid]),
];

/**
 * One fully transparent pixel, for when there is no air colour to draw: nothing is better than a made-up wash. It is
 * drawn rather than written out, so it can be nothing but empty.
 */
function clearPixel(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL();
}

function fieldImage(air: readonly Monitor[], tile: Window): string {
  if (air.length === 0) return clearPixel();
  const { pixels, width, height } = grainyField(air, 48, 100, 4, tile);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return '';
  const data = ctx.createImageData(width, height);
  data.data.set(pixels);
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

/** A flame, drawn once from an SVG, for the fires on the map. Undefined where images cannot be made. */
let flame: Promise<ImageData | undefined> | undefined;
function loadFlame(): Promise<ImageData | undefined> {
  flame ??= new Promise((resolve) => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24">' +
      '<path d="M12 2c1 3.5 5 5.5 5 10.2A5 5 0 0 1 12 17a5 5 0 0 1-5-4.8c0-1.6.7-2.8 1.6-3.8.4 1.2 1.1 2 2 2.4C10.2 8 10.6 4.6 12 2z" ' +
      'fill="#e8743b" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M12 22a4 4 0 0 0 4-4c0-1.6-1.4-2.6-2.4-4-.4 1-.9 1.5-1.6 1.8-.2-1.3-.9-2.2-1.6-3C9.4 14 8 15.4 8 18a4 4 0 0 0 4 4z" ' +
      'fill="#f7b32b" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/></svg>';
    const image = new Image(64, 64);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve(undefined);
        return;
      }
      ctx.drawImage(image, 0, 0, 64, 64);
      resolve(ctx.getImageData(0, 0, 64, 64));
    };
    image.onerror = () => {
      resolve(undefined);
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  return flame;
}

const FIELD_IDS = FIELD_TILES.map((_, i) => `field-${String(i)}`);

/**
 * The monitor dots, by zoom. Every monitor is drawn at every zoom: a small dot far out (so the whole world is
 * covered at a glance), growing as you come in. Numbers are added from city level (zoom 6), and where numbers would
 * collide the worse air keeps its place and the rest wait for more room, which more zoom gives.
 */
const DOT_RADIUS = ['interpolate', ['linear'], ['zoom'], 0, 2.2, 3, 3.2, 6, 7, 9, 11, 14, 14];
const LABEL_FROM_ZOOM = 6;

/** The map itself: monitors, the colour field between them, fires, and a switch between flat and globe. */
export function MapView({
  layers,
  smoke,
  air,
  monitors,
  fires,
  sample,
  start,
  onReady,
}: {
  readonly layers: MapLayers;
  /** Whether popups also say cigarettes a day. */
  readonly smoke: boolean;
  /** The grid of air quality that colours the map between monitors. */
  readonly air: readonly Monitor[];
  /** The monitors with a recent reading. */
  readonly monitors: readonly Monitor[];
  readonly fires: readonly Fire[];
  /** Whether the readings are made up (the prototype), for the popup's small print. */
  readonly sample: boolean;
  /** Where to open, from a link; otherwise south Asia at country level. */
  readonly start?: { readonly center: [number, number]; readonly zoom: number } | undefined;
  readonly onReady: (map: MapLibreMap) => void;
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>();
  const ready = useRef(false);
  const latest = useRef({ layers, smoke, air, monitors, fires, sample, start });
  latest.current = { layers, smoke, air, monitors, fires, sample, start };

  useEffect(() => {
    const el = container.current;
    if (el === null) return;
    const m = new MapLibreMap({
      container: el,
      style: STYLE_URL,
      center: latest.current.start?.center ?? START.center,
      zoom: latest.current.start?.zoom ?? START.zoom,
      minZoom: 0.4,
      // Down to a street: the base map has detail that far. Readings are the nearest monitor's, and say how far.
      maxZoom: 18,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    map.current = m;
    if (import.meta.env.DEV) Object.assign(window, { __vayuMap: m });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const addLayers = (): void => {
      ready.current = true;
      if (m.getSource('field-0') !== undefined) return;
      const { layers: on } = latest.current;
      // A globe at country level looks flat, and MapLibre flattens it again as you zoom right in.
      m.setProjection({ type: 'globe' });
      FIELD_TILES.forEach((tile, i) => {
        const id = FIELD_IDS[i] ?? `field-${String(i)}`;
        m.addSource(id, {
          type: 'image',
          url: fieldImage(latest.current.air, tile),
          coordinates: [
            [tile.west, tile.north],
            [tile.east, tile.north],
            [tile.east, tile.south],
            [tile.west, tile.south],
          ],
        });
        m.addLayer({
          id,
          type: 'raster',
          source: id,
          paint: {
            // Strong across a continent, fading as you come in, so the streets and the monitors show.
            'raster-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.8,
              7,
              0.7,
              11,
              0.3,
              14,
              0.12,
            ] as never,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          },
          layout: { visibility: on.gradient ? 'visible' : 'none' },
        });
      });
      m.addSource('monitors', {
        type: 'geojson',
        data: monitorsGeoJson(latest.current.monitors),
      });
      m.addLayer({
        id: 'monitors-dot',
        type: 'circle',
        source: 'monitors',
        paint: {
          'circle-color': aqiColour(['get', 'aqi']) as never,
          'circle-radius': DOT_RADIUS as never,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            0.5,
            6,
            1.5,
            10,
            2,
          ] as never,
          'circle-opacity': 0.95,
        },
        layout: {
          visibility: on.monitors ? 'visible' : 'none',
          // The worst air is drawn on top, so a dot of bad air is never hidden under a clean one.
          'circle-sort-key': ['get', 'aqi'] as never,
        },
      });
      m.addLayer({
        id: 'monitors-label',
        type: 'symbol',
        source: 'monitors',
        minzoom: LABEL_FROM_ZOOM,
        layout: {
          'text-field': ['to-string', ['get', 'aqi']] as never,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 12, 13] as never,
          // Where two numbers would touch, the worse air keeps its number; the other waits for more zoom.
          'text-allow-overlap': false,
          'text-padding': 2,
          'symbol-sort-key': ['*', -1, ['get', 'aqi']] as never,
          visibility: on.monitors ? 'visible' : 'none',
        },
        paint: { 'text-color': '#334155' },
      });
      // Fires are drawn last, on top of the monitors, as flames: a dot first so something shows at once, and the
      // flame over it once its picture has loaded.
      m.addSource('fires', { type: 'geojson', data: firesGeoJson(latest.current.fires) });
      m.addLayer({
        id: 'fires-dot',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-color': '#e8743b',
          'circle-opacity': 0.9,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 6, 6, 10, 8],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
        layout: { visibility: on.fires ? 'visible' : 'none' },
      });
      void loadFlame().then((image) => {
        if (image === undefined || m.getSource('fires') === undefined) return;
        if (!m.hasImage('flame')) m.addImage('flame', image, { pixelRatio: 2 });
        if (m.getLayer('fires') !== undefined) return;
        m.addLayer({
          id: 'fires',
          type: 'symbol',
          source: 'fires',
          layout: {
            'icon-image': 'flame',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 6, 0.9, 10, 1.1] as never,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            visibility: latest.current.layers.fires ? 'visible' : 'none',
          },
        });
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
      };
      const box = document.createElement('div');
      box.className = 'map-popup';
      const title = document.createElement('strong');
      title.textContent = p.name !== undefined && p.name !== '' ? p.name : 'Air monitor';
      const body = document.createElement('p');
      body.textContent = `AQI ${String(p.aqi)} · PM2.5 ${String(p.pm25)} µg/m³ · ${String(p.age)} min ago`;
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = latest.current.sample
        ? 'Sample data'
        : 'A monitor with a recent reading, from OpenAQ';
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
    const show = (ids: readonly string[], on: boolean): void => {
      for (const id of ids)
        if (m.getLayer(id) !== undefined)
          m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    };
    const apply = (): void => {
      show(['monitors-dot', 'monitors-label'], layers.monitors);
      show(FIELD_IDS, layers.gradient);
      show(['fires-dot', 'fires'], layers.fires);
    };
    apply();
  }, [layers]);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    FIELD_TILES.forEach((tile, i) => {
      const source = m.getSource(FIELD_IDS[i] ?? '');
      if (source !== undefined && 'updateImage' in source)
        (source as unknown as ImageUpdater).updateImage({ url: fieldImage(air, tile) });
    });
  }, [air]);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    void m.getSource<GeoJSONSource>('monitors')?.setData(monitorsGeoJson(monitors));
  }, [monitors]);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    void m.getSource<GeoJSONSource>('fires')?.setData(firesGeoJson(fires));
  }, [fires]);

  return <div ref={container} className="map-view" />;
}
