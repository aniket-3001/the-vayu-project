import { ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import {
  HashRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { DemoPill } from './demo/DemoPill';
import { ExposureScreen } from './exposure/ExposureScreen';
import { LensScreen } from './lens/LensScreen';
import { MapScreen } from './map/MapScreen';
import { MyAirScreen } from './myair/MyAirScreen';
import { TabBar } from './nav/TabBar';
import { AssistantFab } from './assistant/AssistantFab';
import { AirUnitsProvider, SmokeToggle } from './units/AirUnits';
import { readingForPin, sampleIdForPin } from './places/placeSample';
import { usePins } from './places/usePins';
import { SAMPLE_IDS } from './today/sample';
import { SampleSwitcher } from './today/ui/SampleSwitcher';
import { TodayScreen } from './today/ui/TodayScreen';

function PlaceRoute(): React.JSX.Element {
  const { id = '' } = useParams();
  const { pins } = usePins();
  const [params, setParams] = useSearchParams();
  const pin = pins.find((candidate) => candidate.id === id);
  const wanted = SAMPLE_IDS.find((day) => day === params.get('day'));
  const day = wanted ?? (pin === undefined ? 'unhealthy' : sampleIdForPin(pin));
  const data = useMemo(() => (pin === undefined ? undefined : readingForPin(pin, day)), [pin, day]);

  if (data === undefined) {
    return (
      <div className="page">
        <main className="layout">
          <p className="empty">
            That place is not pinned on this device. <Link to="/">Back to your places</Link>
          </p>
        </main>
      </div>
    );
  }
  return (
    <>
      <div className="bar bar-switcher">
        <SampleSwitcher
          value={day}
          onChange={(next) => {
            setParams({ day: next }, { replace: true });
          }}
        />
      </div>
      <TodayScreen
        data={data}
        back={
          <Link to="/" className="back">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
          </Link>
        }
      />
    </>
  );
}

/** The frame around every screen: the pinned bar, the screen, the tab bar and the assistant that stays put. */
function Frame(): React.JSX.Element {
  const route = useLocation().pathname.split('/')[1] ?? '';
  return (
    <div className="frame" data-route={route === '' ? 'home' : route}>
      <Routes>
        <Route path="/" element={<MyAirScreen />} />
        <Route path="/place/:id" element={<PlaceRoute />} />
        <Route path="/exposure" element={<ExposureScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/lens" element={<LensScreen />} />
        <Route path="*" element={<MyAirScreen />} />
      </Routes>
      {import.meta.env.VITE_DEMO === '1' && <DemoPill />}
      <div className="dock">
        <SmokeToggle />
        <AssistantFab />
      </div>
      <TabBar />
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <HashRouter>
      <AirUnitsProvider>
        <Frame />
      </AirUnitsProvider>
    </HashRouter>
  );
}
