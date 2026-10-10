import { ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import { HashRouter, Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { PlacesScreen } from './places/ui/PlacesScreen';
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
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> Places
          </Link>
        }
      />
    </>
  );
}

export function App(): React.JSX.Element {
  return (
    <HashRouter>
      <div className="bar">
        <Link to="/" className="wordmark">
          Vayu Air
        </Link>
      </div>
      <Routes>
        <Route path="/" element={<PlacesScreen />} />
        <Route path="/place/:id" element={<PlaceRoute />} />
        <Route path="*" element={<PlacesScreen />} />
      </Routes>
    </HashRouter>
  );
}
