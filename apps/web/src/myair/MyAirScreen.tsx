import { Cpu, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToday } from '../air/store';
import { useLivePin } from '../places/liveLocation';
import { usePins } from '../places/usePins';
import { tasksFor } from '../tasks/model';
import { AlertsList } from '../alerts/ui/AlertsList';
import { alertsFor } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { TipsCard } from '../tasks/ui/TipsCard';
import { DevicesPanel } from '../devices/ui/DevicesPanel';
import { PlacesPanel } from '../places/ui/PlacesPanel';
import type { PlaceMatch } from '../data/geocode';

interface Props {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: React.ComponentProps<typeof PlacesPanel>['locate'];
  readonly address?: React.ComponentProps<typeof PlacesPanel>['address'];
}

const TABS = [
  { id: 'places', label: 'Places', Icon: MapPin },
  { id: 'devices', label: 'Devices', Icon: Cpu },
] as const;

/** The home tab: your places and your devices. */
export function MyAirScreen({ search, locate, address }: Props): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'devices' ? 'devices' : 'places';
  const { pins } = usePins();
  // The alerts are for where the device is while live location is on, else the first place pinned.
  const livePin = useLivePin();
  const first = livePin ?? pins[0];
  const state = useToday(first);
  const reading = state?.status === 'ready' ? state.data : undefined;
  const tips = useMemo(() => (reading === undefined ? [] : tasksFor(reading)), [reading]);
  const fires = useFires(first, reading?.hourly[0]?.weather?.windFromDeg);
  const alerts = useMemo(
    () => (reading === undefined ? [] : alertsFor(reading, fires)),
    [reading, fires],
  );
  return (
    <div className="page places">
      <header className="place">
        <h1>My Air</h1>
        <div className="tabs" role="tablist" aria-label="My Air">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => {
                setParams(id === 'places' ? {} : { tab: id }, { replace: true });
              }}
            >
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>
      {tab === 'places' && first !== undefined && reading !== undefined && (
        <div className="places-main tasks-wrap">
          {(tips.length > 0 || alerts.length > 0) && (
            <TipsCard
              tips={tips}
              placeName={first.name}
              alerts={alerts.length > 0 ? <AlertsList alerts={alerts} data={reading} /> : undefined}
            />
          )}
        </div>
      )}
      <main
        className="places-main"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'places' ? (
          <PlacesPanel
            {...(search !== undefined ? { search } : {})}
            {...(locate !== undefined ? { locate } : {})}
            {...(address !== undefined ? { address } : {})}
          />
        ) : (
          <DevicesPanel />
        )}
      </main>
    </div>
  );
}
