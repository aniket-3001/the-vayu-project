import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleImageInterface,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { LEVELS } from '../design/levels';
import type { Monitor } from './monitors';
import { cigarettesPerDay, describeCigarettes } from '../units/smoke';
import { buildDust, paintDust, type Dust } from './dust';
import { FIELD_TILES, mercatorY, visibleWindow, type Window } from './field';
import { firesGeoJson, type Fire } from './fires';
import { monitorsGeoJson } from './monitors';

/** The parts of MapLibre's canvas source that place the picture and take a fresh frame of it. */
interface CanvasPlacer {
  setCoordinates: (
    coordinates: [[number, number], [number, number], [number, number], [number, number]],
  ) => void;
  play: () => void;
  pause: () => void;
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

/** The longest side of the dust picture, in pixels. */
const MAX_SIDE = 1400;

/**
 * How big the picture of a window of the world should be: about a pixel for each screen pixel, so the dust is as fine
 * in a street view as across a continent, and as tall as the ground is (a tall strip of the globe is much taller than
 * wide in mercator). When it would be too big both sides shrink together, so a pixel is always square.
 */
function dustSize(window: Window, pxPerDeg: number): { width: number; height: number } {
  const widthDeg = window.east - window.west;
  const yShare = mercatorY(window.south) - mercatorY(window.north);
  let width = Math.max(24, widthDeg * pxPerDeg);
  let height = (width * yShare) / (widthDeg / 360);
  const biggest = Math.max(width, height);
  if (biggest > MAX_SIDE) {
    width *= MAX_SIDE / biggest;
    height *= MAX_SIDE / biggest;
  }
  return { width: Math.max(24, Math.round(width)), height: Math.max(24, Math.round(height)) };
}

/** A tile of the dust: a picture that is redrawn a few times a second, laid on the map where its window is. */
interface DustTile {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D | null;
  image: ImageData | undefined;
  dust: Dust | undefined;
}

/**
 * A cigarette with a glowing ember and smoke that rises, drawn fresh each frame, for the map's labels while the
 * cigarette switch is on. It repaints the map only while it is wanted, so it costs nothing the rest of the time.
 */
function cigaretteImage(wanted: () => boolean): StyleImageInterface & { data: Uint8ClampedArray } {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  let map: MapLibreMap | undefined;
  const image = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
    onAdd(m: MapLibreMap): void {
      map = m;
    },
    render(): boolean {
      const ctx = canvas.getContext('2d');
      if (ctx === null || !wanted()) return false;
      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, size, size);
      // The smoke: three puffs, each rising and fading on its own beat.
      for (let i = 0; i < 3; i++) {
        const phase = (t / 2.4 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.75;
        ctx.fillStyle = '#9a8f86';
        ctx.beginPath();
        ctx.arc(
          36 + phase * 6 + Math.sin(t * 2 + i) * 1.5,
          18 - phase * 16,
          2.2 + phase * 4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(24, 30);
      ctx.rotate(-0.61);
      const body = (x: number, w: number, fill: string, stroke: string): void => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(x, -4, w, 8, 2);
        ctx.fill();
        ctx.stroke();
      };
      body(-22, 12, '#e0953f', '#b8702a');
      body(-10, 22, '#ffffff', '#8a96a8');
      body(12, 6, '#ff6a2b', '#d9481a');
      ctx.restore();
      // The ember pulses.
      ctx.fillStyle = '#ff7a2e';
      ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t * 5);
      ctx.beginPath();
      ctx.arc(37, 22, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      image.data.set(ctx.getImageData(0, 0, size, size).data);
      map?.triggerRepaint();
      return true;
    },
  };
  return image;
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
const DOT_RADIUS = ['interpolate', ['linear'], ['zoom'], 0, 2.4, 3, 3.6, 6, 9, 9, 13, 14, 16];
/** Larger, so a cigarette and its number fit in the dot as well as an AQI number does. */
const DOT_RADIUS_SMOKE = ['interpolate', ['linear'], ['zoom'], 0, 2.6, 3, 4, 6, 12, 9, 17, 14, 20];
const LABEL_SIZE = ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 16];
const LABEL_SIZE_SMOKE = ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 15];

/** Picture pixels to a degree for a zoom: about one for each screen pixel. */
const pxPerDegAt = (zoom: number): number => (512 * 2 ** zoom) / 360;
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
  onReportFire,
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
  /** Called when the person presses "Report this fire" in a fire's popup. */
  readonly onReportFire?: (fire: Fire) => void;
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>();
  const ready = useRef(false);
  const redrawField = useRef<(() => void) | undefined>(undefined);
  const latest = useRef({ layers, smoke, air, monitors, fires, sample, start, onReportFire });
  latest.current = { layers, smoke, air, monitors, fires, sample, start, onReportFire };

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

    // The air is dust, built for what is on screen (finer as you come in) when the map has stopped moving, and
    // redrawn a few times a second so each speck jostles about its place.
    const dustTiles: DustTile[] = FIELD_TILES.map(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      return { canvas, ctx, image: undefined, dust: undefined };
    });
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = (tile: DustTile, source: CanvasPlacer, ms: number): void => {
      if (tile.dust === undefined || tile.image === undefined || tile.ctx === null) return;
      paintDust(tile.dust, tile.image.data, ms);
      tile.ctx.putImageData(tile.image, 0, 0);
      // The source refreshes its texture only while it plays, so play for one frame.
      source.play();
      window.requestAnimationFrame(() => {
        source.pause();
      });
    };
    const draw = (): void => {
      if (!ready.current) return;
      const { air: monitorsForField, layers: on } = latest.current;
      const zoom = m.getZoom();
      const bounds = m.getBounds();
      const view = {
        west: bounds.getWest(),
        east: bounds.getEast(),
        south: Math.max(-80, bounds.getSouth()),
        north: Math.min(80, bounds.getNorth()),
      };
      FIELD_TILES.forEach((tile, i) => {
        const id = FIELD_IDS[i] ?? '';
        const dustTile = dustTiles[i];
        const source = m.getSource(id) as unknown as CanvasPlacer | undefined;
        if (dustTile === undefined || source === undefined || !('setCoordinates' in source)) return;
        // Zoomed right out, the whole tile; otherwise only the part of it that is in view.
        const window = zoom < 2.5 ? tile : visibleWindow(tile, view);
        if (m.getLayer(id) === undefined) return;
        if (window === undefined || monitorsForField.length === 0 || dustTile.ctx === null) {
          dustTile.dust = undefined;
          m.setLayoutProperty(id, 'visibility', 'none');
          return;
        }
        if (on.gradient) m.setLayoutProperty(id, 'visibility', 'visible');
        const { width, height } = dustSize(window, pxPerDegAt(zoom));
        if (dustTile.canvas.width !== width || dustTile.canvas.height !== height) {
          dustTile.canvas.width = width;
          dustTile.canvas.height = height;
          dustTile.image = dustTile.ctx.createImageData(width, height);
        }
        dustTile.dust = buildDust(monitorsForField, window, width, height);
        source.setCoordinates([
          [window.west, window.north],
          [window.east, window.north],
          [window.east, window.south],
          [window.west, window.south],
        ]);
        frame(dustTile, source, performance.now());
      });
    };
    redrawField.current = draw;
    let fieldTimer: ReturnType<typeof setTimeout> | undefined;
    m.on('moveend', () => {
      if (fieldTimer !== undefined) clearTimeout(fieldTimer);
      fieldTimer = setTimeout(draw, 140);
    });
    // The jostling: a few frames a second, only while the page is shown and motion is welcome.
    const jostle =
      reduced || typeof window === 'undefined'
        ? undefined
        : window.setInterval(() => {
            if (document.hidden || !ready.current) return;
            const now = performance.now();
            FIELD_TILES.forEach((_, i) => {
              const dustTile = dustTiles[i];
              const source = m.getSource(FIELD_IDS[i] ?? '') as unknown as CanvasPlacer | undefined;
              if (dustTile?.dust === undefined || source === undefined) return;
              frame(dustTile, source, now);
            });
          }, 130);

    const addLayers = (): void => {
      ready.current = true;
      if (m.getSource('field-0') !== undefined) return;
      const { layers: on } = latest.current;
      // A globe at country level looks flat, and MapLibre flattens it again as you zoom right in.
      m.setProjection({ type: 'globe' });
      FIELD_TILES.forEach((tile, i) => {
        const id = FIELD_IDS[i] ?? `field-${String(i)}`;
        m.addSource(id, {
          type: 'canvas',
          canvas: dustTiles[i]?.canvas ?? document.createElement('canvas'),
          animate: false,
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
              1,
              7,
              0.95,
              11,
              0.6,
              14,
              0.22,
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
          'circle-radius': (latest.current.smoke ? DOT_RADIUS_SMOKE : DOT_RADIUS) as never,
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
          'text-field': ['to-string', ['get', latest.current.smoke ? 'cigs' : 'aqi']] as never,
          'text-font': ['Noto Sans Bold'],
          'text-size': (latest.current.smoke ? LABEL_SIZE_SMOKE : LABEL_SIZE) as never,
          // With the cigarette switch on, the cigarette sits left of the middle of the dot and the number right.
          'icon-image': latest.current.smoke ? 'cigarette' : '',
          'icon-anchor': 'right',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.42, 12, 0.6] as never,
          'icon-offset': [-1, 0],
          'text-anchor': latest.current.smoke ? 'left' : 'center',
          'text-offset': [0.1, 0],
          'icon-allow-overlap': false,
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
      if (!m.hasImage('cigarette'))
        m.addImage(
          'cigarette',
          cigaretteImage(() => latest.current.smoke),
          { pixelRatio: 2 },
        );
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
      draw();
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
    // A fire opens its details, with a button to report it. The flame is small, so a press near it counts.
    m.on('click', (event) => {
      const ids = ['fires', 'fires-dot'].filter((id) => m.getLayer(id) !== undefined);
      if (ids.length === 0) return;
      const { x, y } = event.point;
      const hit = m
        .queryRenderedFeatures(
          [
            [x - 16, y - 16],
            [x + 16, y + 16],
          ],
          { layers: ids },
        )
        .find((f) => f.geometry.type === 'Point');
      if (hit?.geometry.type !== 'Point') return;
      const [lng, lat] = hit.geometry.coordinates as [number, number];
      const p = hit.properties as { frp?: number; hoursAgo?: number };
      const fire: Fire = {
        id: String(hit.properties.id ?? ''),
        lat,
        lng,
        frp: p.frp ?? 0,
        hoursAgo: p.hoursAgo ?? 0,
      };
      const box = document.createElement('div');
      box.className = 'map-popup';
      const title = document.createElement('strong');
      title.textContent = 'Fire seen by satellite';
      const body = document.createElement('p');
      body.textContent = `Seen about ${String(fire.hoursAgo)} h ago · power ${String(fire.frp)} MW`;
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = latest.current.sample
        ? 'Sample data'
        : 'A heat spot from NASA satellites. It may be a crop fire, a kiln or a flare.';
      const report = document.createElement('button');
      report.type = 'button';
      report.className = 'popup-button';
      report.textContent = 'Report this fire';
      const popup = new Popup({ closeButton: false, offset: 14 })
        .setLngLat([lng, lat])
        .setDOMContent(box)
        .addTo(m);
      report.addEventListener('click', () => {
        popup.remove();
        latest.current.onReportFire?.(fire);
      });
      box.append(title, body, note, report);
    });
    m.on('mouseenter', 'monitors-dot', () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'monitors-dot', () => {
      m.getCanvas().style.cursor = '';
    });

    onReady(m);
    return () => {
      if (fieldTimer !== undefined) clearTimeout(fieldTimer);
      if (jostle !== undefined) window.clearInterval(jostle);
      redrawField.current = undefined;
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
    void m.getSource<GeoJSONSource>('monitors')?.setData(monitorsGeoJson(monitors));
  }, [monitors]);

  // The cigarette switch changes the numbers on the map from AQI to cigarettes a day, straight away, with a moving
  // cigarette before each number, and makes the dots and numbers a little larger to hold them.
  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current || m.getLayer('monitors-label') === undefined) return;
    m.setLayoutProperty('monitors-label', 'text-field', [
      'to-string',
      ['get', smoke ? 'cigs' : 'aqi'],
    ]);
    m.setLayoutProperty('monitors-label', 'icon-image', smoke ? 'cigarette' : '');
    m.setLayoutProperty('monitors-label', 'text-anchor', smoke ? 'left' : 'center');
    m.setLayoutProperty(
      'monitors-label',
      'text-size',
      (smoke ? LABEL_SIZE_SMOKE : LABEL_SIZE) as never,
    );
    m.setPaintProperty(
      'monitors-dot',
      'circle-radius',
      (smoke ? DOT_RADIUS_SMOKE : DOT_RADIUS) as never,
    );
    if (smoke) m.triggerRepaint();
  }, [smoke]);

  // The air colour is drawn again when the monitors change or the layer is switched; the map itself redraws it when
  // it has stopped moving.
  useEffect(() => {
    redrawField.current?.();
  }, [air, layers.gradient]);

  useEffect(() => {
    const m = map.current;
    if (m === undefined || !ready.current) return;
    void m.getSource<GeoJSONSource>('fires')?.setData(firesGeoJson(fires));
  }, [fires]);

  return <div ref={container} className="map-view" />;
}
