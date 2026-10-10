import { useSearchParams } from 'react-router-dom';
import { DevicesPanel } from '../devices/ui/DevicesPanel';
import { PlacesPanel } from '../places/ui/PlacesPanel';
import type { PlaceMatch } from '../data/geocode';

interface Props {
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  readonly locate?: React.ComponentProps<typeof PlacesPanel>['locate'];
}

const TABS = [
  { id: 'places', label: 'Places' },
  { id: 'devices', label: 'Devices' },
] as const;

/** The home tab: your places and your devices. */
export function MyAirScreen({ search, locate }: Props): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'devices' ? 'devices' : 'places';
  return (
    <div className="page places">
      <header className="place">
        <h1>My Air</h1>
        <div className="tabs" role="tablist" aria-label="My Air">
          {TABS.map(({ id, label }) => (
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
              {label}
            </button>
          ))}
        </div>
      </header>
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
