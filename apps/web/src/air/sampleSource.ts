import type { MapStation } from '@vayu/contracts';
import { nowIso } from '../clock';
import type { Pin } from '../data/pins';
import { SAMPLE_TRACK, SAMPLE_UNITS } from './sampleExposure';
import { sampleFires } from '../map/fires';
import { sampleMonitors } from '../map/monitors';
import { sampleWindGrid } from '../map/wind';
import { readingForPin, sampleIdForPin } from '../places/placeSample';
import { SAMPLE_HISTORY_DAYS, sampleAmbientPm25 } from '../today/sample';
import { isoDate } from '../today/time';
import { addDays } from '../exposure/model';
import type { AirSource, HourPm } from './types';

const hourStart = (date: string, hour: number): string =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();

/**
 * Made-up air, the same every time: the prototype build and the tests run on this, never the deployed app. The
 * days come from a fixed recipe and the clock is a fixed moment, so a screen looks the same on every run.
 */
export function sampleAirSource(): AirSource {
  const history = (pin: Pin): readonly HourPm[] => {
    const id = sampleIdForPin(pin);
    const last = isoDate(nowIso());
    const hours: HourPm[] = [];
    for (let back = SAMPLE_HISTORY_DAYS; back >= 0; back--) {
      const date = addDays(last, -back);
      sampleAmbientPm25(id, date).forEach((pm25, hour) => {
        if (pm25 !== undefined) hours.push({ t: hourStart(date, hour), pm25 });
      });
    }
    return hours;
  };
  const stations = (): readonly MapStation[] =>
    sampleMonitors().map((m) => ({
      id: m.id,
      name: m.name,
      lat: m.lat,
      lng: m.lng,
      pm25: m.pm25,
      at: new Date(Date.parse(nowIso()) - m.ageMinutes * 60_000).toISOString(),
    }));
  return {
    kind: 'sample',
    peekToday: (pin) => readingForPin(pin),
    peekHistory: history,
    peekStations: stations,
    peekExposure: () => ({ units: SAMPLE_UNITS, track: SAMPLE_TRACK }),
    peekMap: () => ({ wind: sampleWindGrid(), air: sampleMonitors(), fires: sampleFires() }),
    today: (pin) => Promise.resolve(readingForPin(pin)),
    history: (pin) => Promise.resolve(history(pin)),
    stations: () => Promise.resolve(stations()),
  };
}
