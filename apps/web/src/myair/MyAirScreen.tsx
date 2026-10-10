import { Cpu, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readingForPin } from '../places/placeSample';
import { usePins } from '../places/usePins';
import { tasksFor } from '../tasks/model';
import { TasksCard } from '../tasks/ui/TasksCard';
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
  const tasks = useMemo(() => (first === undefined ? [] : tasksFor(readingForPin(first))), [first]);
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
      {first !== undefined && tasks.length > 0 && (
        <div className="places-main tasks-wrap">
          <TasksCard tasks={tasks} placeName={first.name} />
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
