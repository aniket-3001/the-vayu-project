import { Cpu, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readingForPin } from '../places/placeSample';
import { usePins } from '../places/usePins';
import { tasksFor } from '../tasks/model';
import { AlertsStrip } from '../alerts/ui/AlertsStrip';
import { alertsFor } from '../alerts/model';
import { useFires } from '../alerts/useFires';
import { SmokeCard } from '../units/SmokeCard';
import { TipsCard } from '../tasks/ui/TipsCard';
import { DevicesPanel } from '../devices/ui/DevicesPanel';
import { PlacesPanel } from '../places/ui/PlacesPanel';
import type { PlaceMatch } from '../data/geocode';

interface Props {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: React.ComponentProps<typeof PlacesPanel>['locate'];
}

const TABS = [
  { id: 'places', label: 'Places', Icon: MapPin },
  { id: 'devices', label: 'Devices', Icon: Cpu },
] as const;

/** The home tab: your places and your devices. */
export function MyAirScreen({ search, locate }: Props): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'devices' ? 'devices' : 'places';
  const { pins } = usePins();
  const first = pins[0];
  const reading = useMemo(() => (first === undefined ? undefined : readingForPin(first)), [first]);
  const tips = useMemo(() => (reading === undefined ? [] : tasksFor(reading)), [reading]);
  const fires = useFires();
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
      {first !== undefined && reading !== undefined && (
        <div className="places-main tasks-wrap">
          <AlertsStrip alerts={alerts} data={reading} />
          <SmokeCard pm25={reading.pm25} title={`${first.name} in cigarettes`} />
          {tips.length > 0 && <TipsCard tips={tips} placeName={first.name} />}
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
          />
        ) : (
          <DevicesPanel />
        )}
      </main>
    </div>
  );
}
