import { Plus, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTodays } from '../air/store';
import { usePins } from '../places/usePins';
import { tasksFor, type Task } from '../tasks/model';
import { schoolTasksFor } from '../tasks/school';
import { HOUSEHOLD_CHANGED, dayPlaces } from './dayPlaces';
import { AlertsList } from '../alerts/ui/AlertsList';
import { alertsFor, type Alert } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { TipsCard } from '../tasks/ui/TipsCard';
import { AddDeviceSheet } from '../devices/ui/AddDeviceSheet';
import { applyPreset } from '../places/preset';
import { PlacesPanel } from '../places/ui/PlacesPanel';
import type { PlaceMatch } from '../data/geocode';

interface Props {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: React.ComponentProps<typeof PlacesPanel>['locate'];
  readonly address?: React.ComponentProps<typeof PlacesPanel>['address'];
}

/** Place names as a plain list: "Home", "Home and Park", "Home, School and Office". */
const listNames = (names: readonly string[]): string =>
  names.length < 3
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** The home tab: your places, with your measuring unit's room first, and a button to add a device. */
export function MyAirScreen({ search, locate, address }: Props): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  // `?add=device` (and the old `?tab=devices`) opens the add-device sheet, for links from other screens.
  const [adding, setAdding] = useState(
    params.get('add') === 'device' || params.get('tab') === 'devices',
  );
  const { pins } = usePins();
  // The tips and alerts are for the day as it is set: home, school, work. A phone on the move is not a place the
  // day can be arranged around, so where it is does not decide them.
  const [householdVersion, setHouseholdVersion] = useState(0);
  useEffect(() => {
    const again = (): void => {
      setHouseholdVersion((n) => n + 1);
    };
    window.addEventListener(HOUSEHOLD_CHANGED, again);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHANGED, again);
    };
  }, []);
  const places = useMemo(
    () => dayPlaces(window.localStorage, pins),
    // `householdVersion` is read so a change to the family or their places works the day out again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins, householdVersion],
  );
  const readings = useTodays(places.map((p) => p.pin));
  const home = places.find((p) => p.role === 'home') ?? places[0];
  const homeReading = home === undefined ? undefined : readings.get(home.pin.id);
  const reading = homeReading?.status === 'ready' ? homeReading.data : undefined;
  const fires = useFires(home?.pin, reading?.hourly[0]?.weather?.windFromDeg);
  const many = places.length > 1;

  // The lines about school assembly are for a person who has a school among their places.
  const hasSchool = places.some((p) => p.role === 'school');

  const tips = useMemo(() => {
    const out: Task[] = [];
    for (const place of places) {
      const loaded = readings.get(place.pin.id);
      if (loaded?.status !== 'ready') continue;
      if (place.role === 'home')
        out.push(...tasksFor(loaded.data).map((t) => (many ? { ...t, place: place.pin.name } : t)));
      else if (place.role === 'school')
        out.push(
          ...schoolTasksFor(
            loaded.data,
            { name: place.pin.name, key: place.key },
            place.people
              .filter((e) => e.person.day === 'school')
              .map((e) => ({
                person: e.person.id === 'me' ? { ...e.person, name: 'You' } : e.person,
                hours: e.hours,
              })),
          ),
        );
    }
    return out.slice(0, 8);
  }, [places, readings, many]);

  const alerts = useMemo(() => {
    const merged = new Map<string, Alert & { readonly names: readonly string[] }>();
    for (const place of places) {
      const loaded = readings.get(place.pin.id);
      if (loaded?.status !== 'ready') continue;
      for (const alert of alertsFor(loaded.data, fires, { school: hasSchool })) {
        const key = `${alert.title}|${String(alert.day)}`;
        const have = merged.get(key);
        merged.set(
          key,
          have === undefined
            ? { ...alert, names: [place.pin.name] }
            : { ...have, names: [...have.names, place.pin.name] },
        );
      }
    }
    return [...merged.values()]
      .map(({ names, ...alert }) => (many ? { ...alert, place: listNames(names) } : alert))
      .sort(
        (a, b) =>
          (a.severity === 'severe' ? 0 : 1) - (b.severity === 'severe' ? 0 : 1) || a.day - b.day,
      );
  }, [places, readings, fires, many, hasSchool]);
  const names = places.map((p) => p.pin.name).join(' · ');
  return (
    <div className="page places">
      <header className="place">
        <div className="my-air-title">
          <h1>My Air</h1>
          <button
            type="button"
            className="add-device-button"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Add device
          </button>
        </div>
        {pins.length === 0 && (
          <p className="preset-line">
            <button
              type="button"
              className="preset-button"
              onClick={() => {
                applyPreset(window.localStorage);
              }}
            >
              <Wand2 size={16} strokeWidth={2.25} aria-hidden="true" /> Use preset
            </button>
            <span className="muted small">
              A family with Home, School, Office and Park, read live. Replace them with your own any
              time.
            </span>
          </p>
        )}
      </header>
      {home !== undefined && reading !== undefined && (
        <div className="places-main tasks-wrap">
          {(tips.length > 0 || alerts.length > 0) && (
            <TipsCard
              tips={tips}
              placeName={names}
              alerts={alerts.length > 0 ? <AlertsList alerts={alerts} data={reading} /> : undefined}
            />
          )}
        </div>
      )}
      {adding && (
        <AddDeviceSheet
          onClose={() => {
            setAdding(false);
            if (params.has('add') || params.has('tab')) setParams({}, { replace: true });
          }}
        />
      )}
      <main className="places-main">
        <PlacesPanel
          {...(search !== undefined ? { search } : {})}
          {...(locate !== undefined ? { locate } : {})}
          {...(address !== undefined ? { address } : {})}
        />
      </main>
    </div>
  );
}
