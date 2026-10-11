import { ChevronLeft } from 'lucide-react';
import { HashRouter, Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { DemoPill } from './demo/DemoPill';
import { DemoPlaceRoute } from './demo/DemoPlaceRoute';
import { ExposureScreen } from './exposure/ExposureScreen';
import { LensScreen } from './lens/LensScreen';
import { MapScreen } from './map/MapScreen';
import { MyAirScreen } from './myair/MyAirScreen';
import { TabBar } from './nav/TabBar';
import { DockButtons } from './nav/Dock';
import { AirUnitsProvider } from './units/AirUnits';
import { airStore, useToday } from './air/store';
import { AirError, AirLoading } from './components/AirState';
import { useLivePin } from './places/liveLocation';
import { usePins } from './places/usePins';
import { TodayScreen } from './today/ui/TodayScreen';

function PlaceRoute(): React.JSX.Element {
  const { id = '' } = useParams();
  const { pins } = usePins();
  const livePin = useLivePin();
  const pin = id === 'live' ? livePin : pins.find((candidate) => candidate.id === id);
  const state = useToday(pin);

  if (pin === undefined) {
    return (
      <div className="page">
        <main className="layout">
          <p className="empty">
            That place is not pinned on this device (or live location is off).{' '}
            <Link to="/">Back to your places</Link>
          </p>
        </main>
      </div>
    );
  }
  const back = (
    <Link to="/" className="back">
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> My Air
    </Link>
  );
  if (state?.status !== 'ready') {
    return (
      <div className="page">
        <header className="place">
          {back}
          <h1>{pin.name}</h1>
        </header>
        <main className="layout">
          {state?.status === 'error' ? (
            <AirError
              message={state.message}
              onRetry={() => {
                airStore().ensureToday(pin, true);
              }}
            />
          ) : (
            <AirLoading what={`the air at ${pin.name}`} />
          )}
        </main>
      </div>
    );
  }
  return (
    <TodayScreen
      data={{ ...state.data, place: { ...state.data.place, name: pin.name } }}
      back={back}
    />
  );
}

/** The frame around every screen: the pinned bar, the screen, the tab bar and the assistant that stays put. */
function Frame(): React.JSX.Element {
  const route = useLocation().pathname.split('/')[1] ?? '';
  return (
    <div className="frame" data-route={route === '' ? 'home' : route}>
      <Routes>
        <Route path="/" element={<MyAirScreen />} />
        <Route
          path="/place/:id"
          element={import.meta.env.VITE_DEMO === '1' ? <DemoPlaceRoute /> : <PlaceRoute />}
        />
        <Route path="/exposure" element={<ExposureScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/lens" element={<LensScreen />} />
        <Route path="*" element={<MyAirScreen />} />
      </Routes>
      {import.meta.env.VITE_DEMO === '1' && <DemoPill />}
      {route !== 'map' && route !== 'lens' && (
        <div className="dock">
          <DockButtons />
        </div>
      )}
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
